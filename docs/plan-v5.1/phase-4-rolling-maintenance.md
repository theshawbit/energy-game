# Phase 4 — Rolling Maintenance

> Part of the [v5.1 rebalance plan](README.md). **Reverses Phase 4-v5's quarter-end-only maintenance.**
> Maintenance becomes a **rolling, cash-funded queue drawing the crew pool**, scheduled day-to-day via
> the brief — the parallel sibling of the contractor upgrade queue. Depends on Phase 1. `engine.js` sacred.

## Goal

A plant that starts failing on day 5 shouldn't wait until day 22 to be fixed. Maintenance moves onto a
**rolling calendar**:

- **Queue a maint job any day** (via the Phase 5 brief); it draws a crew from the pool and resolves on
  a rolling `daysLeft`, independent of quarter boundaries.
- **Crew pool is the maintenance limiter** (and *only* maintenance — upgrades use the separate
  contractor line, Phase 3). A fully-booked roster slows the maintenance queue; hiring/promoting crews
  (⚡) raises throughput. This is the triage that makes the crew system matter live.
- **Restores KPIs toward the upgraded caps.** A completed job lifts the worked axis's live `u.kpis`
  back toward `u.caps[axis]` (which Phase 3's tiers set) — maintenance fights decay; upgrades raise the
  ceiling. The two channels are complementary, run in parallel, and are both scheduled from the brief.

This **retires** the quarter-end `resolveQuarterTasks` batch and the `Task {quartersLeft}` model in
favour of `MaintJob {daysLeft}`.

## Module contract

- **`src/live/maint.js` (reworked)** — exports:
  - `maintCost(u, axis) → cash` — the cost to queue a restore on `u`'s `axis` (scales with how far the
    axis has decayed below its cap — a near-dead plant costs more).
  - `queueMaint(S, unitId, axis, crewId) → MaintJob | null` *(mutates `S.cash`, `S.maintQueue`,
    reserves the crew)* — refused if the crew is busy, the axis is already queued, or unaffordable.
  - `tickMaint(S, dtH)` *(mutates `S.maintQueue`, fleet + crews on completion)* — ages each job;
    the assigned crew gains XP; on completion restores `u.kpis[axis]` toward `u.caps[axis]` by the
    crew's effectiveness (soft-specialized: on-trade full, off-trade penalised), frees the crew.
  - `maintThroughput(S) → n` — free crews, for the brief's readout.
- **`src/live/crews.js` (reworked)** — crews now carry a live `assignment` (the `MaintJob` id or null);
  `hireCrew` / `promote` unchanged in spirit but feed the rolling queue instead of quarter-end tasks.
- **`src/live/sim.js`** — `step` calls `tickMaint` each tick; the quarter rollover no longer batches
  maintenance. `createGame` seeds `S.maintQueue = []`.
- **`config.js`** — `CFG.v5_1.maint` (lead days by axis/severity, cost curve, crew effectiveness,
  off-trade penalty).
- **`render.js`** — the daily brief (Phase 5) lists the maint queue with ETAs + crew assignments and a
  "queue maintenance" action per plant/axis; the per-plant drill-down shows decay vs cap so the player
  sees what's worth fixing.

## Tasks (TDD)

Rework `tests/maint.test.mjs` (+ touch `tests/crews.test.mjs`).

1. **Queue reserves a crew + deducts cash.** `queueMaint` pushes one `MaintJob`, marks the crew busy,
   subtracts `maintCost`; a second job for a busy crew or an already-queued axis is refused.
2. **Rolling completion restores toward the cap.** `tickMaint` over the job's `daysLeft` raises
   `u.kpis[axis]` toward `u.caps[axis]` (never above), by crew effectiveness; then frees the crew.
3. **Soft specialization.** An on-trade crew restores more per day than an off-trade crew on the same
   job (the penalty from `CFG.v5_1.maint`); both are allowed.
4. **Crew is the maintenance bottleneck — and only maintenance.** With all crews busy, no new maint job
   starts; meanwhile a contractor upgrade job (Phase 3) still progresses (cross-module parallelism).
5. **XP + promotion still work.** Completed jobs grant XP; `promote` (⚡) raises the level ceiling and
   throughput, feeding the rolling queue.
6. **No quarter gating.** A job queued on day 5 completes on day 5+leadDays even across a quarter
   boundary; the quarter rollover performs no maintenance batch.

## Done when

- `npm test` green incl. the reworked suites; the quarter-end `resolveQuarterTasks` path and
  `Task{quartersLeft}` type removed, contract notes updated in both READMEs.
- In play: a plant degrading mid-quarter can be put straight into maintenance; crews are a live,
  triaged resource; maintenance and upgrades visibly progress on independent rolling tracks.

## Notes / caveats

- Reuse the Phase 3 cap/restore relationship exactly — maintenance restores toward `u.caps`, upgrades
  raise `u.caps`. Don't let a maint job exceed the cap or you'll blur the two channels.
- Crews stay *maintenance-only* by design (the grill's "separate labor" decision). If you find yourself
  wanting crews to speed upgrades, that's a design change — raise it, don't slip it in.
- The rolling model makes the crew roster size the key maintenance-throughput dial; keep it a ⚡/cash
  lever so the Phase 6 economy has something to feed.
