# Phase 7 — UI Overhaul

> Part of the [v5.1 rebalance plan](README.md). The capstone: widen the canvas, move the **fleet below
> the demand-vs-capacity graph in four dispatch-role lanes**, seat the **stability HP bar** in the top
> strip, and give upgrades a **per-plant drill-down** and the **daily brief** its panel. Surfaces every
> prior phase's new state. Depends on 1–6. `engine.js` sacred.

## Goal

A week of play showed the single-column console is overcrowded — and v5.1 adds a lot (HP bar, two
rolling queues, a 4×9 upgrade matrix, the brief). This phase re-lays the screen:

- **Wider canvas.** Design for ~1440–1600px max-width with the current narrow layout as a graceful
  fallback (no horizontal scroll at phone/tablet width).
- **Fleet below the graph, full width, four dispatch-role lanes:** *Baseload/firm* · *Dispatchable gas*
  · *Renewable* · *Storage*. Four stable lanes matching the console mental model, immune to tech sprawl.
- **Stability HP bar in the persistent top strip**, beside the KPI readouts — a life bar, always
  visible, colour-ramping as it fills toward collapse.
- **Per-plant upgrade drill-down** — click a plant → its four 9-tier axis ladders, current tier,
  next-tier cost + ETA, queue-upgrade buttons (→ contractor queue).
- **Daily Brief panel** — the blocking-but-skippable beat: day recap, both rolling queues with ETAs,
  demand + next-quarter forecast, quick-add + advance.

This is the one phase that is *feel*-driven — settle fine layout by building a throwaway prototype and
reacting to it, not by speccing pixels.

## Module contract

- **`index.html`** — restructure the live layout containers: top strip (KPIs + HP bar), the graph, the
  four-lane fleet section, the brief panel mount, the per-plant drill-down mount.
- **`styles/live.css`** — the wider grid, the four fleet lanes, the HP-bar states (fill/drain/danger),
  the drill-down panel, the brief panel; responsive fallback to the narrow single column.
- **`render.js`** —
  - `renderFleetLanes(S, actions)` — the fleet grouped into the four dispatch-role lanes (reuse the
    existing per-unit tiles; only the grouping/layout changes).
  - `renderStabilityBar(S)` — the top-strip HP gauge reading `S.stability`.
  - `renderPlantDetail(S, unitId, actions)` — the 4×9 upgrade drill-down (Phase 3 data).
  - `renderBrief(S, actions)` — the brief panel (Phase 5 data).
  - the quarter review card shows the Phase 6 scorecard.
- **`config.js`** — `CFG.v5_1.ui` only if layout needs tunables (breakpoints, lane order).

## Tasks

UI is verified by hand in the browser (per the repo convention — DOM/feel isn't headless-tested); the
pure data behind each panel is already covered by Phases 1–6 suites. Checklist:

1. **Four-lane fleet** renders below the graph at full width; each plant lands in the correct lane by
   dispatch role; reorder-within-lane by urgency still works; no node teardown churn per frame.
2. **HP bar** sits in the top strip, reads `S.stability` live, ramps colour toward collapse, and shows
   a clear fill-vs-drain state.
3. **Upgrade drill-down** opens from a plant, shows all four ladders + tiers + next-cost + ETA, and
   queue-upgrade routes to the contractor queue (reflected in the brief).
4. **Daily brief panel** renders the Phase 5 summary, both queues, forecast, quick-add + advance; the
   three modes (operating / brief / planning) transition cleanly.
5. **Wider canvas** at ~1440–1600px; graceful narrow fallback with no horizontal scroll at phone width
   (test mobile/tablet/desktop via `resize_window`).
6. **No console errors**, 60fps-ish, and every v5.1 state (HP, queues, tiers, scorecard) is reachable.

## Done when

- `npm test` still green (no logic regressions from the render changes).
- Browser-smoked across widths: the crowding is gone, the fleet reads as four operational lanes, the
  HP bar is unmissable, upgrades live one click deep, and the brief is the clear daily home.
- The screen comfortably holds everything v5.1 added without feeling denser than v5 did.

## Notes / caveats

- **Prototype first.** Build a throwaway wide-layout mock, react to it, *then* commit the real
  `render.js`/CSS changes. Don't design the four-lane + drill-down + brief layout blind.
- Nothing here is sacred (the player said so) — the v4.2 Control Room layout can be overhauled wholesale
  if the wider canvas wants it; keep the per-unit tile internals if they still read well, change the
  arrangement freely.
- Keep all DOM in `render.js` and all scheduling in the Phase 3/4/5 queue functions — the overhaul is
  layout, not a new place for state mutation.
