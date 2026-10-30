# Grid Operator v5 — Implementation Plan (master index)

> **Status: building. Phase 1 shipped (2026-10-29); Phases 2–9 planned.** This is the
> engineering decomposition of [`docs/ROADMAP-v5.md`](../ROADMAP-v5.md) (the program spec)
> into nine independently shippable phases. The ROADMAP is *what and why*; this folder is
> *how and in what order*. `engine.js` stays **sacred** throughout — `dispatchHour()` +
> `marginalCost()` untouched.

v5 is effectively a new game on the shared engine: the roguelike *run* is gone, replaced by one
persistent grid you grow across a **Year ▸ Quarter ▸ Day** calendar. The build is a **clean break**
— a new `gridop.v5` localStorage namespace, v4 save keys left untouched, **zero migration code in
any phase**.

---

## The nine phases

Each phase is its own PR (per the repo's per-PR flow), test-green and independently playable, with
its own doc below. The order matches the ROADMAP's build sequencing; the dependency graph (next
section) is what actually gates them.

| # | Phase | Doc | Module(s) it owns | Status |
| :-- | :--- | :--- | :--- | :--- |
| 1 | **Time & calendar skeleton** | [phase-1-time-calendar.md](phase-1-time-calendar.md) | `calendar.js`, `clock.js` | ✅ shipped 2026-10-29 |
| 2 | **Dial-able dispatch** | [phase-2-dispatch-dials.md](phase-2-dispatch-dials.md) | `dispatch.js` | ☐ planned |
| 3 | **KPIs & degradation** | [phase-3-kpis-degradation.md](phase-3-kpis-degradation.md) | `kpi.js` | ☐ planned |
| 4 | **Maintenance & crews** | [phase-4-maintenance-crews.md](phase-4-maintenance-crews.md) | `crews.js`, `maint.js` | ☐ planned |
| 5 | **Construction** | [phase-5-construction.md](phase-5-construction.md) | `construct.js` | ☐ planned |
| 6 | **Hybrid economy** | [phase-6-hybrid-economy.md](phase-6-hybrid-economy.md) | revives `market.js`/`finance.js`/`capacity.js`, `verdict.js` | ☐ planned |
| 7 | **Progression** | [phase-7-progression.md](phase-7-progression.md) | `progression.js` | ☐ planned |
| 8 | **Crisis toolkit & events** | [phase-8-crisis-events.md](phase-8-crisis-events.md) | `crisis.js`, `events.js` | ☐ planned |
| 9 | **World & narrative** | [phase-9-world-narrative.md](phase-9-world-narrative.md) | `world.js` + copy | ☐ planned |

The retired `PLAN-v5.1-progression.md` (legacy roguelike-era progression plan) was removed when this
plan folder landed; its live references in `docs/README.md`, `ROADMAP-v5.md`, and `CHANGELOG.md` now
point here. The `Mk`-ladder references still in the storyline bibles are reconciled in Phase 9.

---

## Dependency graph

```
                 ┌─────────────────────────────┐
                 │ 1 · Time & calendar skeleton │  (the new S shape + step() orchestrator)
                 └──────────────┬──────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
 ┌─────────────────┐  ┌───────────────────┐  ┌─────────────────┐
 │ 2 · Dispatch    │  │ 3 · KPIs &        │  │ 8 · Events       │  (seasonal regime can
 │   dials         │  │   degradation     │  │   (regime half)  │   land early; crisis
 └────────┬────────┘  └─────────┬─────────┘  └─────────────────┘   toolkit waits on 6)
          │                     │
          │        ┌────────────┼────────────┐
          │        ▼            ▼            ▼
          │  ┌───────────┐ ┌──────────┐ ┌───────────┐
          │  │ 4 · Maint │ │ 5 · Con- │ │ 6 · Hybrid │
          │  │ & crews   │ │ struct   │ │  economy   │
          │  └───────────┘ └──────────┘ └─────┬─────┘
          │                                    │
          └──────────────┬─────────────────────┘
                         ▼
                 ┌───────────────┐      ┌──────────────────┐
                 │ 7 · Progres-  │      │ 9 · World &      │  (flavour layer; depends on
                 │   sion        │      │   narrative       │   nothing mechanical, lands last)
                 └───────────────┘      └──────────────────┘
```

