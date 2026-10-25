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

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
  return CFG.spotBase
    * (1 + CFG.spotDaily * (shapeAt(t) - meanShape))
    * (1 + CFG.spotDrift * (day - 1));
}

// A hour-independent daily baseline — used to price multi-day contracts (which
// span every hour, so the daily-shape wiggle averages out).
export function dailyBaseline(day){
  return CFG.spotBase * (1 + CFG.spotDrift * (day - 1));
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
