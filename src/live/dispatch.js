// ============================================================
// DISPATCH (v5 Phase 2 → gutted in v5.3 Phase 1) — the single surviving dial is
// COMMIT (on/off). v5.3 Option 1 makes the market PRICE-TAKING: an online firm/gas
// unit offers its FULL available capacity (effectiveMax) to the SACRED engine, so no
// throttle can move the clearing price. The old Core+ throttle dials (output band,
// reserve hold, push) could no longer touch dispatch, so they were deleted — in a
// single-supplier market "withhold to move the price" was an exploit, not a strategy
// (a real bidding/withholding mechanic returns in a later milestone). commit still
// gates online/off via sim.js's status reconciliation.
//
// effectiveMax / minStableLoad come from kpi.js: the Output KPI derates the offer and
// the Flexibility KPI sets how far the plant can turn down (unused now the band is gone,
// kept for its other callers).
// ============================================================
import { effectiveMax } from "./kpi.js";

// Sane opt-in default so a player who touches nothing still runs a sensible grid:
// baseload (firm) is committed online; fast gas sits in reserve (uncommitted) like the
// old peaker. The only dial left is commit — a committed unit offers its full capacity.
export function defaultDials(u){
  return { commit: u.kind === "firm" };   // baseload online; gas reserve — mirrors the v4 opening
}

// Resolve a unit's dial into its offer to the merit order. commit off (or no dials) → a
// zero offer; committed → its FULL available capacity (effectiveMax). No band, no hold:
// v5.3 Option 1 makes dispatch price-taking, so there is nothing to shave.
export function applyDials(u){
  const d = u.dials;
  if (!d || !d.commit) return { min: 0, max: 0, committed: false };
  const eMax = effectiveMax(u);
  return { min: 0, max: eMax, committed: true };
}

// Classify a dial change for the Flexibility wear hook: a `started` when a unit goes
// committed-false → true (starting beats up Flexibility + nicks Reliability). The old
// band-`ramped` event is gone with the output band (v5.3 Phase 1). Pure — the sim reads
// the flag; degradeKPIs acts on it.
export function cycleCost(u, fromDials, toDials){
  return { started: !fromDials.commit && !!toDials.commit };
}