**Hard edges:** 2, 3 and 8(regime) need only Phase 1. **4** and **5** need 3 (KPIs are what you
maintain / build toward). **6** needs 2 + 3 (dials drive floor-vs-swing; KPIs map to revenue). **7**
needs 3 + 6 (upgrades move KPI axes; ⚡/RP spend against the economy). **8(crisis toolkit)** needs 6
(load-shed/DR settle against the economy). **9** is pure flavour — it can technically land any time
after Phase 1 but is sequenced last so copy reconciles against the finished mechanics.

---

## Shared interface contract

This is the spine that lets every phase doc reference real types. **Phase 1 declares the whole `S`
shape and every unit field below** — fields are real from day one, even where the owning phase wires
their behaviour later (a dormant field holds its sane default and is simply not yet read). No phase
invents a field that isn't declared here; adding one is a contract change, noted at the top of this
section's changelog line and in the touching phase's doc.

### Game state `S`

```js
S.calendar = {
  year,                 // 1..N — the long arc; demand steepens year-over-year
  quarter,              // 1..4 — season = fiscal period = event regime
  dayInQuarter,         // 1..CFG.v5.daysPerQuarter (~22)
  absDay,               // monotonic day counter across the whole save (never resets)
  mode,                 // "operating" (live day) | "planning" (quarter-end board review)
};
S.clock = {
  speed,                // 0 = paused (read-only) | 1 = 1× | CFG.v5.fastSpeed = fast-forward
  autoPaused,           // true when a crisis auto-paused the clock this frame
};
S.money = { cash, rp, zap };   // three currency lanes; zap === ⚡ ("Guild Cred")

S.crews  = [ Crew, … ];        // the soft-specialized levelling pool (Phase 4)
S.builds = [ Build, … ];       // in-flight lead-time construction projects (Phase 5)
S.economy = {
  floorRate,            // regulated capacity-floor rate (availability pay), set by last verdict
  swingPnL,             // running market-swing PnL this quarter
  lastVerdict,          // Verdict from the most recent quarter-end review (null at game start)
};
S.quarterLog = { … };          // accumulators the board review reads (served, breaches, PnL, KPI avgs)

// No S.over / S.won / S.maxRunDays / S.reason — v5 has no run end. Failure is stagnation
// (see Phase 6 verdict + Phase 1 "no game-over" note), surfaced as state, never a terminal flag.
```

### Per-unit fields

```js
u.kpis = {              // replaces the single u.condition %
  reliability,          // 0..100 — trip risk / mechanical health (≈ old condition)
  efficiency,           // 0..100 — heat rate → $/MWh & fuel burn
  output,               // 0..100 — effective max MW / derate
  flexibility,          // 0..100 — ramp speed + min stable load
};
u.dials = {             // the Core+ live dials (Phase 2)
  commit,               // bool — online / offline
  bandMin, bandMax,     // MW — the moveable output band the engine clears within
  reserveHold,          // 0..1 — headroom kept available (floor) vs pushed to swing
  push,                 // 0..1 — run hard (PnL now, faster wear) vs easy (preserve KPIs)
};
u.caps = {              // per-axis upgrade ceilings (Phase 7; RP raises them)
  reliability, efficiency, output, flexibility,
};
```

### Canonical types

```js
Crew   = { id, name, trade, level, xp, assignment };
         // trade ∈ KPIAxis; off-trade work is allowed at a penalty (soft-specialized)
Build  = { id, tech, quartersLeft, cost, slipRisk };
         // produces nothing until quartersLeft hits 0; slipRisk rises with overextension
Task   = { id, axis, unitId, crewId, quartersLeft };   // a scheduled quarter-end maintenance job
Verdict= { year, quarter, kpiScore, pnl, floorRateNext, bonus, fine, note };
KPIAxis = "reliability" | "efficiency" | "output" | "flexibility";
```

