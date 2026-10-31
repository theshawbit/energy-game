// ============================================================
// VERDICT (v5 Phase 6) — the overlord's quarterly board review. Pure: reads the
// quarter's accumulated log (S.quarterLog) + the standing economy (S.economy) +
// the calendar, scores the quarter, and returns a Verdict. `applyVerdict` is the
// only mutator — it banks the bonus/fine, ratchets next quarter's floor rate, and
// sets the stagnation lever. No DOM, no RNG, no engine import.
//
// The grade (0..1) blends three things the overlord cares about: the fleet's KPI
// average (did you keep your iron healthy), the serve rate (did the city stay lit),
// and clean standing (emissions intensity). Above `gradeNeutral` the overlord is
// pleased — a bonus and a higher floor rate next quarter; below, a fine and a
// squeeze. Failure is STAGNATION, never a game-over: a wrecked quarter stalls demand
// growth and (via the sim's finance path) tightens credit — the save always survives.
//
// The `note` is the overlord's barbed one-liner, now selected by world.overlordNote
// from the CFG.v5.world.overlord copy tables (Phase 9) — pure and grade-driven, so
// this scoring logic is untouched by the voice.
// ============================================================
import { CFG } from "./config.js";
import { overlordNote } from "./world.js";
import { scoreQuarter, mintCurrency } from "./scorecard.js"; // v5.1 Phase 6: the KPI → ⚡ faucet

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// A fresh per-quarter accumulator. The sim adds to it each tick; the board review
// reads it; the rollover resets it. KPI is time-weighted (accum ÷ weight = average).
export function freshQuarterLog(){
  return {
    servedMWh: 0, shortfallMWh: 0,      // load delivered vs load missed (reliability of supply)
    floorPay: 0, swingPay: 0,           // the two income surfaces, banked over the quarter
    breaches: 0, breachFines: 0,        // capacity-obligation breaches + their fines
    shedFines: 0,                       // v5 P8: load-shed fines (the price of a controlled brownout)
    emissions: 0,                       // tCO₂ emitted this quarter (→ clean standing)
    kpiAccum: { reliability: 0, efficiency: 0, output: 0, flexibility: 0 }, kpiWeight: 0,
    wages: 0, overruns: 0,              // Phase 4/5 seams: crew wages + build overruns settle HERE
    // v5.1 Phase 6 — the scorecard's extra raw inputs (the five the grade didn't already track):
    opCost: 0,                          // operating cost (fuel + O&M + spin + battery recharge) → cost discipline, $/MWh
    interest: 0, unservedCost: 0,       // v5.3: debt interest + VOLL on forced unserved → the HONEST board PnL
    capitalSunk: 0,                     // cash committed to builds + upgrades → capital efficiency
    reserveAccum: 0, priceAccum: 0, hours: 0, // time-weighted reserve margin + wholesale price → headroom / affordability
  };
}

// The standing economy block. floorRate is the availability pay ($/MW/h) the verdict
// ratchets; swingPnL is a running mirror of the quarter's swing income (for the HUD);
// growthStall ∈ [0,1] is the stagnation lever the sim reads when stepping demand.
export function freshEconomy(){
  return { floorRate: CFG.v5.econ.floorRateStart, swingPnL: 0, lastVerdict: null, growthStall: 0 };
}

// The quarter that just closed, given a calendar already rolled into the new quarter.
function closedPeriod(cal){
  const q = cal.quarter === 1 ? CFG.v5.quartersPerYear : cal.quarter - 1;
  const y = cal.quarter === 1 ? cal.year - 1 : cal.year;
  return { year: y, quarter: q };
}

