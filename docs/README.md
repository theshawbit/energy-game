# Grid Operator — Documentation Map

This folder holds the design roadmaps, build plans, and narrative bibles for Grid Operator.
Each doc is tagged with its status so you can tell at a glance what reflects the **shipped**
game, what's **planned**, and what's been **superseded**.

> **Game status:** the live game began as a real-time **survival roguelike** (shipped
> through **v4.2.6**); the **v5 genre pivot to a persistent management / ops sim shipped**
> (all 9 phases, 2026-10-29→30), and the **v5.1** rework, **v5.2** playability pass, and
> **v5.3 "Integrity"** economy-correctness milestone followed. The grid is now persistent (no
> run reset), dispatch is dial-able, plant health is four KPI axes, maintenance and upgrades
> are rolling queues, construction is a lead-time capital project, and the quarter settles on
> a floor + market-swing economy graded by a board verdict — over the New Veridia / C.A.S.S.
> narrative layer. v5.3 is mid-flight: its balance numbers and final in-game copy are the last
> gate (Phase 5). See [`ROADMAP-v5.md`](ROADMAP-v5.md), [`plan-v5/`](plan-v5/README.md), and
> the v5.1–v5.3 phase specs below. Some older roguelike docs still describe superseded
> run-based mechanics — they're tagged as such.

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
| [`plan-v5.1/`](plan-v5.1/README.md) | v5.1 | ✅ Complete — rebalance & rework, all 7 phases shipped 2026-10-30 (hybrid demand curve; fail-state & grid-stability HP bar — reverses v5's no-game-over; 4×9 upgrade ladders + rolling contractor queue; rolling crew-pool maintenance — reverses v5's quarter-end batch; blocking-but-skippable daily brief feeding both rolling queues; quarterly KPI scorecard minting ⚡ to the skill tree — fixes the orphaned currency; UI overhaul — wider canvas, four dispatch-role fleet lanes below the graph, HP bar top strip, per-plant upgrade drill-down) |
| [`plan-v5.2/`](plan-v5.2/README.md) | v5.2 | ✅ Built — playability: the intraday-peak fix (capped saturating shock), a shorter day with auto-pacing, and the strain-bar relabel |
| [`plan-v5.3/`](plan-v5.3/README.md) | v5.3 | 🔨 Building — "Integrity" economy-correctness milestone (feature freeze). Phases 1–3 shipped (continuous `priceServed` clearing price; seeded-RNG balance harness + tests CI; delete inert mechanics → one trouble-meter); Phase 4 (this: docs reconciliation + version stamp) and Phase 5 (balance lock + playtest gate) remain |

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
