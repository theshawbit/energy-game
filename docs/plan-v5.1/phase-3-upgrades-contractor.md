# Phase 3 — Upgrade Ladders & Contractor Queue

> Part of the [v5.1 rebalance plan](README.md). **Reworks Phase 7's progression.** Turns per-plant
> specialization into **four parallel 9-tier cash ladders** (one per KPI axis) and moves upgrade
> application onto a **rolling contractor queue** with its own labor — the fast capacity channel that
> answers rising demand *between* builds. Depends on Phase 1 (the curve upgrades chase). `engine.js` sacred.

## Goal

Upgrades let you **sweat existing assets**; builds (unchanged, Phase 5 of v5) add new ones. The split:

- **4 axes × 9 steepening cash tiers, per plant.** Each of Output / Reliability / Efficiency /
  Flexibility has its own 9-tier ladder on a plant. Each tier is ~+10–20% on that axis; nine tiers
  take an axis to ~2–3× its start. Cost scales **hard** per tier (geometric), so you can't rush to
  max — the gate is money + time, not a single purchase.
- **Rolling contractor queue, separate labor.** Queuing an upgrade commits cash and spawns an
  `UpgradeJob` that resolves on a rolling calendar (`daysLeft`), **drawing a dedicated contractor
  line — never the maintenance crew pool** (Phase 4). Maintenance and upgrades therefore run truly in
  parallel; the only limiter on upgrades is cash + tier gating + lead time.
- **Tiers drive the caps.** `u.tiers[axis]` (0..9) sets `u.caps[axis]` (the attainable max the KPI can
  be restored to). Degradation still pulls the live `u.kpis` below the cap; maintenance (Phase 4)
  restores toward it. A higher tier = a higher ceiling, not an un-decaying plant.

This **retires** Phase 7's quarter-end Development Office upgrade flow (`applyUpgrade` /
`raiseCeiling`) and the RP-ceiling/⚡-perk coupling in its current form (see Notes for what survives).

## Module contract

- **`src/live/progression.js` (reworked)** — exports:
  - `AXES` (unchanged: the four KPI axes).
  - `upgradeTierMax` = 9; `axisTierValue(tier) → cap` — the ladder curve mapping a 0..9 tier to the
    attainable-max for that axis (e.g. `base × (1 + tier × stepFrac)` with diminishing shape).
  - `upgradeCost(u, axis) → cash` — the steepening cost to buy the *next* tier on `u`'s `axis`
    (geometric in the current tier; refused at tier 9).
  - `canUpgrade(S, unitId, axis) → bool` — affordable, not maxed, not already queued for that axis.
- **`src/live/contractor.js` (new, pure)** — exports:
  - `queueUpgrade(S, unitId, axis) → UpgradeJob | null` *(mutates `S.cash`, `S.contractor`)* — deducts
    cost up front, pushes `{ id, unitId, axis, toTier, cost, daysLeft: CFG.v5_1.upgrade.leadDays }`.
  - `tickContractor(S, dtH)` *(mutates `S.contractor`, applies the tier on completion)* — ages each
    job; on `daysLeft ≤ 0` sets `u.tiers[axis] = toTier`, recomputes `u.caps[axis]`, removes the job.
  - `contractorLoad(S) → n` — in-flight jobs, for the brief's readout (and any future soft cap).
- **`src/live/sim.js`** — `step` calls `tickContractor` each tick; the quarter rollover no longer owns
  upgrades. `createGame` seeds `u.tiers = {output:0, reliability:0, efficiency:0, flexibility:0}` and
  `S.contractor = []`.
- **`config.js`** — `CFG.v5_1.upgrade` (tier step fraction, geometric cost base/growth, `leadDays`).
- **`render.js`** — the **per-plant drill-down** (Phase 7 styles it): click a plant → its four axis
  ladders, current tier, next-tier cost + ETA, and a "queue upgrade" button per axis (adds to the
  contractor queue, surfaced in the daily brief).

## Tasks (TDD)

Create `tests/contractor.test.mjs` (and extend `tests/progression.test.mjs`).

1. **Nine tiers, steepening cost.** `upgradeCost` rises geometrically per tier; tier 9 is the cap
   (`canUpgrade` false at 9). Nine tiers on an axis lift its cap to the configured ~2–3× start.
2. **Queue deducts cash + spawns a job.** `queueUpgrade` subtracts the cost once, pushes one
   `UpgradeJob` with the right `toTier` and `leadDays`; a second queue for the same axis is refused.
3. **Rolling completion applies the tier.** `tickContractor` over `leadDays` sets `u.tiers[axis]` and
   raises `u.caps[axis]`; before completion the cap is unchanged (you pay to *wait*, not to *have*).
4. **Separate labor.** The contractor queue never touches `S.crews`; a fully-booked crew pool does not
   slow or block an upgrade (assert a maint job and an upgrade job progress independently in one tick).
5. **Caps gate KPIs, not decay immunity.** With a raised cap, `degradeKPIs` can still pull `u.kpis`
   below it; the cap only raises the *restorable* ceiling (cross-checks the Phase 4 restore target).
6. **Determinism / purity.** No RNG in the ladder or queue; identical inputs → identical jobs + caps.

## Done when

- `npm test` green incl. the new/extended suites; Phase 7's retired `applyUpgrade`/`raiseCeiling`
  paths removed with their tests rebased.
- In play: you can push a plant's four axes up nine tiers each via cash, jobs land on a rolling
  schedule without ever waiting on crews, and a well-upgraded fleet buys weeks of breathing room
  against the Phase 1 curve — but nine tiers of Output still can't substitute for a new plant forever.

## Notes / caveats

- **What survives from Phase 7:** the four-axis model and the cap→restore relationship. **What goes:**
  the quarter-end Development Office gating, and the RP-ceiling / ⚡-perk-automation coupling *as the
  upgrade mechanism*. If ⚡ perks (auto-maintenance, dispatch-assist, crew roster) are worth keeping,
  rehome them as profile skills funded by the Phase 6 currency — call that out in the PR rather than
  silently dropping them.
- Keep the tier curve in config so balance can retune the +10–20%/tier and the cost steepness without
  touching logic; the test pins "nine tiers, geometric cost, ~2–3× at max", not the exact figures.
- The contractor line is the first candidate for a future overextension soft-cap (like builds'); leave
  `contractorLoad` exported as the hook, but don't add the cap this phase unless balance demands it.
