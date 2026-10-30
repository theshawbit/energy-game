# Phase 5 — Daily Brief Loop

> Part of the [v5.1 rebalance plan](README.md). Reintroduces the **daily brief** as a
> **blocking-but-skippable** beat: the channel where you review the fleet and add to both rolling
> queues (maintenance + contractor upgrades). Depends on Phases 3 + 4 (it schedules into their queues).
> `engine.js` sacred.

## Goal

The player needs a guaranteed daily touchpoint to plan — but not 22 forced pauses a quarter. The brief
is **blocking but auto-skipping** (grill Q8 option C):

- **A daily beat.** At each day boundary the sim can pause into a short **Daily Brief** — the day's
  events, both rolling queues with ETAs, demand vs capacity + next-quarter forecast, and quick-add
  buttons to queue maintenance / upgrades.
- **Auto-advance through quiet days.** Once your queues are set, the brief **auto-advances** — it skips
  days with nothing to decide and only *yanks you back* on an **exception**: a queue job completes, a
  crisis/auto-pause fires, demand crosses a planning threshold, cash crosses a floor, or the stability
  bar enters a danger band. Early game you're in the brief constantly; once in a groove, it collapses.
- **Builds are surfaced, committed at the review.** New-asset builds (unchanged construction) appear in
  the brief as status lines + a forecast nudge, but are *committed* at the quarter-end board review —
  the brief is for the rolling channels, the review is for the big quarterly commitment.

## Module contract

- **`src/live/brief.js` (new, pure-ish)** — exports:
  - `shouldInterrupt(S) → bool` — true when an exception demands the player's attention (a
    `MaintJob`/`UpgradeJob`/`Build` completed this day, `S.clock.autoPaused`, demand crossed
    `forecastPeak` threshold, cash/stability danger band). The auto-advance gate.
  - `briefSummary(S) → {events, maintQueue, contractorQueue, demand, forecast, alerts}` — the data the
    brief panel renders (pure read; no mutation).
  - `openBrief(S)` / `closeBrief(S)` *(set `S.calendar.mode = "brief" | "operating"`)*.
- **`src/live/sim.js`** — the day-rollover orchestration: on a new day, if `S.autoAdvance` and
  `!shouldInterrupt(S)`, skip the brief and continue; otherwise `openBrief(S)`. `step` no-ops while
  `mode === "brief"` (like planning). `S.autoAdvance` defaults on; entering the brief on an exception
  clears it until the player re-arms "advance".
- **`config.js`** — `CFG.v5_1.brief` (the interrupt thresholds: demand-headroom %, cash floor,
  stability danger band).
- **`main.js`** — the frame loop handles the three modes (`operating` / `brief` / `planning`); the
  brief's quick-add buttons call `queueMaint` (Phase 4) and `queueUpgrade` (Phase 3); an "advance"
  button re-arms `S.autoAdvance` and resumes.
- **`render.js`** — `renderBrief(S, actions)` draws the skippable panel (Phase 7 styles it): day recap,
  both queues with ETAs, demand/forecast, alerts, quick-add + advance.

## Tasks (TDD)

Create `tests/brief.test.mjs`.

1. **Quiet day auto-advances.** With `S.autoAdvance` and no exception, the day rollover does **not**
   open the brief (`mode` stays "operating"); the sim keeps running.
2. **Exceptions interrupt.** Each trigger independently flips `shouldInterrupt` true and opens the brief:
   a completed queue job, an `autoPaused` crisis, demand crossing the headroom threshold, cash/stability
   danger bands.
3. **Brief is a read + schedule surface.** `briefSummary` reports both queues, demand, and the
   next-quarter forecast without mutating `S`; quick-add actions route to `queueMaint`/`queueUpgrade`.
4. **Builds surfaced, not committed here.** The brief lists in-flight builds + the forecast nudge, but
   offers no commit action — committing still only happens in planning mode.
5. **Advance re-arms.** `closeBrief` + re-arming `S.autoAdvance` resumes auto-skip until the next
   exception; the loop never silently strands the player in a frozen brief.
6. **Mode exclusivity.** `step` no-ops in "brief" and "planning"; only "operating" advances the sim —
   no double-stepping across a mode flip.

## Done when

- `npm test` green incl. `brief.test.mjs`.
- In play: early days you drop into the brief often to set queues; once set, the game fast-forwards
  through calm stretches and snaps you back the instant something lands or threatens — and you schedule
  maintenance + upgrades from one place.

## Notes / caveats

- The interrupt set is the whole feel of the mode — too twitchy and it's A's 22 pauses, too lax and
  it's B's "player sleeps through a crisis." Keep the thresholds in config and expect to tune them
  against a prototype (this is the most *feel*-dependent phase — validate by playing, not just tests).
- Reuse Phase 1's `autoPause`/`autoPaused` as one interrupt source; don't build a parallel pause.
- Keep `briefSummary` pure so the panel can be re-rendered freely; all scheduling goes through the
  Phase 3/4 queue functions, never direct `S` pokes from render.
