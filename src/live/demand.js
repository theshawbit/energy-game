// ============================================================
// DEMAND (v5.1 Phase 1) — the hybrid demand curve. Pure: reads S.calendar / S.economy
// / S.quarterPeak and an injected noise stream, returns values; the only mutation is
// rollQuarterPeak writing the stepped baseline. Replaces v5's +6%/day compounding
// (doubled demand in ~12 days, outran every capacity lever) with:
//   • a PLANNABLE per-quarter baseline (S.quarterPeak) that steps up at each rollover, and
//   • a bounded, season-dependent DAILY noise so the live S.peak wobbles around it.
// The strategic game aims builds/upgrades at the stepped baseline; the dispatch game
// fights the daily wobble. No DOM, no engine import, no economic-RNG consumption.
// ============================================================
import { CFG } from "./config.js";
import { seasonOf } from "./calendar.js";

// The season's daily-noise amplitude (± fraction around 1.0). Summer days swing hardest.
function noiseAmp(S){
  const n = CFG.v5_1.demand.noiseAmp;
  return n[seasonOf(S.calendar?.quarter ?? 1)] ?? n.default ?? 0;
}

// The multiplier applied to the quarterly step: skill (efficiency slows growth) × the
// stagnation lever (a quarter the overlord judged short stalls next quarter's growth) ×
// an optional per-year scale (the long arc). Never negative.
function stepMult(S){
  const d = CFG.v5_1.demand;
  const skill = S.peakGrowthMult ?? 1;                       // meta efficiency skill (≤1 slows growth)
  const stall = S.economy?.growthStall ?? 0;                 // Phase 6 stagnation (0 = full growth)
  const yearFactor = 1 + (d.yearScale ?? 0) * ((S.calendar?.year ?? 1) - 1);
  return Math.max(0, skill * (1 - stall) * yearFactor);
}

// Today's live peak demand: the quarter baseline × a bounded seasonal daily-noise
// multiplier centered on 1.0. `S.calm` flattens noise to exactly the baseline (the
// deterministic test harness). Deterministic given the injected `S.rngDemand` stream;
// never touches the economic RNG (S.rng) so the economy stays reproducible. Pure.
export function stepDemand(S){
  const base = S.quarterPeak ?? CFG.startPeak;
  if (S.calm) return Math.round(base);
  const amp = noiseAmp(S);
  const rng = S.rngDemand || Math.random;
  const mult = 1 + (rng() * 2 - 1) * amp;                    // ∈ [1-amp, 1+amp]
  return Math.round(base * mult);
}

// Step the quarter baseline at the rollover — the ONLY mutation here. Growth is applied
// once per quarter (plannable), not compounded daily. Stagnation/skill shave the step
// via stepMult, never the base, so the city stalls but never shrinks. Mutates
// S.quarterPeak + S.nextQuarterPeak; returns the new baseline.
export function rollQuarterPeak(S){
  const base = S.quarterPeak ?? CFG.startPeak;
  S.quarterPeak = Math.round(base * (1 + CFG.v5_1.demand.stepFrac * stepMult(S)));
  S.nextQuarterPeak = forecastPeak(S, 1);
  return S.quarterPeak;
}

// v5.2 Phase 1 — the capped random-shock term. The two in-the-moment transients (load
// wobble, demand spike) used to MULTIPLY raw onto the baseline alongside the foreseeable
// lift, so a winter evening could stack to +57% at random — unpreventable. Now they are
// weighted (spike dominant, wobble seasoning) and passed through a SATURATING tanh with a
// hard ceiling `shockCap` (Smax): small stacks stay near-linear (everyday chop survives),
// big stacks asymptote to shockCap and can NEVER explode. Returns the surge FRACTION added
// on top of the foreseeable lift (∈ [0, shockCap)). Pure: no state, no RNG, no DOM. Only
// the UPWARD surge is passed here — downward wobble stays relief on the foreseeable side.
export function peakShock(spikeSurge, wobbleSurge, cfg = CFG.v5_2.peak){
  const weighted = cfg.wSpike * spikeSurge + cfg.wWobble * wobbleSurge;
  return cfg.shockCap * Math.tanh(weighted / cfg.shockCap);
}

// The honest forward baseline `quartersAhead` quarters out — what the brief / board
// review / build panel plan against. Pure read; uses the full (un-stalled) step, since
// you can't bank on your own future stagnation. forecastPeak(S, 0) === S.quarterPeak.
export function forecastPeak(S, quartersAhead){
  const d = CFG.v5_1.demand;
  const base = S.quarterPeak ?? CFG.startPeak;
  const skill = S.peakGrowthMult ?? 1;
  const yearFactor = 1 + (d.yearScale ?? 0) * ((S.calendar?.year ?? 1) - 1);
  const step = 1 + d.stepFrac * Math.max(0, skill * yearFactor);
  return Math.round(base * Math.pow(step, quartersAhead));
}
