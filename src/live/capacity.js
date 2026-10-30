// ============================================================
// CAPACITY MARKET (v4, Phase F — advanced tier, gated by the "capacity-market"
// economy unlock). Pure: no DOM, no sim import, caller-supplied RNG. You take on
// an OBLIGATION to keep `reserveMW` of firm capacity available; you're paid for
// availability every day, and fined if a CALL finds you short. The breach fine is
// recoverable — it never itself ends a run (only sustained insolvency does).
// ============================================================
import { CFG } from "./config.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// v5 Phase 6 — the regulated FLOOR. Availability pay ($/h rate) for a block of
// reserve MW a unit holds ready (via the Phase 2 reserveHold dial), at the current
// floor rate ($/MW/h, ratcheted by the overlord's verdict), keyed to the unit's
// RELIABILITY — a worn plant's "ready" reserve is worth less to the regulator, so a
// high-reliability fleet earns the full floor and a neglected one earns less. A unit
// with no KPIs (renewable / battery) holds no dial-reserve, so this is thermal-only.
export function floorEarn(reserveMW, reliability, floorRate){
  return Math.max(0, reserveMW) * floorRate * clamp(reliability ?? 100, 0, 100) / 100;
}

// Availability payment ($) for an obligation over a slice of `dtDays` game-days.
export function capacityPayment(obligation, dtDays){
  if (!obligation) return 0;
  return obligation.reserveMW * obligation.pricePerMW * dtDays;
}

// How short of the obligation the deliverable firm capacity is (never negative).
export function capacityShortfall(obligation, deliverableMW){
  if (!obligation) return 0;
  return Math.max(0, obligation.reserveMW - deliverableMW);
}

// Breach fine ($) when a call finds you short — proportional to the shortfall.
export function capacityPenalty(obligation, deliverableMW){
  return capacityShortfall(obligation, deliverableMW) * CFG.capacity.penaltyPerMw;
}

// Does a capacity call land this day? More likely when the grid is tight (a low or
// negative reserve margin pushes the probability up). rng is caller-supplied.
export function rollCapacityCall(S, rng){
  if (!S.capacityObligation) return false;
  const rm = S.demand > 0 ? (S.capacity - S.demand) / S.demand : 1;
  const tightness = Math.max(0, 1 - rm / CFG.rmRef); // 0 when comfortable, up to 1 as margin → 0
  const prob = Math.min(0.95, CFG.capacity.callBaseProb + 0.5 * tightness);
  return rng() < prob;
}
