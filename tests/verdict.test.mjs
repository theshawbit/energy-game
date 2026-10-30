// Unit tests for v5 Phase 6 — the overlord's quarterly verdict (src/live/verdict.js) and
// the stagnation-not-death guarantee. settleQuarter is PURE from S.quarterLog + S.economy
// + S.calendar; applyVerdict is the only mutator. Failure must stall growth + tighten
// credit, NEVER set a game-over. Deterministic (no RNG in the pure path; pinned where a
// sim loop runs). Run: `npm test`.
import { freshQuarterLog, freshEconomy, settleQuarter, applyVerdict } from "../src/live/verdict.js";
import { createGame, surviveDay, step } from "../src/live/sim.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}

// Build a minimal state for the PURE settleQuarter path. `kpiAvg` + `weight` set the
// time-weighted KPI accumulators; `base` overrides the other log fields. The calendar is
// already rolled into the new quarter (so the closed quarter = calendar.quarter − 1).
function st({ kpiAvg = { reliability: 100, efficiency: 100, output: 100, flexibility: 100 }, weight = 1, base = {} } = {}, cal = { year: 1, quarter: 2 }) {
  const q = freshQuarterLog();
  Object.assign(q, base);
  q.kpiWeight = weight;
  for (const k of Object.keys(kpiAvg)) q.kpiAccum[k] = kpiAvg[k] * weight;
  return { calendar: { ...cal }, economy: freshEconomy(), quarterLog: q, cash: 100000 };
}

// 5) settleQuarter grades and ratchets — a strong quarter earns, a weak one is squeezed.
{
  const strong = st({ kpiAvg: { reliability: 95, efficiency: 95, output: 95, flexibility: 95 }, weight: 100,
    base: { servedMWh: 10000, shortfallMWh: 0, emissions: 1000, swingPay: 50000 } });
  const vs = settleQuarter(strong);
  check("a strong quarter grades high, earns a bonus, lifts the floor rate",
    vs.grade > CFG.v5.econ.gradeNeutral && vs.bonus > 0 && vs.fine === 0 && vs.floorRateNext > vs.floorRate,
    `grade ${vs.grade.toFixed(2)}, +$${vs.bonus}, rate ${vs.floorRate}→${vs.floorRateNext}`);
  check("the verdict names the quarter that just closed (Y1 Q1)", vs.year === 1 && vs.quarter === 1);

  const weak = st({ kpiAvg: { reliability: 30, efficiency: 30, output: 30, flexibility: 30 }, weight: 100,
    base: { servedMWh: 4000, shortfallMWh: 6000, emissions: 5000 } });
  const vw = settleQuarter(weak);
  check("a weak quarter grades low, draws a fine, squeezes the floor rate",
    vw.grade < CFG.v5.econ.gradeNeutral && vw.fine > 0 && vw.bonus === 0 && vw.floorRateNext < vw.floorRate,
    `grade ${vw.grade.toFixed(2)}, −$${vw.fine}, rate ${vw.floorRate}→${vw.floorRateNext}`);
  check("the rate ratchet is clamped to its band", vw.floorRateNext >= CFG.v5.econ.floorRateMin && vs.floorRateNext <= CFG.v5.econ.floorRateMax);
  check("the barbed note differs between a strong and a weak quarter", vs.note !== vw.note && vs.note.length > 0);
  check("settleQuarter is deterministic (same log → same verdict)",
    JSON.stringify(settleQuarter(weak)) === JSON.stringify(vw));
}

// 6) Clean standing folds in — lower emissions intensity improves the grade.
{
  const common = { kpiAvg: { reliability: 80, efficiency: 80, output: 80, flexibility: 80 }, weight: 50 };
  const clean = settleQuarter(st({ ...common, base: { servedMWh: 10000, emissions: 500 } }));
  const dirty = settleQuarter(st({ ...common, base: { servedMWh: 10000, emissions: 5000 } }));
  check("a cleaner quarter scores higher clean standing and a higher grade",
    clean.cleanScore > dirty.cleanScore && clean.grade > dirty.grade,
    `clean ${clean.cleanScore.toFixed(2)} vs ${dirty.cleanScore.toFixed(2)}`);
}

