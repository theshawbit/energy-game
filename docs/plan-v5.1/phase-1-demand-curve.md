# Phase 1 — Demand Curve (hybrid step + noise)

> Part of the [v5.1 rebalance plan](README.md). Replaces the compounding +6%/day demand creep — the
> root cause of the unrecoverable blackout — with a **plannable quarterly step + daily weather noise**.
> This is the curve every later phase is tuned against, so it lands first. Depends only on the v5
> calendar. `engine.js` sacred.

## Goal

Today `S.peak *= peakGrowth (1.06)` every day → demand doubles in ~12 days, outrunning any capacity
response. v5.1 makes the curve **two-layered**:

- **A plannable quarterly step.** `S.quarterPeak` is the baseline the quarter sits at; at each
  quarter rollover it steps up by a configured, *forecastable* amount. The player knows next
  quarter's target and builds/upgrades toward it — build-ahead becomes a real skill, not a guess.
- **Daily weather/season noise.** The *actual* `S.peak` each day is `quarterPeak × noise`, where the
  noise wobbles around 1.0 by season (hot summer day spikes high, mild shoulder day sags). Keeps live
  dispatch tense — a hot day can shove you toward the edge — without changing the strategic baseline.

The quarterly step is what the build/upgrade channels (Phases 3–4) aim at; the daily noise is what
the dispatch + fail-state game (Phase 2) fights.

## Module contract

- **`src/live/demand.js` (new, pure)** — exports:
  - `stepDemand(S, dtH) → peak` — compute the live `S.peak` for the current day from `S.quarterPeak`
    × a deterministic seasonal-noise multiplier (reads the Phase 8 regime season + an injected/seeded
    noise stream; `S.calm` flattens noise to 1.0 for tests).
  - `rollQuarterPeak(S)` *(mutates `S.quarterPeak`, `S.nextQuarterPeak`)* — at the quarter rollover,
    advance the baseline by `CFG.v5_1.demand.quarterStep` (optionally scaled by year for the long
    arc), and recompute the one-quarter-ahead forecast.
  - `forecastPeak(S, quartersAhead) → MW` — the honest forward baseline the brief/review/construct
    read to warn "you'll be short in Q+N". Pure read of `quarterPeak` + the step.
- **`src/live/sim.js`** — the demand block calls `stepDemand` instead of the `peakGrowth` multiply;
  the quarter rollover calls `rollQuarterPeak`. `S.peakGrowth` and its compounding are retired.
- **`src/live/config.js`** — `CFG.v5_1.demand` (startPeak, quarterStep, per-year scaling, seasonal
  noise amplitude by season). `CFG.startPeak`/`peakGrowth` stay only for any v4 code paths not on the
  v5 loop.

## Tasks (TDD)

Create `tests/demand.test.mjs`.

1. **Baseline steps at the rollover, not daily.** Within a quarter `S.quarterPeak` is constant across
   days; `rollQuarterPeak` raises it by exactly `CFG.v5_1.demand.quarterStep` (and the per-year factor
   if configured). No per-day compounding remains.
2. **Live peak = baseline × seasonal noise.** `stepDemand` returns `quarterPeak` when `S.calm`
   (noise flattened), and a season-appropriate wobble otherwise (summer amplitude > shoulder); the
   wobble is bounded by `CFG.v5_1.demand` and never ratchets the baseline.
3. **Determinism.** Pinned noise stream → identical daily peaks across runs; `S.calm` → flat.
4. **Forecast is honest.** `forecastPeak(S, n)` equals the baseline after `n` applied steps — the
   value the player plans against matches what actually arrives (no hidden compounding gap).
5. **Plannability invariant.** Over a full year, max daily `S.peak` stays within
   `quarterPeak × (1 + maxNoise)` — i.e. a well-forecast operator is never surprised by more than the
   configured noise band. (This is the regression guard against the old runaway curve.)

## Done when

- `npm test` green incl. `demand.test.mjs`; existing suites that read `S.peak`/`peakGrowth` rebased.
- A fresh game: demand holds steady within a quarter (with daily wobble), steps up visibly at the
  review, and the brief/review can state next quarter's target MW.
- Hand-check: it is now *possible* to stay ahead of demand with the capacity channels — the curve no
  longer outruns every response (full validation lands once Phases 3–4 exist).

## Notes / caveats

- This phase only reshapes demand; it does **not** add the capacity channels that answer it (Phases
  3–4) or the fail-state that punishes falling behind (Phase 2). After this phase alone the game is
  *easier* (no runaway), which is expected — the difficulty is re-seated by the later phases.
- Keep the seasonal noise sourced from the Phase 8 regime season so weather, events, and demand stay
  one coherent system; don't invent a second season concept.
- Tuning the step size / noise amplitude is a `tools/balance.mjs` job, not a guess here — the test
  pins *shape* (stepped, bounded, forecastable), not the magic numbers.
