// ============================================================
// DISPATCH (v5 Phase 2) — the Core+ dials → merit-order OFFER. Pure: a unit's
// four live dials (commit · output band · reserve hold · push) resolve into the
// {min, max, committed} MW offer that sim.js aggregates into the `avail` map
// handed to the SACRED engine (dispatchHour). The engine still economically
// clears; the dials only shape the band it clears WITHIN — they never touch it.
//
// Fast gas replaces the old peaker: a gas plant dialled to a narrow high band is
// the former peaker (fast, expensive top-up), through the same merit order.
//
// No imports — effectiveMax reads only u.cap and the (Phase 3) Output KPI, so the
// module tests headless and can't drift from config.
// ============================================================

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The unit's achievable top MW. Honours the Phase 3 Output KPI (derate); dormant
// until Phase 3 writes u.kpis, so a fresh unit's effectiveMax is just its cap.
export function effectiveMax(u){
  const outputKpi = u.kpis ? u.kpis.output : 100;
  return u.cap * (outputKpi / 100);
}

// Sane opt-in defaults so a player who touches nothing still runs a sensible grid:
// baseload (firm) is committed and offers its full band; fast gas sits in reserve
// (uncommitted) like the old peaker. reserveHold 0 → the full band is offered to
// the swing (the player dials it UP to keep headroom for the Phase 6 capacity
// floor). push is "easy" (low wear intent; no mechanical effect until Phase 3).
export function defaultDials(u){
  return {
    commit: u.kind === "firm",   // baseload online; gas reserve — mirrors the v4 opening
    bandMin: 0,
    bandMax: effectiveMax(u),
    reserveHold: 0,
    push: 0.3,
  };
}

// Resolve a unit's dials into its offer to the merit order. commit off (or no
// dials) → a zero offer. The output band clamps to [0, effectiveMax] and is
// normalised so it can never invert (min wins; max raised to min). reserveHold
// shaves the OFFERED max — the held fraction is headroom kept available for the
// capacity floor rather than pushed into the market swing — and is surfaced as
// `held` for Phase 6's floor accounting.
export function applyDials(u){
  const d = u.dials;
  if (!d || !d.commit) return { min: 0, max: 0, committed: false, held: 0 };
  const eMax = effectiveMax(u);
  let bandMin = clamp(d.bandMin ?? 0, 0, eMax);
  let bandMax = clamp(d.bandMax ?? eMax, 0, eMax);
  if (bandMin > bandMax) bandMax = bandMin;            // never an inverted band (min wins)
  const hold = clamp(d.reserveHold ?? 0, 0, 1);
  const offeredMax = bandMax * (1 - hold);
  const held = bandMax * hold;
  const min = Math.min(bandMin, offeredMax);
  return { min, max: offeredMax, committed: true, held };
}

// Classify a dial change for the Phase 3 Flexibility wear hook: a `started` when a
// unit goes committed-false → true, a `ramped` when the output band moves. Pure —
// it records nothing itself; the sim reads the flags and Phase 3 acts on them.
export function cycleCost(u, fromDials, toDials){
  const started = !fromDials.commit && !!toDials.commit;
  const ramped = fromDials.bandMin !== toDials.bandMin || fromDials.bandMax !== toDials.bandMax;
  return { ramped, started };
}
