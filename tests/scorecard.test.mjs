// Unit tests for v5.1 Phase 6 — the quarterly KPI → ⚡ scorecard (the faucet that fixes the
// orphaned skill currency). No DOM, no RNG. Run: `npm test`. Pins the seven metrics + two
// channels, the 50/50 mint split, within-channel monotonicity, the banking path (awardCurrency),
// that banked ⚡ survives a run-end bank, rounding/empty-log guards, and determinism/purity.
import { CFG } from "../src/live/config.js";
import { scoreQuarter, mintCurrency } from "../src/live/scorecard.js";
import { awardCurrency } from "../src/live/meta.js";
import { bankRun } from "../src/live/persist.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// A perfect-both quarter: every PnL metric and every Satisfaction metric maxes out.
//   revenue 1000, pnl 400 → margin (400/1000)/0.40 = 1 ; opCost 0 → cost 1 ;
//   capitalSunk 800 → capEff (400/800)/0.50 = 1 ; served=load → reliability 1 ;
//   avgReserve 0.25 = headroomRef → headroom 1 ; emissions 0 → clean 1 ; price 0 → afford 1.
const perfectLog = () => ({
  floorPay: 600, swingPay: 400, wages: 600, overruns: 0, breachFines: 0, shedFines: 0,
  servedMWh: 1000, shortfallMWh: 0, opCost: 0, capitalSunk: 800,
  reserveAccum: 2.5, priceAccum: 0, hours: 10, emissions: 0,
});

// 1) seven metrics in two channels, each 0..1; a perfect quarter scores 1/1
{
  const sc = scoreQuarter({ quarterLog: perfectLog() });
  const metrics = [sc.pnl.margin, sc.pnl.cost, sc.pnl.capEff, sc.sat.reliability, sc.sat.headroom, sc.sat.clean, sc.sat.affordability];
  check("exactly seven metrics across two channels", Object.keys(sc.pnl).length === 3 && Object.keys(sc.sat).length === 4);
  check("every metric is within [0,1]", metrics.every(m => m >= 0 && m <= 1), metrics.map(m => m.toFixed(2)).join(","));
  check("a perfect-both quarter scores PnL 1 / Sat 1", near(sc.pnlScore, 1) && near(sc.satScore, 1));
}

// 2) the mint pool splits 50/50 by channel, and no single channel can take the whole pool
{
  const sc = scoreQuarter({ quarterLog: perfectLog() });
  const half = CFG.v5_1.score.mintPerQuarter * CFG.v5_1.score.channelSplit; // 5
  check("perfect-both mints the two halves equally", near(sc.mintPnL, half) && near(sc.mintSat, half) && near(sc.mintTotal, CFG.v5_1.score.mintPerQuarter), `${sc.mintPnL}/${sc.mintSat}`);
  check("mintCurrency rounds the pool total", mintCurrency(sc) === Math.round(CFG.v5_1.score.mintPerQuarter));
  // a lopsided operator (great PnL, dark city) — neither channel exceeds its half of the pool
  const lop = scoreQuarter({ quarterLog: { ...perfectLog(), servedMWh: 300, shortfallMWh: 700, priceAccum: 1500 } });
  check("no channel can exceed its share of the pool", lop.mintPnL <= half + 1e-9 && lop.mintSat <= half + 1e-9);
  check("the weak-satisfaction channel mints less than the strong-PnL one", lop.mintSat < lop.mintPnL, `${lop.mintSat.toFixed(2)} < ${lop.mintPnL.toFixed(2)}`);
}

// 3) within a channel the mint is monotone — a cleaner/cheaper quarter mints more Sat ⚡
{
  const base = perfectLog();
  const dirty = scoreQuarter({ quarterLog: { ...base, emissions: 0.3, priceAccum: 400 } }); // dirtier + pricier
  const clean = scoreQuarter({ quarterLog: base });
  check("higher satisfaction mints strictly more Satisfaction ⚡", clean.mintSat > dirty.mintSat, `${clean.mintSat.toFixed(2)} > ${dirty.mintSat.toFixed(2)}`);
  check("the PnL channel is unchanged when only Sat inputs move", near(clean.mintPnL, dirty.mintPnL));
}

// 4) banking: the mint flows to profile.currency via awardCurrency (meta.js's only faucet),
//    and banked ⚡ survives the run-end bank (bankRun never touches currency)
{
  const profile = { currency: 12, records: {}, best: { days: 0, peak: 0 } };
  const minted = mintCurrency(scoreQuarter({ quarterLog: perfectLog() }));
  awardCurrency(profile, minted);
  check("the quarterly mint banks onto profile.currency", profile.currency === 12 + minted, "⚡ " + profile.currency);
  bankRun(profile, { day: 20, runStartDay: 1, peak: 900, cash: 50000, servedMWh: 1000, cleanMWh: 500, calendar: { year: 1, quarter: 2 } });
  check("banked ⚡ survives a run-end bank (restart keeps the skill tree)", profile.currency === 12 + minted);
}

// 5) rounding + empty-log guards: never negative, never NaN
{
  check("mintCurrency floors at 0", mintCurrency({ mintTotal: -3 }) === 0 && mintCurrency(null) === 0);
  const empty = scoreQuarter({ quarterLog: {} });
  const allFinite = [empty.pnlScore, empty.satScore, empty.mintTotal].every(Number.isFinite);
  check("an empty quarter log yields finite scores (no NaN)", allFinite, JSON.stringify({ p: empty.pnlScore, s: empty.satScore }));
  check("scoreQuarter tolerates a missing quarterLog entirely", Number.isFinite(scoreQuarter({}).mintTotal));
}

// 6) determinism + purity: identical logs → identical scorecards, and the log is not mutated
{
  const log = perfectLog();
  const snapshot = JSON.stringify(log);
  const a = scoreQuarter({ quarterLog: log });
  const b = scoreQuarter({ quarterLog: log });
  check("identical logs yield identical mint totals", a.mintTotal === b.mintTotal);
  check("scoreQuarter does not mutate the quarter log", JSON.stringify(log) === snapshot);
}

console.log(failed === 0 ? "\nAll scorecard tests passed." : `\n${failed} scorecard test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
