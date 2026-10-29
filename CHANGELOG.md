# Changelog

All notable changes to Grid Operator are recorded here. Versions follow the game's own
`vMAJOR.MINOR.PATCH` line (the same tags used in the git history and the `docs/` roadmaps).
This project has **no CI**; every merge to `main` redeploys the live build via GitHub Pages.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Planned — v5 "The Persistent Grid" (scoped, not built)

A **genre pivot** from survival roguelike to a persistent management / operations sim: one
grid you own and grow, no run reset, the goal being to keep a growing city powered. Fully
scoped in a design grill (pivot 2026-10-27, refined 2026-10-28) and captured in
[`docs/ROADMAP-v5.md`](docs/ROADMAP-v5.md). Headline design: a **daily** tactical loop (~3-min
live day) inside a **Year ▸ Quarter ▸ Day** calendar (quarter = season = fiscal period, ~22
days, ending in a scored board review); variable auto-pause clock; **Core+ dial-able dispatch**
(commitment · output band · reserve hold · push; peakers dissolve into tunable gas); four
axis-aligned KPIs mapped 1:1 to revenue; operating-style-driven degradation; **cut-throat
quarter-end maintenance** with a soft-specialized, levelling crew pool; lead-time construction
with an overextension soft-cap; a **hybrid economy** — regulated capacity floor + market swing
(which *revives* `market.js`/`finance.js`/`capacity.js` rather than retiring them); three
currency lanes with ⚡ automation gated to late game; emergent specialization; and a
**corporate-dystopian, Rust-District-→-New-Veridia** tone. `engine.js` stays sacred. The phased implementation spec
lives in [`docs/plan-v5/`](docs/plan-v5/README.md) (9 phases); it retires the earlier
`PLAN-v5.1-progression.md`.

## [4.2.6] — 2026-10-26

- Proper generated plant names (`Harrowgate Nuclear`, `Blackmoor Coal`, …) via a
  `plantName(tech, n)` helper + per-tech place-name pools; retires the `Coal A` / `Solar
  Farm 2` placeholders.

## [4.2.5] — 2026-10-26

- How-to / FAQ reworked as an operator briefing.

## [4.2.4] — 2026-10-25

- Fleet is now a live monitor **table** rather than a bank of cards.

## [4.2.1 – 4.2.3] — 2026-10-25/26

- **Reliability & volatility model.** Wear rebuilt as a function of **load × age** (fair,
  strategic decay); trip hazard is **condition-gated** rather than a flat base rate, tuned
  via a lookup table; added an overhaul service tier.
- Rare trips + a **volatile net-load curve** as the real moment-to-moment challenge.
- Live readouts decoupled from frame rate (calm display cadence).
- See [`docs/PLAN-v4.2.1-reliability-and-volatility.md`](docs/PLAN-v4.2.1-reliability-and-volatility.md).

## [4.2.0] — 2026-10-25

- **"Control Room" UI/UX redesign** (CR-1…CR-4): relocated/redesigned command bar with a
  no-scroll skeleton, master status cluster + derived operator readouts, fleet as a live
  instrument bank, and a control-room strip-chart + annunciator event log.
- See [`docs/PLAN-v4.2-control-room.md`](docs/PLAN-v4.2-control-room.md).

## [4.1.0] — 2026-10-25

- Gameplay feel: reworked trips + softened cold-start economy.
- Contract ladder: hedging is now **additive**, with a managed book.
- Full landing page + a live screen that fills the viewport.

## [4.0.0] — 2026-10-25

- **"The Book" economy.** Revenue = contracted blocks at a locked price + residual served
  load at a live **spot price** driven by your own reserve margin (thin-but-covered pays;
  a shortfall never does).
- **Financing:** debt, credit, and bankruptcy — the economic teeth.
- **Earned forecast:** a fog model + forecast research branch + a chaotic-market mutator.
- Multi-track scoring + stats hub; meta economy unlocks, a finite-run win condition, a
  capacity market, and buyer offers.
- Data-driven spot tuning (via a balance harness) to tame windfalls.
- See [`docs/ROADMAP-v4.md`](docs/ROADMAP-v4.md) and [`docs/PLAN-v4.md`](docs/PLAN-v4.md).

## [3.0.0] — 2026-10-18

- **Research tech tree** (the v3 core): divert in-run cash into an R&D lab for Research
  Points, spent across transmission/efficiency, storage, demand-response, and generation
  branches (unlocking SMR, geothermal, and carbon capture).
- Per-run **mutator deck** (fuel spike, heat wave, cold snap, drought, renewable lull) and
  **meta-gating** of research branches via permanent ⚡ unlocks.
- Deferred: a "juice" pass (screen-shake, celebration/breakthrough feedback, sound).
- See [`docs/ROADMAP-v3.md`](docs/ROADMAP-v3.md) and [`docs/PLAN-v3.md`](docs/PLAN-v3.md).

## [2.0.0] — 2026-10-11

- **Real-time roguelike core**: the live 24-hour dispatch loop, wear/trips, Manage planning
  panel, milestones, scoring, and the cross-run meta-currency (⚡) with skills.
- See [`docs/ROADMAP-v2.md`](docs/ROADMAP-v2.md).

## [1.x] — original MVP

- The original single-file turn-based "build a fleet to 2050" simulator, preserved in
  [`archive/`](archive/) and as the reference build at [`batch/index.html`](batch/index.html).

[Unreleased]: https://github.com/theshawbit/energy-game/compare/main...HEAD
