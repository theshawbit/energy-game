# Phase 1 — Time & Calendar Skeleton

> Part of the [v5 implementation plan](README.md). Builds the **Year ▸ Quarter ▸ Day** calendar, the
> ~3-minute variable-speed clock with auto-pause, the new persistent `S` shape, and the two-mode
> (Operating Room / Planning Office) shell. **This is the foundation** — every later phase hangs off
> the state shape and the `step()` orchestrator this phase lays down. Depends on nothing but the
> sacred `engine.js`.

## Goal

A playable loop with **no run end**: the clock runs a ~180s day, `advanceCalendar` rolls days into
quarters into years, and on a quarter-end the game flips to a (stub) Planning Office and back. The
old `day`/`maxRunDays`/`won`/`over` run machinery is gone; the full v5 `S` shape from the
[interface contract](README.md#shared-interface-contract) exists with sane defaults, even for fields
later phases wire. Demand still rises day-over-day so the thing is alive, but KPIs, dials, crews,
builds, and the hybrid economy are dormant placeholders (their phases fill them).

## Module contract

- **`src/live/calendar.js` (new, pure)** — owns calendar arithmetic. Exports:
  - `advanceCalendar(S) → { rolledDay, rolledQuarter, rolledYear }` — bumps `dayInQuarter`/`absDay`;
    on overflow rolls the quarter (resetting `dayInQuarter` to 1) and, on Q4→Q1, the year. Returns
    which boundaries were crossed so the orchestrator can fire quarter-end / year hooks. **Does not**
    touch demand or any other subsystem — pure calendar.
  - `isQuarterEnd(S) → bool` — true on the last day of a quarter (the day whose completion triggers
    the board review).
  - `quarterLabel(S) → string` / `seasonOf(quarter) → "winter"|"spring"|"summer"|"autumn"` — display
    + the hook Phase 8's regime reads.
- **`src/live/clock.js` (new, pure)** — owns time scaling. Exports:
  - `tickClock(S, dt) → dtH` — converts real seconds to game-hours using `CFG.v5.secondsPerDay`,
    honouring `S.clock.speed` (0 → returns 0, read-only pause; `fastSpeed` → multiplies). Single
    source of the dt→dtH conversion that `step()` currently inlines.
  - `setSpeed(S, speed)` — clamps to the allowed set `{0, 1, fastSpeed}`.
  - `autoPause(S, reason)` — sets `S.clock.speed = 0`, `S.clock.autoPaused = true`, stamps the reason
    for the view; the crisis hooks in later phases call this.
- **`src/live/sim.js` (rewrite of `createGame` + `step` scaffolding)** — `createGame()` returns the
  new `S` shape; `step()` becomes the orchestrator: `tickClock` → advance sim hour → on hour-wrap
  call `advanceCalendar` and fire the quarter-end hook (flip `S.calendar.mode`). The v4 run-end block
  (`surviveDay`'s `maxRunDays`/`won`/`gameOver`) is **removed**; nothing sets `S.over`.
- **`src/live/config.js`** — add a `CFG.v5` block: `secondsPerDay` (~180), `daysPerQuarter` (~22),
  `quartersPerYear: 4`, `fastSpeed`, `startYear: 1`, `startQuarter: 1`. Leave the v4 `run` block in
  place (batch build still imports it) but stop reading it in the live path.
- **`render.js` + screens** — a minimal two-mode shell: Operating Room is the existing Control Room
  with a calendar readout (Y/Q/D, season, speed control); Planning Office is a stub panel that says
  "Quarter N review" with a **Begin next quarter** button. No review content yet (Phase 6 fills it).

## Already done (with the plan folder)

`docs/PLAN-v5.1-progression.md` was retired when this plan landed, and its live references in
`docs/README.md`, `ROADMAP-v5.md`, and `CHANGELOG.md` were repointed here. Nothing doc-side is left
for this phase. (The `Mk`-ladder references remaining in the storyline bibles are Phase 9's
reconciliation, not Phase 1's.)

## Tasks (TDD — test → make it pass)

Create `tests/calendar.test.mjs` and `tests/clock.test.mjs`. Each task is one invariant.

### Calendar

1. **Fresh game starts at Y1 Q1 D1.** `createGame()` → `S.calendar` is
   `{ year:1, quarter:1, dayInQuarter:1, absDay:1, mode:"operating" }`.
   *Code:* new `createGame` builds `S.calendar` from `CFG.v5`.
2. **A day advances within a quarter.** `advanceCalendar(S)` from D1 → `dayInQuarter:2`, `absDay:2`,
   quarter/year unchanged; returns `{rolledDay:true, rolledQuarter:false, rolledYear:false}`.
3. **Quarter rolls on the last day.** Set `dayInQuarter = CFG.v5.daysPerQuarter`; `advanceCalendar`
   → `quarter:2`, `dayInQuarter:1`, `absDay` still monotonic (+1); `rolledQuarter:true`.
4. **Year rolls after Q4.** From `quarter:4, dayInQuarter:daysPerQuarter` → `year:2`, `quarter:1`,
   `dayInQuarter:1`; `rolledYear:true`.
5. **`absDay` is strictly monotonic across rollovers.** Advance N = `4*daysPerQuarter + 3` days from
   fresh; assert `absDay === N+1` and `year:2, quarter:1`.
6. **`isQuarterEnd` fires exactly once per quarter.** Walk a full quarter; assert it is true only on
   `dayInQuarter === daysPerQuarter`.
7. **`seasonOf` maps the four quarters** to winter/spring/summer/autumn (the regime hook contract).

### Clock

8. **Pause is read-only (zero time).** `S.clock.speed = 0`; `tickClock(S, 1.0) === 0` and `S.t`
   unchanged after a `step`.
9. **1× matches the configured day length.** `tickClock(S, dt)` returns `dt * 24 / CFG.v5.secondsPerDay`;
   a full real-time day (`dt = secondsPerDay`) returns 24 game-hours.
10. **Fast-forward scales by exactly `fastSpeed`.** `tickClock` at `fastSpeed` returns
    `fastSpeed ×` the 1× value.
11. **`setSpeed` rejects out-of-set values** (clamps/ignores anything not in `{0,1,fastSpeed}`).
12. **`autoPause` stops the clock and flags it.** After `autoPause(S, "trip")`: `speed === 0`,
    `autoPaused === true`, reason readable.

### Orchestrator / loop

13. **`step` advances the calendar on an hour-wrap, not every frame.** Drive `step` with small `dt`s
    summing past 24 game-hours; assert `advanceCalendar` fired once (one `absDay` bump), demand
    re-rolled, not once per frame. *(Mirror the existing `S.t >= 24` wrap test.)*
14. **No game-over anywhere.** Run `step` for several simulated quarters with a deliberately
    under-built fleet (chronic shortfall); assert `S.over` is never set and the loop keeps running —
    failure is stagnation, not a terminal flag. *(This is the explicit death of the roguelike
    run-end; the shortfall still drives strain/brownout, but never ends the game.)*
15. **Quarter-end flips to planning mode.** Advance to `isQuarterEnd`; after the wrapping `step`,
    `S.calendar.mode === "planning"` and the clock auto-paused. A `beginNextQuarter(S)` helper flips
    back to `"operating"` and advances into the new quarter.
16. **Demand steepens year-over-year, continuously day-over-day.** Assert `S.peak` after a full year
    is higher than at start by the configured growth, with no run-reset discontinuity. *(Reuses the
    existing `peakGrowth`; this just confirms it survives the calendar rewrite.)*

### Balance / re-tune task (flagged, not blocking)

17. **Real-second constant audit.** Add a `tools/balance.mjs` note/case: with `secondsPerDay` at
    ~180 (vs 48), confirm `strainWarn` gives the intended ~12s warning window and record that
    `strainRate`/`strainRecover`/`bankruptcyGrace` still need the Phase 6 re-tune (they govern
    economy death, which doesn't exist yet in Phase 1). Document the numbers; don't tune blind.

## Done when

- `npm test` green, including the two new suites.
- A fresh game runs a visible ~3-min day, the calendar readout ticks Y/Q/D, speed control
  (pause/1×/fast) works and pause is read-only.
- Reaching a quarter-end auto-pauses and shows the Planning Office stub; **Begin next quarter**
  resumes into the next quarter.
- Playing into a chronic shortfall degrades the grid (strain/brownout) but **never ends the game**.
- `CHANGELOG.md` + `docs/README.md` updated to flip this phase's row to shipped.

## Notes / carried caveats

- The two-mode shell is deliberately thin here; Phase 6 fills the Planning Office with the real
  board review, Phase 4/5/7 add their panels to it. Phase 1 only proves the *transition* works.
- Keep the Operating Room a strict extension of the shipped v4.2 Control Room — don't redesign it;
  v5 adds the calendar/speed strip and (later) the dials.
- `S.calm` (suppresses jitter/spikes for deterministic tests) must survive the rewrite — the test
  suites rely on it.
