# Phase 4 — Maintenance & Crews

> Part of the [v5 implementation plan](README.md). Builds the **cut-throat, quarter-end-only**
> maintenance model and the **soft-specialized, levelling crew pool** that works it. Depends on
> Phase 3 (the four KPIs are what you repair) and Phase 1 (the quarter-end hook + planning mode).
> `engine.js` sacred.

## Goal

All maintenance is scheduled at the quarter-end board review: you triage the quarter's accumulated
KPI decay, assign crews to per-KPI tasks, and those tasks resolve (with downtime) over the *next*
quarter. A plant that degrades or trips mid-quarter you **operate around for up to ~22 days — no
emergency buy-out.** Crews are a fungible pool, each best at one trade (KPI axis) but able to take
any task at a penalty; they level passively through use, and ⚡ promotes standouts and raises the
roster ceiling.

## Module contract

- **`src/live/maint.js` (new, pure)** — exports:
  - `TASKS` — the per-KPI task catalogue: `overhaul→reliability`, `retune→efficiency`,
    `uprate→output`, `recalibrate→flexibility`. Each: base KPI restore, base duration (in days /
    quarters), base cost.
  - `scheduleTask(S, unitId, axis, crewId) → Task` — validates (quarter-end only; crew free) and
    pushes a `Task` onto `S.tasks`; deducts the cash cost; marks the unit's downtime window.
  - `taskRestore(task, crew) → kpiPoints` — how much of the axis a given crew repairs, after the
    crew's level and on/off-trade modifier.
  - `resolveQuarterTasks(S)` *(mutates fleet + crews)* — called at the quarter rollover (Phase 1
    hook): completes finished tasks (restore the KPI axis, clear downtime), advances in-flight ones,
    and awards crew XP for work done.
- **`src/live/crews.js` (new, pure)** — exports:
  - `makeCrew(trade) → Crew`, `tradeModifier(crew, axis) → ×` (1.0 on-trade, `CFG.v5.crews.offTrade`
    penalty off-trade — never 0, so fungible), `gainXP(crew, amount)` *(mutates; passive levelling)*,
    `canLevelUp(crew)`, `promote(S, crewId)` — spends ⚡, raises the crew's cap/level.
  - `hireCrew(S)` — spends cash + counts against the ⚡-gated roster ceiling.
- **`src/live/sim.js` / config** — wages are a standing per-quarter cost deducted at settlement
  (Phase 6 folds them into PnL; until then deduct in the rollover). `CFG.v5.crews` holds counts,
  wages, off-trade penalty, XP curve, promotion ⚡ cost; `CFG.v5.maint` holds the task catalogue
  numbers. The v4 `autoService`/`serviceCost` live path is removed now (replaced wholesale).
- **`render.js`** — the Planning Office gains the **maintenance triage** panel: the fleet's KPI
  deficits, the task menu per plant, a crew roster with trades/levels, and drag/assign; downtime is
  shown as a forecast on next quarter's availability.

## Tasks (TDD)

Create `tests/maint.test.mjs` and `tests/crews.test.mjs`.

### Maintenance

1. **Tasks map to axes.** Each entry in `TASKS` restores exactly its one KPI axis; an overhaul lifts
   reliability, a retune efficiency, etc., none bleed into another axis.
2. **Quarter-end only.** `scheduleTask` while `S.calendar.mode === "operating"` is refused (no
   mid-quarter buy-out); allowed only in `"planning"`.
3. **A task costs cash up front and books downtime.** Scheduling deducts the task cost and marks the
   unit unavailable for the task's duration next quarter.
4. **Tasks resolve over the next quarter.** `resolveQuarterTasks` after enough days completes the
   task, restores the axis toward 100 (by `taskRestore`), clears downtime; a half-elapsed task is
   still in flight.
5. **You operate around mid-quarter failure.** Degrade/trip a plant during `"operating"`; assert no
   repair path exists until the next `"planning"` — the only recourse is the Phase 8 crisis toolkit
   (stubbed assert here: `scheduleTask` refused, grid must cope).

### Crews

6. **On-trade beats off-trade, but off-trade is never blocked.** `taskRestore` with a crew on its
   trade > the same crew off-trade > 0; a crew can be assigned any task (fungible).
7. **Crews level passively through use.** `resolveQuarterTasks` awards XP for completed work;
   crossing the XP curve raises the crew's level and its on-trade edge.
8. **⚡ promotes a standout.** `promote` spends the configured ⚡, fails if ⚡ short, and raises the
   crew's ceiling/level; routes only through the existing ⚡ lane (no new resource).
9. **Roster ceiling gates hiring.** `hireCrew` beyond the ⚡-unlocked ceiling is refused; within it,
   deducts cash and adds a crew at its trade.
10. **Wages are a standing cost.** A quarter with N crews deducts `N × wage` at settlement;
    a crew you can't afford to pay is a real pressure (surfaced, not auto-fired).

## Done when

- `npm test` green incl. both new suites.
- In the Planning Office you can see each plant's KPI deficits, assign crews (on- or off-trade) to
  per-KPI tasks, and watch them resolve with downtime the following quarter.
- Crews visibly level with use; ⚡ promotes standouts; the roster ceiling and wages bite.
- No mid-quarter repair exists; a plant breaking on day 5 of a quarter is yours to nurse to the
  review.

## Notes / caveats

- **Downtime is the teeth.** A task takes the plant (partly) offline next quarter, so triage is a
  real trade-off against serving a rising demand curve — don't make repairs free of availability
  cost.
- Wage deduction lands in the quarter settlement; if Phase 6 isn't merged yet, deduct in the Phase 1
  rollover hook and move it to `settleQuarter` in Phase 6 (note the seam).
- Keep `maint.js`/`crews.js` pure; all assignment UI state lives in `render.js`, all mutation in the
  rollover path.
