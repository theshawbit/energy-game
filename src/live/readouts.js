// v4.2 "The Control Room" (CR-2) — derived operator readouts.
//
// Pure functions of the live state `S`. Nothing here is a game mechanic: every
// value is computed from fields the sim already maintains (fleet, demand,
// capacity, spot, contracts) plus the read-only rates step() now surfaces
// (served / contractRevenue / flowRate). No RNG, no mutation, no persisted
// state — so the status cluster is pure presentation.
import { unitOutput } from "./sim.js";
import { DEMAND_SHAPE } from "../constants.js";

// Hour of the daily demand curve's peak (the evening ramp). Derived from the
// shape itself so it tracks the data, not a magic number.
export const PEAK_HOUR = DEMAND_SHAPE.indexOf(Math.max(...DEMAND_SHAPE));

// What a single unit WOULD contribute if it were armed right now:
//  - tripped / in service  → nothing (can't arm it)
//  - renewables            → current weather-limited output (can't "arm" more)
//  - battery               → its rated MW only while it still holds charge
//  - firm / peaker         → its rated capacity (bring the reserve online)
export function armableOf(S, u){
  if (u.status === "tripped" || u.status === "maint") return 0;
  if (u.kind === "renew") return unitOutput(S, u);
  if (u.kind === "battery") return u.energy > 0 ? u.cap * (S.rmods?.battCapMult ?? 1) : 0;
  return u.cap; // firm / peaker
}

// Total MW available if every cold reserve were armed (the ceiling you can reach
// this instant). Online units count at what they'd give armed, not their current
// throttle, so potential ≥ current capacity.
export function potentialCapacity(S){
  return (S.fleet || []).reduce((a, u) => a + armableOf(S, u), 0);
}

// Headroom of what's ONLINE now over demand (can be negative = deficit).
export function onlineHeadroom(S){ return (S.capacity || 0) - (S.demand || 0); }

// Headroom you could reach by arming every reserve (negative = even fully armed
// you're short).
export function armableHeadroom(S){ return potentialCapacity(S) - (S.demand || 0); }

// Game-hours until the next daily demand peak (0 while sitting on it).
export function timeToPeak(S){
  const now = (S.t || 0) % 24;
  let d = PEAK_HOUR - now;
  if (d < 0) d += 24;
  return d;
}

// Share of demand locked into contracts (0..1) — the rest rides spot.
export function hedgedShare(S){
  const d = S.demand || 0;
  return d > 0 ? Math.min(1, (S.contractedMW || 0) / d) : 0;
}

// MW of served load currently clearing at the live spot price (unhedged exposure).
export function exposedMW(S){
  return Math.max(0, (S.served || 0) - (S.contractedMW || 0));
}

// Blended realized price across contracted + spot load, $/MWh. Falls back to the
// spot price when nothing is being served yet.
export function blendedPrice(S){
  const served = S.served || 0;
  if (served <= 0) return S.spot || 0;
  const residual = Math.max(0, served - (S.contractedMW || 0));
  return ((S.contractRevenue || 0) + residual * (S.spot || 0)) / served;
}
