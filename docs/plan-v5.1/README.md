# Grid Operator v5.1 — Rebalance & Rework (master index)

> **Status: building (grill 2026-10-30). Phases 1–6 shipped 2026-10-30.** This is the engineering decomposition of the v5.1
> rebalance grill into seven independently shippable phases. v5 shipped all nine phases
> ([`../plan-v5/`](../plan-v5/README.md)); a week of play exposed a structural flaw — **demand
> (compounding +6%/day) outran the only capacity lever (quarter-end builds), dropping the player
> into an unrecoverable mid-quarter blackout with no move left.** v5.1 fixes the pacing, reintroduces
> a real fail-state, splits capacity response into fast (upgrades) + slow (builds) channels on a
> rolling calendar, reconnects the orphaned skill-currency economy, and widens the UI.
> `engine.js` stays **sacred** throughout — `dispatchHour()` + `marginalCost()` untouched.

## What changes vs v5 (reconciliation ledger)

v5.1 is a rebalance, not a new game — same engine, same `gridop.v5` save namespace. It **reverses or
reworks** four shipped v5 decisions, each called out in the owning phase's doc:

| v5 decision | v5.1 change | Phase |
| :--- | :--- | :--- |
| **No game-over** — failure is stagnation, `S.over`/`won` never set | **Fail-state returns** — a grid-stability HP bar tops out → run ends → roguelite restart | 2 |
| **`peakGrowth` 1.06/day compounding** demand | **Hybrid curve** — plannable quarterly step + daily weather noise | 1 |
| **Quarter-end-only maintenance** (Phase 4) + **quarter-end Development Office** upgrades (Phase 7) | **Two rolling parallel queues** — maintenance (crew pool) + upgrades (contractor line), scheduled daily | 3, 4 |
| **Skill currency has no earning path** (end-of-run award died with the run) | **Quarterly KPIs mint ⚡** (PnL + Satisfaction, one 50/50 pool) banked to the profile | 6 |

**Kept from v5:** the Year▸Quarter▸Day calendar, dial-able dispatch, the four KPI axes, the hybrid
floor+swing economy + overlord verdict, the crisis toolkit + seasonal regime, and the Rust→Veridia
world layer. The roguelite restart revives the *concept* of a run (profile persists across deaths)
without reviving v4's run structure.

---

## The seven phases

