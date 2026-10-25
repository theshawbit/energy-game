// Unit tests for v4 multi-track scoring (Phase D). No DOM. Run: `npm test`.
// Pins the four score tracks, their ⚡ conversion, record-keeping, and the hard
// isolation between the two cross-run writers (currency vs credit standing).
import { CFG } from "../src/live/config.js";
import { CLEAN_TECHS, SCORE_TRACKS, scoreTracks, currencyForRun, awardCurrency, updateRecords, ECONOMY_UNLOCKS, buyEconomyUnlock, runLengthFor } from "../src/live/meta.js";
import { commitCreditStanding } from "../src/live/finance.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// 1) CLEAN_TECHS: renewables + nuclear + abated fossil clean; raw coal/gas not
check("CLEAN_TECHS includes CCS + nuclear, excludes raw coal/peaker",
  CLEAN_TECHS.has("nuclear") && CLEAN_TECHS.has("ccs_coal") && CLEAN_TECHS.has("ccs_gas") && !CLEAN_TECHS.has("coal") && !CLEAN_TECHS.has("peaker"));

// 2) scoreTracks math
{
  const S = { day: 6, peakNetWorth: 500000, cleanMWh: 300, servedMWh: 1200, bestSpotKill: 80000, cash: 1, debt: 0 };
  const t = scoreTracks(S);
  check("longevity = day − 1", t.longevity === 5);
  check("netWorth = peakNetWorth", t.netWorth === 500000);
  check("cleanShare = clean/served", near(t.cleanShare, 0.25));
  check("spotKill = bestSpotKill", t.spotKill === 80000);
  check("cleanShare is 0 when nothing served", scoreTracks({ day: 1, servedMWh: 0, cleanMWh: 0 }).cleanShare === 0);
}

// 3) currencyForRun sums the four track rewards and is always ≥ 1
{
  const S = { day: 6, peakNetWorth: 600000, cleanMWh: 500, servedMWh: 1000, bestSpotKill: 40000 };
  const t = scoreTracks(S);
  const expected = Math.max(1, Math.round(SCORE_TRACKS.reduce((a, tr) => a + tr.reward(t[tr.id]), 0)));
  check("currencyForRun = Σ track rewards (≥ 1)", currencyForRun(S) === expected && expected > 1, "⚡ " + currencyForRun(S));
  const empty = { day: 1, peakNetWorth: 0, cleanMWh: 0, servedMWh: 0, bestSpotKill: 0 };
  check("currencyForRun floors at 1 for a nothing run", currencyForRun(empty) === 1);
}

// 4) updateRecords only raises bests and returns the beaten ids
{
  const profile = { records: { longevity:{value:3,at:null}, netWorth:{value:0,at:null}, cleanShare:{value:0,at:null}, spotKill:{value:0,at:null} } };
  const beaten = updateRecords(profile, { longevity: 5, netWorth: 100000, cleanShare: 0.4, spotKill: 0 }, 7);
  check("updateRecords raises beaten tracks + records the 'at'", profile.records.longevity.value === 5 && profile.records.longevity.at === 7 && profile.records.netWorth.value === 100000);
  check("updateRecords returns exactly the beaten ids", beaten.sort().join() === ["longevity","netWorth","cleanShare"].sort().join(), beaten.join());
  const again = updateRecords(profile, { longevity: 2, netWorth: 50000, cleanShare: 0.1, spotKill: 0 }, 9);
  check("updateRecords never lowers a best", again.length === 0 && profile.records.longevity.value === 5);
}

// 5) awardCurrency is additive, never negative, and rounds
{
  const p = { currency: 10 };
  awardCurrency(p, 5.4);
  check("awardCurrency adds (rounded)", p.currency === 15);
  awardCurrency(p, -100);
  check("awardCurrency never subtracts", p.currency === 15);
}

// 6) ISOLATION: awardCurrency never touches credit; commitCreditStanding never touches currency
{
  const p = { currency: 20, credit: { standing: 70, best: 70, everDefaulted: false, defaults: 0, history: [] } };
  awardCurrency(p, 8);
  check("awardCurrency leaves the credit thread untouched", p.currency === 28 && p.credit.standing === 70 && p.credit.history.length === 0);
  commitCreditStanding(p, { credit: 82, defaulted: false });
  check("commitCreditStanding leaves currency untouched", p.currency === 28 && p.credit.standing === 82);
}

// ---- Phase F: economy unlocks + run-length growth ----

// 7) buyEconomyUnlock spends only currency, is idempotent, respects prereq
{
  const p = { currency: 10, economyUnlocked: {}, credit: { standing: 70, history: [] } };
  check("buyEconomyUnlock buys an affordable unlock + charges currency", buyEconomyUnlock(p, "special-offers") && p.economyUnlocked["special-offers"] === true && p.currency === 6);
  check("buyEconomyUnlock refuses an already-owned unlock", !buyEconomyUnlock(p, "special-offers"));
  check("buyEconomyUnlock leaves the credit thread untouched", p.credit.standing === 70 && p.credit.history.length === 0);
  const pr = { currency: 100, economyUnlocked: {} };
  check("buyEconomyUnlock refuses a tier whose prereq isn't owned", !buyEconomyUnlock(pr, "runlen-2") && !pr.economyUnlocked["runlen-2"]);
  check("buyEconomyUnlock allows the tier once its prereq is owned", buyEconomyUnlock(pr, "runlen-1") && buyEconomyUnlock(pr, "runlen-2"));
  const broke = { currency: 0, economyUnlocked: {} };
  check("buyEconomyUnlock refused when broke", !buyEconomyUnlock(broke, "capacity-market"));
}

// 8) runLengthFor: base 5, growing with the Longer Shifts tiers up to 12
{
  check("runLengthFor base = 5", runLengthFor({ economyUnlocked: {} }) === 5);
  check("runLengthFor with tier 1 = 7", runLengthFor({ economyUnlocked: { "runlen-1": true } }) === 7);
  check("runLengthFor all tiers = 12", runLengthFor({ economyUnlocked: { "runlen-1": true, "runlen-2": true, "runlen-3": true } }) === 12);
}

console.log(failed === 0 ? "\nAll meta tests passed." : `\n${failed} meta test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
