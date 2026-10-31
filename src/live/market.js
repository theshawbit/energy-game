// ============================================================
// SPOT MARKET (v4, Phase B) — the live wholesale price the city pays for the
// RESIDUAL served load that isn't locked into a contract. Pure: no DOM, no sim
// import (defines its own shape-lookup so there's no cycle with sim.js), mutates
// only what the caller passes. Mirrors research.js / mutators.js discipline.
//
// The price is a deterministic flat-ish baseline plus a SCARCITY PREMIUM driven
// by the player's own reserve margin: a thin grid spikes the price, a flush grid
// crashes it. Mutators compound the premium (scarcityMult). This makes the
// player's dispatch the dominant price-mover — not an exogenous dice roll.
//
// ENGINE-PROTECTION KEYSTONE: the premium PLATEAUS at a shortfall (rm ≤ 0), so a
// deeper shortfall never lifts per-MWh spot. Revenue reads only served load
// (see sim.js), so a shortfall can never out-earn a razor-thin-but-served grid.
// ============================================================
import { DEMAND_SHAPE } from "../constants.js";
import { CFG } from "./config.js";
import { revenueCoeffs } from "./kpi.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// v5 Phase 6 — the SWING quality coefficient (0..1): how well a unit CAPTURES the
// market swing, blending the Output (volume) and Flexibility (capture) KPI coeffs.
// Efficiency's revenue effect is the EXTRA FUEL a low-efficiency plant burns, already
// charged on the cost side (Phase 3 effSurcharge) — folding it in here too would
// double-count it, so the swing scale leaves it out. Reliability earns the FLOOR, not
// the swing (capacity.floorEarn). A unit with no KPIs (renewable / battery) never
// degrades → full swing (1.0); a fresh thermal plant = 1.0 too, so a healthy grid's
// swing equals the raw spot revenue (no regression from v4, and the book-conservation
// guard stays exact — Output/Flexibility don't wear on a covered, non-cycling tick).
export function swingCoeff(kpis){
  if (!kpis) return 1;
  const c = revenueCoeffs(kpis);
  return (c.volume + c.capture) / 2;
}

// Market-swing revenue ($/h rate) for a block of residual (spot-cleared) MW at a
// given spot price, scaled by the fleet's swing quality. residualMW is already the
// SERVED load net of contracts and net of reserve-held MW (that earns the floor), so
// a shortfall never earns here — the two surfaces never double-count.
export function swingEarn(residualMW, spot, coeff = 1){
  return Math.max(0, residualMW) * spot * clamp(coeff, 0, 1);
}

// local linear interp over the 24h demand shape (kept here so market.js imports
// nothing from sim.js — avoids an import cycle, since sim.js imports this module)
function shapeAt(t){
  const h = ((t % 24) + 24) % 24, i = Math.floor(h), f = h - i;
  return DEMAND_SHAPE[i] * (1 - f) + DEMAND_SHAPE[(i + 1) % 24] * f;
}
export const meanShape = DEMAND_SHAPE.reduce((a, v) => a + v, 0) / DEMAND_SHAPE.length;

// The exogenous baseline for a given day + hour: a flat base lifted by the daily
// demand shape (busier hours cost a touch more) and a slow upward drift with days.
export function exogenousBaseline(day, t){
  // v5.3: the per-day drift (×(1 + spotDrift·(day−1))) is RETIRED (C4 — it climbed without bound and
  // pinned the market at the cap mid-session). Flat across days; only the intraday demand shape lifts
  // it hour to hour. Used for the forecast + spot-kill reference, NOT revenue (served load earns the
  // engine's clearing price now).
  return CFG.spotBase * (1 + CFG.spotDaily * (shapeAt(t) - meanShape));
}

// A hour-independent daily baseline — used to price multi-day contracts (which
// span every hour, so the daily-shape wiggle averages out).
export function dailyBaseline(day){
  return CFG.spotBase; // v5.3: per-day drift retired (C4) — flat baseline for multi-day contract pricing
}

// Reserve margin as a fraction of demand: (capacity − demand) / demand. Positive
// = headroom, negative = shortfall. Defaults to flush (1) when there's no demand.
export function reserveMargin(capacity, demand){
  return demand > 0 ? (capacity - demand) / demand : 1;
}

// Scarcity premium as a function of reserve margin. Max premium when tight,
// crashing negative when flush; PLATEAUS at both ends (see module header).
export function scarcityPremium(rm){
  if (rm <= 0)            return  CFG.scarcityMax;                                   // tight/shortfall: plateau
  if (rm <  CFG.rmRef)    return  CFG.scarcityMax * (1 - rm / CFG.rmRef);            // max → 0 across [0, rmRef]
  if (rm <  CFG.rmCrash)  return -CFG.crashMax * (rm - CFG.rmRef) / (CFG.rmCrash - CFG.rmRef); // 0 → −crashMax
  return -CFG.crashMax;                                                             // flush: crash plateau
}

// The live spot price: baseline + (scarcity premium × mutator multiplier) + noise,
// clamped to [spotFloor, spotCap].
export function spotPrice({ baseline, reserveMargin, scarcityMult = 1, noise = 0 }){
  return clamp(baseline + scarcityPremium(reserveMargin) * scarcityMult + noise, CFG.spotFloor, CFG.spotCap);
}
