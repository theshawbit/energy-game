# Grid Operator — Documentation Map

This folder holds the design roadmaps, build plans, and narrative bibles for Grid Operator.
Each doc is tagged with its status so you can tell at a glance what reflects the **shipped**
game, what's **planned**, and what's been **superseded**.

> **Game status:** the live game shipped through **v4.2.6** was a real-time **survival
> roguelike**; the **v5 genre pivot is now building**. Phase 1 (time & calendar, no
> game-over), Phase 2 (dial-able dispatch; the peaker retired for fast gas), Phase 3
> (four KPIs + style-driven degradation replacing `condition`), Phase 4 (cut-throat
> quarter-end maintenance worked by a levelling crew pool), and Phase 5 (lead-time
> construction with an overextension soft-cap) shipped 2026-10-29, and Phase 6 (the
> hybrid floor+swing economy with the overlord's quarterly verdict), Phase 7
> (progression — per-axis specialization, RP ceiling-raises, and ⚡ perks with
> growth-tier-gated automation; the v4 Mk ladder retired), and Phase 8 (the
> mid-quarter crisis toolkit — load-shed + demand response — and the seasonal event
> regime) shipped 2026-10-30 — the
> grid is persistent, the run reset is gone, every plant dispatches on dials, how you
> run a plant decides which KPI decays, repairs are triaged at the board review,
> new plant is a multi-quarter capital project committed there too, the quarter
> now settles on a regulated floor + market swing graded by a scored board verdict
> (failure is stagnation, never a game-over), plants grow deeper by specializing
> their four KPI axes past nameplate, and a failing plant mid-quarter can be survived
> by shedding a prioritised load tier or firing pre-built demand response while the
> seasons colour each quarter's weather and events, and the district itself grows
> from the Rust District into New Veridia with a deadpan dispatch-AI (C.A.S.S.) and
> the overlord's barbed verdict voice layered over the whole sim as pure flavour;
> v5 is now fully built (all 9 phases). See [`ROADMAP-v5.md`](ROADMAP-v5.md) and
> [`plan-v5/`](plan-v5/README.md). Some roguelike docs below still describe superseded
> run-based mechanics.

## Design roadmaps (the "what & why")

| Doc | Version | Status |
| :-- | :-- | :-- |
| [`ROADMAP-v2.md`](ROADMAP-v2.md) | v2 | ✅ Shipped — the real-time roguelike core |
| [`ROADMAP-v3.md`](ROADMAP-v3.md) | v3 | ✅ Shipped — research tech tree, mutators, meta-gating |
| [`ROADMAP-v4.md`](ROADMAP-v4.md) | v4 | ✅ Shipped — "The Book": contracts + spot, financing, forecast, scoring |
| [`ROADMAP-v5.md`](ROADMAP-v5.md) | v5 | ✅ **Built** — persistent management/ops-sim pivot (parent program spec) |

## Build plans (the "how")

| Doc | Version | Status |
| :-- | :-- | :-- |
| [`PLAN-v3.md`](PLAN-v3.md) | v3 | ✅ Built |
| [`PLAN-v4.md`](PLAN-v4.md) | v4 | ✅ Built (phases A–G) |
| [`PLAN-v4.2-control-room.md`](PLAN-v4.2-control-room.md) | v4.2 | ✅ Built — Control Room UI redesign (CR-1…CR-4) |
| [`PLAN-v4.2.1-reliability-and-volatility.md`](PLAN-v4.2.1-reliability-and-volatility.md) | v4.2.1–4.2.3 | ✅ Built — wear = load × age, rare trips, volatile net-load |
| [`plan-v5/`](plan-v5/README.md) | v5 | ✅ Built — phased implementation spec (9 phases); Phases 1–5 shipped 2026-10-29, Phases 6–9 shipped 2026-10-30 |
| [`plan-v5.1/`](plan-v5.1/README.md) | v5.1 | 🚧 Building — rebalance & rework (7 phases); Phase 1 (hybrid demand curve) shipped 2026-10-30; remaining: fail-state/HP bar, 4×9 upgrades + contractor queue, rolling maintenance, daily brief, KPI→currency, UI overhaul |

## Narrative bibles (later flavour layer)

| Doc | Scope | Status |
| :-- | :-- | :-- |
| [`STORYLINE-v5-new-veridia.md`](STORYLINE-v5-new-veridia.md) | New Veridia / C.A.S.S. setting bible | 📋 Reference — fits the v5 pivot; `Mk` refs need reconciling to the KPI/axis model |
| [`STORYLINE-v5-script.md`](STORYLINE-v5-script.md) | Full narrative script | 📋 Reference — same reconciliation pending |

## Operations

| Doc | Purpose |
| :-- | :-- |
| [`DEPLOY.md`](DEPLOY.md) | How the live build is served (GitHub Pages from `main`, no build step, no CI) |

---

*For the running version history, see [`../CHANGELOG.md`](../CHANGELOG.md). For gameplay and
project layout, see the [root README](../README.md).*
