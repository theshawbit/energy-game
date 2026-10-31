// Unit tests for v4 multi-track scoring (Phase D). No DOM. Run: `npm test`.
// Pins the four score tracks, their ⚡ conversion, record-keeping, and the hard
// isolation between the two cross-run writers (currency vs credit standing).
import { CFG } from "../src/live/config.js";
import { CLEAN_TECHS, SCORE_TRACKS, scoreTracks, awardCurrency, ECONOMY_UNLOCKS, buyEconomyUnlock } from "../src/live/meta.js";
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

// 3) SCORE_TRACKS stay defined (the per-track records + stats hub still read them) even though
//    the end-of-run ⚡ award (currencyForRun) is retired in v5.1 Phase 6 — ⚡ now mints quarterly.
{
  check("SCORE_TRACKS still cover the four tracks", SCORE_TRACKS.map(t => t.id).sort().join() === ["cleanShare","longevity","netWorth","spotKill"].sort().join());
  const S = { day: 6, peakNetWorth: 600000, cleanMWh: 500, servedMWh: 1000, bestSpotKill: 40000 };
  const t = scoreTracks(S);
  check("every track still has a reward curve", SCORE_TRACKS.every(tr => Number.isFinite(tr.reward(t[tr.id]))));
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

// 7) buyEconomyUnlock spends only currency, is idempotent
{
  const p = { currency: 10, economyUnlocked: {}, credit: { standing: 70, history: [] } };
  check("buyEconomyUnlock buys an affordable unlock + charges currency", buyEconomyUnlock(p, "special-offers") && p.economyUnlocked["special-offers"] === true && p.currency === 6);
  check("buyEconomyUnlock refuses an already-owned unlock", !buyEconomyUnlock(p, "special-offers"));
  check("buyEconomyUnlock leaves the credit thread untouched", p.credit.standing === 70 && p.credit.history.length === 0);
  const broke = { currency: 0, economyUnlocked: {} };
  check("buyEconomyUnlock refused when broke", !buyEconomyUnlock(broke, "capacity-market"));
}

console.log(failed === 0 ? "\nAll meta tests passed." : `\n${failed} meta test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