Each phase is its own PR (per the repo's per-PR flow), test-green and independently playable, with its
own doc below. Order follows the dependency graph.

| # | Phase | Doc | Module(s) it owns | Status |
| :-- | :--- | :--- | :--- | :--- |
| 1 | **Demand curve** | [phase-1-demand-curve.md](phase-1-demand-curve.md) | `demand.js` (new, pure) + `sim.js` demand step | ✅ shipped 2026-10-30 |
| 2 | **Fail-state & stability HP bar** | [phase-2-failstate-stability.md](phase-2-failstate-stability.md) | `stability.js` (new, pure) + restart path | ✅ shipped 2026-10-30 |
| 3 | **Upgrade ladders & contractor queue** | [phase-3-upgrades-contractor.md](phase-3-upgrades-contractor.md) | reworks `progression.js`; new `contractor.js` | ✅ shipped 2026-10-30 |
| 4 | **Rolling maintenance** | [phase-4-rolling-maintenance.md](phase-4-rolling-maintenance.md) | reworks `maint.js`, `crews.js` | ✅ shipped 2026-10-30 |
| 5 | **Daily Brief loop** | [phase-5-daily-brief.md](phase-5-daily-brief.md) | `brief.js` (new) + `sim.js` orchestrator | ✅ shipped 2026-10-30 |
| 6 | **KPI → currency economy** | [phase-6-kpi-currency.md](phase-6-kpi-currency.md) | `scorecard.js` (new, pure); `verdict.js`, `meta.js` | ✅ shipped 2026-10-30 |
| 7 | **UI overhaul** | [phase-7-ui-overhaul.md](phase-7-ui-overhaul.md) | `render.js`, `styles/live.css`, `index.html` | ☐ planned |

---

## Dependency graph

```
        ┌─────────────────────┐
        │ 1 · Demand curve     │  (the plannable curve everything else is tuned against)
        └──────────┬──────────┘
                   │
        ┌──────────┼───────────────────────────┐
        ▼          ▼                            ▼
 ┌──────────────┐ ┌───────────────────────┐ ┌──────────────────┐
 │ 2 · Fail-    │ │ 3 · Upgrade ladders   │ │ 4 · Rolling      │
 │   state/HP   │ │   & contractor queue  │ │   maintenance    │
 └──────┬───────┘ └───────────┬───────────┘ └────────┬─────────┘
        │                     │                      │
        │                     └──────────┬───────────┘
        │                                ▼
        │                      ┌───────────────────┐
        │                      │ 5 · Daily Brief   │  (the channel that drives both queues)
        │                      └─────────┬─────────┘
        │                                │
        └────────────────┬───────────────┘
                         ▼
                 ┌──────────────────┐     ┌──────────────────┐
                 │ 6 · KPI currency │     │ 7 · UI overhaul   │  (wraps it all; lands last)
                 └──────────────────┘     └──────────────────┘
```

**Hard edges:** everything tunes against **1** (a sane demand curve is the prerequisite for testing
blackouts, builds, and the HP bar). **2** needs 1 (realistic shortfalls to fill the bar). **3** and
**4** need 1 (capacity responds to the curve) and are independent of each other. **5** needs 3 + 4
(it schedules into both queues). **6** needs 2 (survival-coupled verdict) + the KPI accumulators, and
reads 3/4 activity. **7** is the capstone — it surfaces every prior phase's new state and can only be
finished once that state exists.

---

## Shared interface contract (additions to the v5 `S` shape)

v5.1 **adds** to the contract declared in [`../plan-v5/README.md`](../plan-v5/README.md); nothing
here replaces a v5 field except where the ledger above says so. New fields are real from the phase
that introduces them, defaulted sanely before their owning phase wires behaviour.

### Game state `S` (new / changed)

```js
// Phase 1 — the hybrid demand curve
S.peak;                 // live peak demand this day = quarterPeak × daily-noise multiplier
S.quarterPeak;          // the plannable baseline this quarter steps TO (set at rollover)
S.nextQuarterPeak;      // forecast the brief/review surface so you can build/upgrade ahead
// (retires S.peakGrowth daily compounding — see Phase 1)

// Phase 2 — fail-state returns (reverses the v5 "no S.over" note)
S.over;                 // true when the stability bar topped out — run ended
S.reason;               // "grid-collapse" (why the run ended), for the restart screen + records
S.runSeed, S.runStartDay; // identify this run for the records the profile banks across deaths
S.stability = {
  hp,                   // 0..max — the grid-stability reservoir; tops out → S.over
  max,                  // CFG.v5_1.stability.max
  fillPaused,           // true while draining (no active shortfall)
  lastShortfall,        // "none" | "dispatch" | "capacity" — which fill-rate applied last tick
};

// Phase 3 — 4×9 per-plant upgrade ladders + the contractor queue
u.tiers = { output, reliability, efficiency, flexibility }; // 0..9 each; drives u.caps
S.contractor = [ UpgradeJob, … ];   // rolling cash-funded upgrade queue (separate labor from crews)

// Phase 4 — rolling maintenance (reworks the quarter-end Task model)
S.maintQueue = [ MaintJob, … ];     // rolling crew-funded maintenance jobs, resolve by daysLeft

// Phase 5 — the daily brief beat
S.calendar.mode;        // now "operating" | "brief" (daily) | "planning" (quarter-end)
S.autoAdvance;          // true = skip quiet days until an exception yanks the brief open (cleared on open)
S.jobsDone;             // rolling completions since the last boundary (the "job landed" interrupt)
S.briefEnabled;         // gates the whole beat OFF for headless runs; main.js arms it per session

// Phase 6 — quarterly KPI → currency
// As-built: no stored kpi block — scoreQuarter derives the seven metrics from raw accumulators.
S.quarterLog.opCost;       // operating $ accrued this quarter (→ cost discipline $/MWh)
S.quarterLog.capitalSunk;  // cash committed to builds + upgrades this quarter (→ capital efficiency)
S.quarterLog.reserveAccum; // Σ reserve-margin · dtH (→ headroom, averaged over hours)
S.quarterLog.priceAccum;   // Σ spot price · dtH (→ affordability, averaged over hours)
S.quarterLog.hours;        // Σ dtH this quarter (the averaging divisor)
S.zap;                     // the ONE ⚡ pool: mirrors profile.currency; minted here, spent on perks/promotions
```

### Canonical types (new)

```js
UpgradeJob = { id, unitId, axis, toTier, cost, daysLeft };   // contractor queue (Phase 3)
MaintJob   = { id, name, unitId, axis, crewId, daysLeft, cost }; // rolling maintenance (Phase 4)
Scorecard  = { pnl: {margin, cost, capEff}, sat: {reliability, headroom, clean, affordability},
               pnlScore, satScore, mintPnL, mintSat, mintTotal }; // quarterly KPI → ⚡ (Phase 6)
```

### Signatures (what each phase exports; the arrow names the consumer)

| Signature | Owner | Consumed by |
| :--- | :--- | :--- |
| `stepDemand(S, dtH) → peak` *(hybrid curve)* | 1 | sim loop |
| `forecastPeak(S, quartersAhead) → MW` | 1 | 5 brief, 6 review, construct |
| `tickStability(S, suppliedMW, demandMW, dtH)` *(mutates `S.stability`, sets `S.over`)* | 2 | sim loop |
| `classifyShortfall(S) → "none"\|"dispatch"\|"capacity"` | 2 | 2, operating UI |
| `restartRun(S, profile) → S` *(fresh grid, banks records)* | 2 | main.js |
| `upgradeCost(u, axis) → cash` · `queueUpgrade(S, unitId, axis) → UpgradeJob` | 3 | 5 brief UI |
| `tickContractor(S, dtH)` *(mutates `S.contractor`, applies tier on completion)* | 3 | sim loop |
| `queueMaint(S, unitId, axis, crewId) → MaintJob` · `tickMaint(S, dtH)` | 4 | 5 brief UI / sim loop |
| `openBrief(S)` / `closeBrief(S)` / `shouldInterrupt(S) → bool` | 5 | sim loop, main.js |
| `scoreQuarter(S) → Scorecard` · `mintCurrency(scorecard) → ⚡` | 6 | 6 verdict, meta |

---

## Conventions

Identical to v5 ([`../plan-v5/README.md` §Conventions](../plan-v5/README.md)): TDD bite-sized tasks,
self-executing `tests/*.test.mjs` auto-discovered by `tools/run-tests.mjs`, determinism via pinned
RNG / `S.calm` / injected streams, the `engine.js`-sacred purity boundary, all numerics under
`CFG.v5_1` (a new sub-namespace so v5 knobs stay put), and CHANGELOG + `docs/README` updated per
merged phase.

**Deferred past this spec (user's call, separate discussions):** exact tuning numbers (bar size,
fill/drain/heal rates, tier cost curves, demand step size) → settled by `tools/balance.mjs` + a
throwaway UI prototype, not guessed here; the **database + deployment/production** question (where
persistent run records live); any **revision of the game's core principles** (the no-game-over pillar
is formally reversed by Phase 2, but a broader principles pass is its own conversation).

---

*Decomposed from the v5.1 rebalance grill (2026-10-30). Sibling of [`../plan-v5/`](../plan-v5/README.md);
treat as the current best shared understanding, not frozen.*