// 7) Default is PAIN, not death — applyVerdict stalls growth, never ends the game.
{
  const weak = st({ kpiAvg: { reliability: 20, efficiency: 20, output: 20, flexibility: 20 }, weight: 100,
    base: { servedMWh: 2000, shortfallMWh: 8000, emissions: 6000 } });
  const S = weak; const cash0 = S.cash;
  const v = settleQuarter(S);
  applyVerdict(S, v);
  check("applyVerdict banks the fine (cash falls) and sets next quarter's floor rate",
    S.cash === cash0 + v.bonus - v.fine && S.economy.floorRate === v.floorRateNext);
  check("a wrecked quarter stalls growth (the stagnation lever) …", S.economy.growthStall > 0 && S.economy.growthStall <= CFG.v5.econ.growthStallMax);
  check("… but NEVER sets a game-over flag", S.over === undefined && S.won === undefined);
  const strongS = st({ kpiAvg: { reliability: 95, efficiency: 95, output: 95, flexibility: 95 }, weight: 100, base: { servedMWh: 10000 } });
  applyVerdict(strongS, settleQuarter(strongS));
  check("a quarter that kept the city lit does not stall growth", strongS.economy.growthStall === 0);
}

// 8) The re-tune holds the day — a modeled chronic brownout escalates strain over time,
//    is never instant, never free, and never ends the game.
{
  const realRandom = Math.random; Math.random = () => 0.5;
  try {
    const S = createGame(); S.calm = true; S.fleet = []; // no capacity → a sustained shortfall
    const cash0 = S.cash;
    step(S, 1); const s1 = S.strain;
    step(S, 1); const s2 = S.strain;
    check("strain escalates across seconds of shortfall (not pinned in a single tick)",
      s1 > 0 && s1 < 100 && s2 > s1, `strain ${s1.toFixed(1)} → ${s2.toFixed(1)}`);
    for (let i = 0; i < 8; i++) step(S, 1);
    check("a sustained shortfall costs cash (never a free ride)", S.cash < cash0);
    check("and the grid keeps running — no game-over, ever", S.over === undefined && S.won === undefined);
  } finally { Math.random = realRandom; }
}

// 9) Wages + build overruns settle in the quarter's PnL (closing the Phase 4/5 seams).
{
  const v = settleQuarter(st({ base: { floorPay: 0, swingPay: 2000, wages: 1200, overruns: 500, breachFines: 300 } }));
  check("quarter PnL = floor + swing − wages − overruns − breach fines",
    v.pnl === 2000 - 1200 - 500 - 300, `pnl ${v.pnl}`);

  // rollover integration: driving a quarter boundary settles a real verdict and resets
  // the log; wages are pulled from the crew pool into the quarter's books.
  const realRandom = Math.random; Math.random = () => 0.5;
  try {
    const S = createGame();
    S.quarterLog.servedMWh = 5000; S.quarterLog.swingPay = 8000; S.quarterLog.kpiWeight = 10;
    for (const k of Object.keys(S.quarterLog.kpiAccum)) S.quarterLog.kpiAccum[k] = 85 * 10;
    S.calendar.dayInQuarter = CFG.v5.daysPerQuarter; // the next advance rolls the quarter
    surviveDay(S);
    check("the rollover settles a verdict (with a numeric PnL) and enters the board review",
      !!S.economy.lastVerdict && typeof S.economy.lastVerdict.pnl === "number" && S.calendar.mode === "planning");
    check("the quarter log reset for the new quarter (wages/served cleared)",
      S.quarterLog.servedMWh === 0 && S.quarterLog.swingPay === 0 && S.quarterLog.wages === 0);
    check("the rollover never ends the game", S.over === undefined);
  } finally { Math.random = realRandom; }
}

console.log(failed === 0 ? "\nAll verdict tests passed." : `\n${failed} verdict test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