// Score + grade the closed quarter from the log alone. Pure + deterministic.
export function settleQuarter(S){
  const q = S.quarterLog, e = CFG.v5.econ;
  const { year, quarter } = closedPeriod(S.calendar);

  // fleet KPI average over the quarter (time-weighted); 100 if nothing logged (a
  // quarter with no thermal fleet is treated as healthy on this axis).
  const w = q.kpiWeight || 0;
  const avg = w > 0
    ? { reliability: q.kpiAccum.reliability / w, efficiency: q.kpiAccum.efficiency / w,
        output: q.kpiAccum.output / w, flexibility: q.kpiAccum.flexibility / w }
    : { reliability: 100, efficiency: 100, output: 100, flexibility: 100 };
  const kpiScore = (avg.reliability + avg.efficiency + avg.output + avg.flexibility) / 4; // 0..100

  // serve rate: how much of the load you actually delivered (1 = never short).
  const load = q.servedMWh + q.shortfallMWh;
  const serveRate = load > 0 ? q.servedMWh / load : 1;

  // clean standing: lower emissions intensity (kg CO₂/MWh) scores higher.
  const intensity = q.servedMWh > 0 ? q.emissions * 1e3 / q.servedMWh : 0;
  const cleanScore = clamp(1 - intensity / e.dirtyIntensity, 0, 1);

  // composite grade 0..1 and the money for the quarter.
  const grade = clamp(e.wKpi * (kpiScore / 100) + e.wServe * serveRate + e.wClean * cleanScore, 0, 1);
  // v5.3 (C3): the board PnL is now a TRUE account — revenue (floor + swing) less EVERY cost the
  // quarter actually incurred: operating cost, wages, overruns, fines, debt interest, and VOLL on
  // forced unserved. The old formula omitted opCost/interest/unserved, inflating the figure the mint reads.
  const pnl = Math.round(q.floorPay + q.swingPay - (q.opCost || 0) - q.wages - q.overruns - q.breachFines
    - (q.shedFines || 0) - (q.interest || 0) - (q.unservedCost || 0));

  // the gap from "par" drives the ratchet, bonus, and fine.
  const gap = grade - e.gradeNeutral;
  const floorRateNext = clamp(S.economy.floorRate * (1 + e.rateRatchet * gap), e.floorRateMin, e.floorRateMax);
  const bonus = gap > 0 ? Math.round(gap / (1 - e.gradeNeutral) * e.bonusMax) : 0;
  const fine  = gap < 0 ? Math.round(-gap / e.gradeNeutral * e.fineMax) : 0;

  // v5.1 Phase 6: score the quarter's seven KPIs and mint this quarter's ⚡. The grade above
  // still drives the ratchet/bonus/fine + the stability coupling (it reads the same KPIs); the
  // scorecard is the CURRENCY layer, banked to the profile at the rollover (main.js). Both ride
  // the quarter's performance, so a strong quarter heals the HP bar AND mints well — and the
  // reverse — keeping survival and progression coupled.
  const scorecard = scoreQuarter(S);
  const mintTotal = mintCurrency(scorecard);

  return {
    year, quarter,
    kpiScore: Math.round(kpiScore), serveRate, cleanScore, grade,
    pnl, floorRate: S.economy.floorRate, floorRateNext: Math.round(floorRateNext * 100) / 100,
    bonus, fine,
    // the earnings split + settled costs, carried for the board review (the log resets after).
    floorPay: Math.round(q.floorPay), swingPay: Math.round(q.swingPay),
    wages: Math.round(q.wages), overruns: Math.round(q.overruns), breachFines: Math.round(q.breachFines),
    shedFines: Math.round(q.shedFines || 0),
    scorecard, mintTotal,       // v5.1 Phase 6: the KPI scorecard + the ⚡ this quarter minted
    note: overlordNote({ grade, serveRate, cleanScore, year, quarter }),
  };
}

// Bank the verdict and set next quarter's standing. The ONLY mutator. A weak quarter
// stalls demand growth (stagnation) — the sim reads growthStall when it steps peak.
export function applyVerdict(S, v){
  S.cash += v.bonus - v.fine;
  S.economy.floorRate = v.floorRateNext;
  S.economy.lastVerdict = v;
  S.economy.swingPnL = 0;
  // stagnation: serving below the threshold stalls the next quarter's demand growth,
  // scaled by how far short you fell (full stall at serveRate 0). Never negative.
  const t = CFG.v5.econ.growthStallThreshold;
  const miss = v.serveRate < t ? (t - v.serveRate) / t : 0;
  S.economy.growthStall = clamp(miss * CFG.v5.econ.growthStallMax, 0, CFG.v5.econ.growthStallMax);
}

