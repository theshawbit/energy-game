// Unit tests for v5.3 Phase 5 (H7) — LATE-GAME AGING NON-DEGENERACY (no DOM). Run: `npm test`.
// The audit asked for proof that a long persistent run doesn't degenerate: the aging multiplier
// that lifts trip risk must PLATEAU, so a day-400 plant isn't a guaranteed-trip plant. These pin
// the cap and its effect on the trip hazard — and that KPI health still gates trips at any age.
import { agingDiff, tripHazard, dailyStrainProb } from "../src/live/sim.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}

const cap = CFG.outageRampCap, ramp = CFG.outageRamp, SPD = CFG.secondsPerDay;
// per-game-day trip probability the hazard integrates to, for a reference-reliability plant.
const pDay = (u, diff) => 1 - Math.exp(-tripHazard(u, diff) * SPD);

// 1) The aging multiplier is 1 on day 1 and rises with the run.
{
  check("day 1 has no aging (diff = 1)", agingDiff(1) === 1);
  check("the multiplier rises over the opening days", agingDiff(11) > agingDiff(1) && agingDiff(11) === 1 + 10 * ramp);
}

// 2) …and then PLATEAUS at the cap — the whole point of H7. Day 400 and day 10 000 are identical,
//    and both equal the cap (not the uncapped 1 + 399·ramp ≈ 40.9 that would make trips certain).
{
  const uncapped = 1 + (400 - 1) * ramp;
  check("the multiplier hard-caps at outageRampCap", agingDiff(400) === cap && agingDiff(10000) === cap,
    `agingDiff(400)=${agingDiff(400)} cap=${cap}`);
  check("the cap actually binds (uncapped would be far higher)", uncapped > cap, `uncapped ${uncapped.toFixed(1)} > cap ${cap}`);
}

// 3) The cap keeps a NEGLECTED plant off the certain-trip cliff. A worn plant (reliability in the
//    punishing mid-band) at day 400 trips far less often under the cap than it would uncapped —
//    the difference between "risky" and "every day, guaranteed".
{
  const worn = { kpis: { reliability: 50 }, fail: CFG.tripRefFail }; // 50% → the table's 0.18/day benchmark at diff 1
  const capped = pDay(worn, agingDiff(400));
  const uncapped = pDay(worn, 1 + (400 - 1) * ramp);
  check("a neglected day-400 plant is risky but NOT a guaranteed trip", capped < 0.95, `pDay ${(capped * 100).toFixed(1)}%`);
  check("the cap materially lowers the trip rate vs uncapped aging", capped < uncapped - 0.01,
    `capped ${(capped * 100).toFixed(1)}% < uncapped ${(uncapped * 100).toFixed(1)}%`);
}

// 4) KPI health still gates trips at ANY age — a well-kept plant (≥85% reliability) is immune even
//    at the aging cap. Aging never overrides maintenance; it only sharpens neglect.
{
  const healthy = { kpis: { reliability: 85 }, fail: CFG.tripRefFail };
  const pristine = { kpis: { reliability: 100 }, fail: CFG.tripRefFail };
  check("the trip table is 0 at ≥85% (the immunity benchmark)", dailyStrainProb(85) === 0 && dailyStrainProb(100) === 0);
  check("a healthy plant never trips, even at the day-400 aging cap",
    tripHazard(healthy, agingDiff(400)) === 0 && tripHazard(pristine, agingDiff(400)) === 0);
}

// 5) The hazard stays finite and non-negative across the whole life of a run (no NaN/∞ degeneracy).
{
  const worn = { kpis: { reliability: 45 }, fail: CFG.tripRefFail };
  let okAll = true;
  for (let d = 1; d <= 500; d += 7){ const h = tripHazard(worn, agingDiff(d)); if (!(h >= 0 && Number.isFinite(h))) okAll = false; }
  check("trip hazard is finite & non-negative every week to day 500", okAll);
}

console.log(failed === 0 ? "\nAll aging tests passed." : `\n${failed} aging test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