### Signatures (what each phase exports; the arrow names the consumer)

| Signature | Owner | Consumed by |
| :--- | :--- | :--- |
| `advanceCalendar(S) → {rolledDay, rolledQuarter, rolledYear}` | 1 | sim loop, all |
| `isQuarterEnd(S) → bool` | 1 | 4, 5, 6 |
| `tickClock(S, dt) → dtH` | 1 | sim loop |
| `applyDials(u) → { min, max, committed }` | 2 | sim dispatch, 6 |
| `degradeKPIs(u, style, dtH)` *(mutates `u.kpis`)* | 3 | sim loop |
| `revenueCoeffs(u.kpis) → { floor, margin, volume, capture }` | 3 | 6 |
| `assignCrew(S, crewId, taskId) → Task` | 4 | planning UI |
| `resolveQuarterTasks(S)` *(mutates fleet + crews)* | 4 | 1 (quarter rollover) |
| `commitBuild(S, tech) → Build` | 5 | planning UI |
| `tickBuilds(S)` *(mutates `S.builds`, fleet on completion)* | 5 | 1 (quarter rollover) |
| `settleQuarter(S) → Verdict` | 6 | 1 (planning mode), 7 |
| `applyUpgrade(S, unitId, axis) → bool` | 7 | planning UI |
| `triggerLoadShed(S, tier)` / `triggerDemandResponse(S)` | 8 | operating UI |
| `rollRegime(S)` | 8 | 1 (quarter rollover) |

---

## Conventions every phase doc follows

- **TDD, bite-sized.** Each task is a *test → make it pass* pair. The test names the invariant; the
  code is the smallest change that satisfies it. No task adds untested logic to a pure module.
- **Test harness.** New suites are self-executing `tests/*.test.mjs` files (node, no deps),
  auto-discovered by `tools/run-tests.mjs` — a new file needs **no** `package.json` edit. They use
  the shipped `check(name, cond, detail)` + `process.exit` pattern (see
  [`tests/research.test.mjs`](../../tests/research.test.mjs)). Pure modules are tested headless;
  DOM/feel is verified by hand in the browser.
- **Determinism.** Tests that drive `step()` must pin noise the way the suite does today
  (`Math.random = () => 0.5`, or `S.calm = true` to suppress jitter/spikes). Any new RNG in a v5
  module takes an injected stream so tests stay reproducible.
- **Purity boundary (unchanged from v4).** `engine.js` sacred · `sim.js` owns all `S` mutation ·
  `render.js` owns all DOM · `config.js` holds every tunable (new v5 knobs under `CFG.v5`). New
  phase modules are **pure** (state in → values out, or an explicit mutate-this-`u`), so they test
  headless.
- **Balance is data-driven.** Numerics (day length, days/quarter, decay rates, floor/verdict
  formulas, crew wages, cost curves, event odds) live in `CFG.v5` and are tuned via
  `tools/balance.mjs`, not eyeballed. The real-second-constant re-tune (`strainRate`,
  `strainRecover`, `bankruptcyGrace` don't auto-scale when `secondsPerDay` goes 48→180) is an
  explicit task in Phases 1 and 6.
- **CHANGELOG + docs/README.** Each merged phase updates `CHANGELOG.md` and flips its row here/in
  `docs/README.md` to shipped.

---

*Decomposed from [`docs/ROADMAP-v5.md`](../ROADMAP-v5.md) (design grill 2026-10-27/28). Supersedes
[`docs/PLAN-v5.1-progression.md`](../PLAN-v5.1-progression.md) (retired in Phase 1). The ROADMAP is
living input — treat this plan as the current best shared understanding, not frozen.*
