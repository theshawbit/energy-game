# Phase 5 — Construction

> Part of the [v5 implementation plan](README.md). Turns new plants into **multi-quarter lead-time
> capital projects** with an **overextension soft-cap**, making demand forecasting a real planning
> skill. Depends on Phase 3 (a completed build enters the fleet with KPIs) and Phase 1 (commit at
> quarter-end; `tickBuilds` on rollover). `engine.js` sacred.

## Goal

You commit capital at a quarter-end to start a build; the plant **produces nothing until it comes
online** quarters later (gas fast, nuclear slow). There's no hard cap on concurrent builds, but push
past a comfortable count and projects **slip** — higher overrun cost and delay risk — and under a
rising demand curve a delayed plant is a brownout. Build ahead of the curve or the growing city
browns you out.

## Module contract

- **`src/live/construct.js` (new, pure)** — exports:
  - `BUILDABLES` — per-tech build spec: capital cost, lead-time in quarters, the KPIs/cap the
    finished unit starts with. Gas short lead, nuclear long.
  - `commitBuild(S, tech) → Build | null` — validates (quarter-end; cash available), deducts
    capital, pushes a `Build` onto `S.builds` with `quartersLeft` = lead-time and a `slipRisk`
    derived from current concurrency.
  - `concurrencySlip(nActive) → slipFactor` — the soft-cap curve: ≤ comfortable count → ~0 slip;
    beyond it → rising overrun cost + per-quarter delay probability. No hard ceiling.
  - `tickBuilds(S, rng)` *(mutates `S.builds`, fleet on completion)* — called at the quarter
    rollover: decrements `quartersLeft`, rolls slip (a slipped build gains a quarter + overrun
    charge), and on completion removes the `Build` and appends a live unit to `S.fleet` (fresh KPIs
    from Phase 3, default dials from Phase 2, a generated name from Phase 9's scheme / v4.2
    `plantName` until then).
  - `forecastDemand(S, quartersAhead) → peakMW` — projects the steepening demand curve so the build
    panel can show "you'll be short in Q+2". Pure read of `peakGrowth`/calendar.
- **`src/live/sim.js` / config** — `CFG.v5.build` (costs, lead-times, comfortable concurrency, slip
  curve, overrun rate). The rollover hook calls `tickBuilds` before `resolveQuarterTasks` ordering is
  documented (completed plants are available for the coming quarter's maintenance planning).
- **`render.js`** — the Planning Office gains a **build queue**: buildables with cost/lead-time, the
  in-flight projects with quarters-remaining and slip warnings, and the demand forecast overlay
  (committed+in-flight capacity vs forecast peak).

## Tasks (TDD)

Create `tests/construct.test.mjs`.

1. **Commit deducts capital and queues a build.** `commitBuild(S, "gas")` at quarter-end → cash down
   by the capital cost, a `Build` on `S.builds` with `quartersLeft` = the tech's lead-time.
2. **Quarter-end only.** `commitBuild` during `"operating"` is refused.
3. **A build produces nothing until online.** While `quartersLeft > 0` the project contributes no MW
   to `avail`/`totalCapacity`.
4. **Completion adds a live unit.** `tickBuilds` to `quartersLeft === 0` removes the `Build` and
   appends a fleet unit with fresh KPIs, default dials, and a proper name; it now dispatches.
5. **Lead-times differ by tech.** Gas completes in its short lead-time; nuclear takes its long one;
   each from the same commit quarter lands on the right future quarter.
6. **Overextension raises slip risk.** `concurrencySlip` is ~0 at/below the comfortable count and
   rises beyond it; a build committed into a crowded queue carries a higher `slipRisk`.
7. **A slip delays and overruns.** With `rng` forcing a slip, `tickBuilds` adds a quarter to
   `quartersLeft` and charges the overrun; no hard cap ever blocks a commit.
8. **Forecast flags a coming shortfall.** With demand steepening, `forecastDemand(S, 2)` exceeds
   committed+in-flight capacity → the panel's "short in Q+2" signal is true. (Locks forecasting as a
   real skill: build ahead or brown out.)
9. **Determinism.** Pinned `rng` → identical slip outcomes across runs.

## Done when

- `npm test` green incl. `construct.test.mjs`.
- In the Planning Office you can commit builds, watch quarters tick down, see slip warnings when you
  overreach, and read a forecast that tells you when the city will outgrow your fleet.
- A nuclear plant committed in Y1Q1 shows up and dispatches at its correct later quarter; an
  over-stuffed queue visibly slips and overruns.

## Notes / caveats

- **Build-ahead is the whole point.** The forecast must be honest about the steepening curve so the
  tension is "commit capital now for capacity you need in a year" — not a surprise.
- Decommissioning / retiring old Rust-District iron is **out of scope** for Phase 5 (a later tier);
  keep this phase to adding capacity.
- Naming: use v4.2's `plantName(tech, n)` until Phase 9's era-aware scheme lands, then reconcile.
