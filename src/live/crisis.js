// ============================================================
// CRISIS (v5 Phase 8) — the mid-quarter escape hatch. Maintenance is quarter-end
// only, so when a plant fails on day 5 the live day needs an EARNED, PENALISED
// recourse — nothing free. Two tools:
//
//  • LOAD-SHED — cut a pre-prioritised non-critical load tier. A CONTROLLED brownout:
//    the player chooses the cut instead of the grid cascading (it REUSES the shipped
//    shortfall mechanic — the cut simply lowers demand for a short window so the grid
//    clears). It carries a fine that settles into the quarter PnL (quarterLog.shedFines) —
//    cheaper than the blackout it averts, never free.
//  • DEMAND RESPONSE — an active peak shave gated STRICTLY on the demand-response
//    research branch (rmods.demandShave > 0): foresight, never a panic button. One shot
//    per window, then a cooldown.
//
// Pure over `S` (no DOM, no RNG). `sim.step` reads S.shed / S.dr when it computes demand
// and ages their timers; the fine settles through Phase 6's settleQuarter.
// ============================================================
import { CFG } from "./config.js";
import { setTicker } from "./sim.js";

// The pre-prioritised non-critical load tiers the player can shed, each resolved to the
// MW it would cut from the CURRENT load (falls back to peak before the first tick).
export function loadShedTiers(S){
  const load = S.demand || S.peak || 0;
  return CFG.v5.crisis.shedTiers.map(t => ({ ...t, mw: Math.round(t.frac * load) }));
}

// Cut a load tier for the shed window — a controlled brownout. Lowers demand (sim reads
// S.shed) and books the fine into the quarter log (it settles at the board review, and is
// charged to cash now). Refused for an unknown tier. One shed active at a time
// (re-triggering replaces it). Returns { ok, mw }.
export function triggerLoadShed(S, tierId){
  const spec = CFG.v5.crisis.shedTiers.find(t => t.id === tierId);
  if (!spec) return { ok: false, msg: "No such load tier." };
  const mw = Math.round(spec.frac * (S.demand || S.peak || 0));
  S.shed = { tier: spec.id, mw, tLeft: CFG.v5.crisis.shedWindow };
  S.quarterLog.shedFines = (S.quarterLog.shedFines || 0) + spec.fine; // the fine (read at the board review)
  S.cash -= spec.fine;                                                // v5.3: charge it to cash NOW so the board PnL reconciles (was logged-only — a phantom cost, review M1)
  setTicker(S, `▼ Load-shed — ${spec.label} dark (${mw} MW cut). The fine will land at the board review.`);
  return { ok: true, mw };
}

// Is active demand response available? Gated on the demand-response research branch being
// secured ahead (rmods.demandShave > 0), with nothing already running and the cooldown clear.
export function canDemandRespond(S){
  if (!(S.rmods?.demandShave > 0)) return false;          // the foresight gate — build the branch first
  if (S.dr && S.dr.tLeft > 0) return false;               // already shaving
  return (S.drCooldown || 0) <= 0;                        // off cooldown
}

// Fire demand response: shave the configured peak fraction for the DR window, then start the
// cooldown. Refused when it wasn't built ahead (see canDemandRespond). Returns { ok }.
export function triggerDemandResponse(S){
  if (!canDemandRespond(S)) return { ok: false, msg: "Demand response not available — build the research branch, and mind the cooldown." };
  S.dr = { shave: CFG.v5.crisis.drShave, tLeft: CFG.v5.crisis.drWindow };
  S.drCooldown = CFG.v5.crisis.drCooldown;
  setTicker(S, `⟳ Demand response fired — ${Math.round(CFG.v5.crisis.drShave * 100)}% peak shave for ${CFG.v5.crisis.drWindow}h.`);
  return { ok: true };
}

// Age the active crisis tools by dtH game-hours: expire a finished shed / DR window and
// wind the DR cooldown down. Called once per tick by sim.step. Pure mutation of S.
export function tickCrisis(S, dtH){
  if (S.shed){ S.shed.tLeft -= dtH; if (S.shed.tLeft <= 0) S.shed = null; }
  if (S.dr){ S.dr.tLeft -= dtH; if (S.dr.tLeft <= 0) S.dr = null; }
  if (S.drCooldown > 0) S.drCooldown = Math.max(0, S.drCooldown - dtH);
}

// The MW load-shed is cutting this tick (0 when nothing active) — sim subtracts it from
// demand, render surfaces it. Kept here so the "controlled brownout" lever lives in one place.
export function activeShedMW(S){ return (S.shed && S.shed.tLeft > 0) ? S.shed.mw : 0; }

// The active demand-response shave fraction this tick (0 when nothing active).
export function activeDrShave(S){ return (S.dr && S.dr.tLeft > 0) ? S.dr.shave : 0; }
