// ============================================================
// KPI (v5 Phase 3) — the four axis-aligned health metrics that replace the single
// `condition %`, and the DEGRADATION KEYSTONE: how you run a plant decides which
// axis decays.
//
//   reliability — trip risk / mechanical health (≈ old condition) → gates trips
//   efficiency  — heat rate → $/MWh re-pricing
//   output      — effective max MW (derate)
//   flexibility — ramp speed + min stable load (agility)
//
// Pure + RNG-free: state (the unit's realised load + its dials) in, KPI mutation
// out. All live-day randomness stays in step(), so degradation is balance-tuned
// deterministically. Only CFG is imported (tuning data); the curves live here.
// ============================================================
import { CFG } from "./config.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function freshKPIs(){ return { reliability: 100, efficiency: 100, output: 100, flexibility: 100 }; }

// Output KPI → capacity derate factor. 100 → 1.0 (full cap); falls to CFG.v5.kpiCurve.outputMin at 0.
export function outputFactor(output){
  const c = CFG.v5.kpiCurve;
  return c.outputMin + (1 - c.outputMin) * (clamp(output, 0, 100) / 100);
}
// The achievable top MW — the hook Phase 2's applyDials calls. No kpis (renewables) → full cap.
export function effectiveMax(u){
  const output = u.kpis ? u.kpis.output : 100;
  return u.cap * outputFactor(output);
}
// Efficiency KPI → $/MWh heat-rate multiplier the dispatch cost reads. 100 → 1.0, rising as it falls.
export function heatRateMult(efficiency){
  return 1 + CFG.v5.kpiCurve.heatRateMax * (1 - clamp(efficiency, 0, 100) / 100);
}
// Flexibility KPI → ramp speed (× faster with more flex) …
export function rampFactor(flexibility){
  const c = CFG.v5.kpiCurve;
  return c.rampMin + (1 - c.rampMin) * (clamp(flexibility, 0, 100) / 100);
}
// … and the min stable load (a low-flex plant can't turn down as far → narrower band).
export function minStableLoad(flexibility){
  return CFG.v5.kpiCurve.minLoadMax * (1 - clamp(flexibility, 0, 100) / 100);
}

// The clean 1:1 mapping Phase 6 turns into money: each axis drives exactly one
// revenue coefficient (Reliability→floor, Efficiency→margin, Output→volume,
// Flexibility→capture), as a 0..1 fraction of its max.
export function revenueCoeffs(kpis){
  return {
    floor:   clamp(kpis.reliability, 0, 100) / 100,
    margin:  clamp(kpis.efficiency,  0, 100) / 100,
    volume:  clamp(kpis.output,      0, 100) / 100,
    capture: clamp(kpis.flexibility, 0, 100) / 100,
  };
}

// THE KEYSTONE. `style` = { loadFrac, push, ramped, started } — realised load share
// (from step), the push dial, and whether this tick ramped/started (dispatch.cycleCost).
// Push + sustained HIGH load wears Reliability & Output; PART-load wears Efficiency;
// ramps/starts beat up Flexibility (and a start nicks Reliability). Mutates u.kpis.
export function degradeKPIs(u, style, dtH){
  const k = u.kpis; if (!k) return;
  const D = CFG.v5.decay;
  const load = Math.max(D.idleFloor, Math.min(1, style.loadFrac ?? 0));
  const push = clamp(style.push ?? 0, 0, 1);
  const hi = Math.max(0, (load - D.loadRefHigh) / (1 - D.loadRefHigh)); // 0..1 above the high-load ref
  const lo = Math.max(0, (D.partLoadRef - load) / D.partLoadRef);       // 0..1 below the part-load ref
  const stress = push * hi;                                             // ONLY a hard-pushed, high-load plant
  k.reliability = clamp(k.reliability - D.reliability * stress * dtH, 0, 100);
  k.output      = clamp(k.output      - D.output      * stress * dtH, 0, 100);
  k.efficiency  = clamp(k.efficiency  - D.efficiency  * lo     * dtH, 0, 100);
  if (style.ramped)  k.flexibility = clamp(k.flexibility - D.rampHit,  0, 100);
  if (style.started){ k.flexibility = clamp(k.flexibility - D.startHit, 0, 100);
                      k.reliability = clamp(k.reliability - D.startRelHit, 0, 100); }
}
