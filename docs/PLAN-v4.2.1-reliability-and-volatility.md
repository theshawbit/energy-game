# Grid Operator v4.2.1–v4.2.2 — Reliability & Net-Load Volatility — Records

> **Status: SHIPPED.** v4.2.1 trip/wear rework + overhaul tier (PR #50, merged
> 2026-10-26). v4.2.2 rare trips + volatile net-load curve + steeper service fee
> (PR #51, merged 2026-10-26). Pages auto-redeployed on each merge.
> Written from iterative human playtest feedback across the two releases — this is
> the *as-built* record of the maintenance/trip model and the volatility model, so
> the tuning intent survives the next balance pass.
>
> **Zero `engine.js` changes** — `dispatchHour()` is untouched. All of this lives in
> `sim.js` (mechanics), `config.js` (`CFG` knobs), `actions.js` (service/upgrade),
> plus tests and the How-to FAQ. Magnitudes are centralised in `CFG` so a future
> balance pass is values-only.

---

## The problem (playtest feedback, in order)

1. *"Plants tripping >85% condition? Shouldn't the trip rate be tied to condition?"*
   — the original `tripHazard` only **scaled a flat base rate** by wear, so the full
   `u.fail` applied even at 100%: a pristine coal plant strained ~19%/day. Trips felt
   random and unfair.
2. After a first condition-gated curve: *"too aggressive, broken"* — a flat ~17%/day
   wear pushed every plant into the punishing band regardless of play.
3. After the load×age wear rebuild: *"trips still too frequent; plants don't trip as
   often in real life. Maybe the demand-vs-capacity curve should be more volatile?"*

The arc: **trips went from the primary (random) threat → a rare neglect event, and the
moment-to-moment challenge moved to following a volatile net-load curve** — which is
what grid operation actually is.

---

## 1. Trip model — condition-gated, rare, neglect-only

Trip risk is a **lookup table** `CFG.tripOdds` = `[condition%, daily-strain-probability]`
for a reference coal plant (`fail = tripRefFail` 0.0045). A unit's own `u.fail` scales it
(nuclear is more reliable; an upgrade that cuts `fail` cuts trips), and the day ramp
(`diff = 1 + (day-1)·outageRamp`) lifts it over a run.

**HARD RULE — a plant at ≥85% NEVER trips.** The table's first point is `[85, 0]`, so
`dailyStrainProb(cond ≥ 85) = 0`. Keep your fleet healthy and trips essentially vanish.

As-built curve (v4.2.2, daily strain prob for the reference plant):

| Condition | ≥85% | 77% | 70% | 60% | 50% | 40% | ≤30% |
|-----------|------|-----|-----|-----|-----|-----|------|
| Trip/day  | **0%** | 0.4% | 1.2% | 6% | **18%** | 30% | 40% |

`dailyStrainProb(cond)` interpolates linearly between points and plateaus below the last.
`tripHazard(u, diff)` converts the interpolated daily prob → per-second rate
(`-ln(1-pDay)/secondsPerDay`) × `diff` × `(u.fail / tripRefFail)`; `step()` applies it per
frame as `1 - exp(-hazard·dt)`.

**Telegraphing (unchanged from v4.1):** a hazard roll puts a plant into a `strained`
state — still generating — for `CFG.strainWarn` (~3 real-sec) before it trips. The window
is your cue to arm reserves, shed load, or stand a straining peaker down on your terms.

> Earlier (v4.2.1) the curve was deliberately steeper (50→37%) at the user's request;
> v4.2.2 scaled it down ~½–⅓ once trips moved off the critical path. The lever for
> difficulty is this table **and** the wear/volatility models below — all three compose.

---

## 2. Wear model — deterioration weighted by LOAD × AGE

Only generating thermal plants wear (online or strained). Applied in a loop **after**
dispatch in `step()` (it needs each unit's actual load):

```
wear/gh = CFG.wearRate × loadMult × ageMult × strainMult × (run mods)
```

- **loadMult** ("both combined") = `gridUtil` × `assetLoad`.
  - `gridUtil` = `clamp(demand / online-capacity, wearLoadFloor, wearLoadMax)` — how hard
    the whole grid leans on what's online.
  - `assetLoad` = this unit's **own dispatch share** of its cap, derived by splitting each
    tech's dispatched MW (`hr.stack[tech]`) across that tech's online units, floored at
    `wearIdleFloor` for an online-but-undispatched (spinning-idle) plant. Stored as
    `u.loadFrac` for UI/tests.
- **ageMult** = `1 + ageWearK × (u.ageHours / ageRef)`. `u.ageHours` accrues `+dtH` only
  while generating and **persists** through service/upgrade; a service does
  `ageHours *= serviceAgeRelief` (~−45%), an upgrade `*= upgradeAgeRelief` (keeps 30%) —
  partial relief, never a full reset, so old iron is eventually worth replacing. Seeded 0
  in `createGame` + `makeUnit`/`makeFleet`.
- **strainMult** = 1.5 while strained.

Measured `%/day` (24h generating): fresh baseload tight-grid full-load **11.4** (vs the old
flat 17), slack grid 6.6, marginal peaker (40% load) 4.3, idle-online reserve **1.3**; aged
180gh → 21.7, 360gh → 31.9; after a service 180→99gh → 17.0. ~9× load span; age ~doubles
wear over a run. **Emergent texture:** your cheapest always-on baseload (nuclear) wears
hardest; coal dispatched down at night wears less; reserves barely wear.

---

## 3. Service & the overhaul tier

- **Fee is strongly condition-graduated** (v4.2.2): `serviceCost(u) = repairPerMW(140) ×
  cap × damage + repairMin(1500)`, where `damage = 1 - cond/100`. The per-MW-of-damage term
  dominates the small flat floor, so condition visibly drives the bill. Coal 180MW: 80% ≈
  $6.5k, 60% ≈ $11.6k, 50% ≈ $13.8k.
- **Overhaul tier:** below `tripOverhaul` (50%) a service becomes a costly, slower
  **Overhaul** — `serviceCost` × `overhaulCostMult` (6×) and `serviceTimeFor` ×
  `overhaulTimeMult` (1.75×). Coal 180MW at 40% ≈ $100k. Surfaced as an amber "Overhaul"
  button; manual/auto/UI all inherit via `serviceCost` + `serviceTimeFor`. Service restores
  condition to 100% and relieves age.

---

## 4. Net-load volatility — the moment-to-moment challenge (v4.2.2)

With trips rare, difficulty comes from a **choppy demand-vs-capacity curve**. All knobs in
`CFG.vol`. Weather and demand-jitter are **mean-reverting (Ornstein–Uhlenbeck)** processes:

```
v += revert × (μ − v) × dt   +   rand(-1,1) × vol × √dt
```

**The `√dt` is the point** — it makes volatility real and **frame-rate independent**. The
old drift scaled noise linearly in `dt`, which averages out at 60fps (why it felt glassy).
Equilibrium swing ≈ `vol/√(2·revert)×0.577`; correlation time ≈ `1/revert` real-seconds
(a game-hour ≈ 2 real-sec), so swings last a few game-hours — followable, not frame-chaos.

Measured swings: **solar ≈ ±12%** (band .25–1.15, cloud banks), **wind ≈ ±23%** (band
.15–1.55, gusts & lulls), **demand jitter ≈ ±6–14%**. Plus occasional short demand
**spikes** (`spikeChance` 0.14/game-hour → ~3/day; +7–20% for 0.6–1.8h) via `S.spikeT` /
`S.spikeMag`. New state `demandJit, spikeMag, spikeT` (init 0 in `createGame`).

**It never cheap-shots you:** a shortfall fills the strain meter over seconds (recoverable),
and only a catastrophic ≥`instantBlackout` (42%) shortfall ends a run instantly. So
volatility rewards a kept **armable reserve** margin and attention.

**`S.calm`** suppresses demand jitter + spikes (not weather) for the deterministic test
harness — set in `controlled()` and in the mutator demand-multiplier tests.

---

## 5. Balance (report-only harness, `tools/balance.mjs`)

v4.2.2: win ~15–33% across personas, median 10–11 days. Death causes **~73% blackout /
~23% strain / ~4% bankruptcy** — the intended "grid is the hero" shape, now driven by the
volatile margin rather than random trips. Browser smoke: live run, visibly choppy chart, no
console errors; all 14 test suites green.

**If a human finds it off**, tune (NOT via rewiring — values only):
- *Too many trips* → scale `tripOdds` down / raise the hard-floor condition.
- *Wears too fast/slow* → `wearRate`, `ageRef`, `ageWearK`, the relief factors.
- *Too wild / too tame* → `CFG.vol`: `sunVol`/`windVol` (amplitude), the `*Revert` values
  (how fast swings settle), `demandVol`/`demandJitMax`, `spikeChance`/`spikeMin`/`spikeMax`.

See the running tuning log in auto-memory `v4-balance-observations` (rounds 3–4).
