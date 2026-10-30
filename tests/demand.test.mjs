// Unit tests for v5.1 Phase 1 DEMAND CURVE (no DOM). Run: `npm test`.
// Pins the hybrid curve: a plannable per-quarter baseline that STEPS at the rollover
// (not daily), a bounded seasonal daily NOISE around it, deterministic under an injected
// stream, an honest forecast, and the regression guard that a forecast operator is never
// surprised by more than the configured noise band (the old runaway curve is gone).
import { createGame, surviveDay } from "../src/live/sim.js";
import { stepDemand, rollQuarterPeak, forecastPeak } from "../src/live/demand.js";
import { CFG } from "../src/live/config.js";
import { makeRng } from "../src/live/rng.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// 1) The baseline steps at the rollover, not daily — no per-day compounding remains.
{
  const S = createGame(); S.calm = true;
  const base0 = S.quarterPeak;
  // walk several days WITHIN the quarter: baseline must not move
  for (let i = 0; i < 5 && !S.calendar.rolledQuarter; i++){
    if (S.calendar.dayInQuarter >= CFG.v5.daysPerQuarter) break;
    surviveDay(S);
  }
  check("baseline holds within a quarter (no daily compounding)", S.quarterPeak === base0, `${base0} → ${S.quarterPeak}`);

  // a single rollQuarterPeak steps by exactly stepFrac (no stall, no skill, Y1)
  const S2 = createGame(); const b = S2.quarterPeak;
  rollQuarterPeak(S2);
  check("rollQuarterPeak steps by stepFrac", S2.quarterPeak === Math.round(b * (1 + CFG.v5_1.demand.stepFrac)),
    `${b} → ${S2.quarterPeak}`);
}

// 2) Live peak = baseline × seasonal noise; calm flattens it; the wobble never ratchets the base.
{
  const S = createGame(); S.calm = true;
  check("calm → live peak equals the baseline", stepDemand(S) === Math.round(S.quarterPeak));

  // not calm: wobble within the season's amplitude band, baseline untouched
  const N = createGame(); N.calm = false; N.rngDemand = makeRng(11);
  const base = N.quarterPeak, amp = CFG.v5_1.demand.noiseAmp.winter; // Q1 = winter
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 200; i++){ const p = stepDemand(N); lo = Math.min(lo, p); hi = Math.max(hi, p); }
  check("daily noise stays within the season band", lo >= Math.floor(base * (1 - amp)) && hi <= Math.ceil(base * (1 + amp)),
    `[${lo}, ${hi}] vs ±${(amp * 100).toFixed(0)}%`);
  check("noise never moves the baseline", N.quarterPeak === base);

  // summer swings wider than a shoulder season (amplitude is season-dependent)
  check("summer amplitude > spring amplitude", CFG.v5_1.demand.noiseAmp.summer > CFG.v5_1.demand.noiseAmp.spring);
}

// 3) Determinism: a pinned noise stream → identical daily peaks; calm → flat.
{
  const A = createGame(); A.calm = false; A.rngDemand = makeRng(42);
  const B = createGame(); B.calm = false; B.rngDemand = makeRng(42);
  const seqA = [], seqB = [];
  for (let i = 0; i < 20; i++){ seqA.push(stepDemand(A)); seqB.push(stepDemand(B)); }
  check("pinned stream → identical daily peaks", JSON.stringify(seqA) === JSON.stringify(seqB));

  const C = createGame(); C.calm = true;
  const flat = Array.from({ length: 10 }, () => stepDemand(C));
  check("calm → every day is the flat baseline", flat.every(p => p === Math.round(C.quarterPeak)));
}

// 4) Forecast is honest — it equals the baseline after n applied steps.
{
  const S = createGame();
  check("forecastPeak(0) === the current baseline", forecastPeak(S, 0) === S.quarterPeak);
  check("forecast is monotone up", forecastPeak(S, 2) > forecastPeak(S, 1) && forecastPeak(S, 1) > forecastPeak(S, 0));

  // forecasting n steps then applying n rollovers lands on (≈) the forecast value
  const F = createGame(); const want = forecastPeak(F, 3);
  rollQuarterPeak(F); rollQuarterPeak(F); rollQuarterPeak(F);
  check("forecast matches the realised baseline after n steps", Math.abs(F.quarterPeak - want) <= 2,
    `forecast ${want} vs realised ${F.quarterPeak}`);
}

// 5) Plannability invariant — the regression guard against the old runaway curve.
//    Over a full year of live days, the live peak never exceeds baseline × (1 + maxNoise).
{
  const S = createGame(); S.calm = false; S.rngDemand = makeRng(7);
  const maxAmp = Math.max(...Object.values(CFG.v5_1.demand.noiseAmp));
  const yearDays = CFG.v5.daysPerQuarter * CFG.v5.quartersPerYear;
  let worstOvershoot = 0;
  for (let i = 0; i < yearDays; i++){
    surviveDay(S); // sets S.peak off the (possibly stepped) baseline
    const ceiling = S.quarterPeak * (1 + maxAmp);
    worstOvershoot = Math.max(worstOvershoot, S.peak - ceiling);
  }
  check("a forecast operator is never surprised beyond the noise band", worstOvershoot <= 1,
    `worst overshoot ${worstOvershoot.toFixed(1)} MW`);
  check("a year of steps grows the baseline (no reset)", S.quarterPeak > createGame().quarterPeak && S.calendar.year === 2,
    `${createGame().quarterPeak} → ${S.quarterPeak} MW, Y${S.calendar.year}`);
}

console.log(failed === 0 ? "\nAll demand tests passed." : `\n${failed} demand test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
