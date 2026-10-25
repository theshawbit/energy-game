// ============================================================
// FLEET SORT (v4, Phase A) — pure comparators for the Manage → Fleet table.
// No DOM, no sim import: the output comparator takes an injected `outputOf(u)`
// callback so this module stays free of sim/render coupling and is unit-testable
// in node. Mirrors the pure-module discipline of mutators.js / research.js.
// ============================================================

// How urgently a unit wants attention (lower = more urgent, floats to the top of
// the default sort): tripped first, then in-service, then thermal plants by
// condition ascending (the worn ones first), then units with no condition
// (renewables, batteries) last.
export function attentionRank(u){
  if (u.status === "tripped") return 0;
  if (u.status === "service") return 1;
  if (u.condition != null) return 10 + u.condition; // 10..110 — worn thermal sorts above healthy
  return 1000;                                       // renew / battery (no condition): last
}

// Stable tiebreak by id, so equal-rank rows keep a deterministic order.
const tie = (a, b) => String(a.id).localeCompare(String(b.id));

// The default "needs attention" comparator.
export function compareNeedsAttention(a, b){
  return (attentionRank(a) - attentionRank(b)) || tie(a, b);
}

// Build a comparator for a given column + direction. `outputOf(u)` supplies the
// live MW output (injected so this module never imports the sim). dir > 0 ascends,
// dir < 0 descends; the id tiebreak is never flipped, so order stays deterministic.
export function makeFleetComparator(col, dir = 1, outputOf = () => 0){
  const d = dir < 0 ? -1 : 1;
  switch (col){
    case "name":      return (a, b) => d * String(a.name).localeCompare(String(b.name)) || tie(a, b);
    case "status":    return (a, b) => d * (attentionRank(a) - attentionRank(b)) || tie(a, b);
    case "output":    return (a, b) => d * (outputOf(a) - outputOf(b)) || tie(a, b);
    case "condition": return (a, b) => d * ((a.condition ?? Infinity) - (b.condition ?? Infinity)) || tie(a, b);
    case "attention":
    default:          return (a, b) => d * (attentionRank(a) - attentionRank(b)) || tie(a, b);
  }
}
