# Grid Operator v5.2 — Playability Rebalance (master index)

> **Status: SCOPED via design grill (2026-10-31). Not yet built.** v5.1 shipped all seven phases
> (2026-10-30); a human playtest — 12 days, ~36 min, never once reaching a quarter review — exposed a
> single structural flaw the v5.1 demand rework *didn't* catch: the **intraday peak**. v5.2 is a
> **tightly-scoped playability pass** that makes the game reachable to its first board review on fair
> terms. Nothing else. `engine.js` stays **sacred** — `dispatchHour()` + `marginalCost()` untouched.

## The problem (what the playtest found)

The v5.1 Phase-1 rework did exactly what it promised: demand is now **flat within a quarter** (a
plannable `S.quarterPeak` baseline + bounded daily noise), stepping up only at the rollover. So the
day-5/6 "uncontrollable blackout" is **not demand growth** — there isn't any inside a quarter.

The killer is the **live intraday assembly** (`sim.js:383`), where four surge sources **multiply**:

```js
S.demand = S.peak * interp(DEMAND_SHAPE, S.t) * (S.mmods?.demandMult ?? 1) * (1 - demandShave)
         * (1 + S.demandJit) * (S.spikeT > 0 ? 1 + S.spikeMag : 1);
//          └ daily noise ┘   └ event regime ┘            └ load wobble ┘  └── demand spike ──┘
```

A winter evening where all four land at once:

> 780 × 1.06 (noise) × 1.12 (cold-snap) × 1.10 (wobble) × 1.20 (spike) ≈ **1,222 MW = +57% over baseline**

That is a **random, multiplicative, unpreventable** spike no sane reserve margin covers. By day 5/6
the dice have rolled enough times for a bad stack to show, and the grid falls over through no fault of
planning. Compounding also treats a benign ±6% daily wobble as an equal co-contributor to a +20%
shock — they are not the same weight, and should not combine the same way.

Two secondary playability blockers rode along: the **day is too long** (22 × 180s = ~66 min/quarter,
so you grind and never arrive), and the **stability bar reads backwards** (labelled "GRID STABILITY"
but 0% = healthy, filling to 100% = collapse).

## The fix (three changes, one goal: reach the quarter review)

| # | Change | Why | Phase |
| :-- | :--- | :--- | :--- |
| 1 | **Peak formula rework (B-split).** Separate the *foreseeable* lift (noise + event — plannable, in the brief) from a *capped, weighted, saturating* random shock (wobble + spike). | The random intraday surge can no longer stack into a death number; the pinch point is the spike + telegraphed event, by design, not emergent from a dice product. | 1 |
| 2 | **Pacing + fail-state legibility.** Shorter base day (~90–100s) + fast-forward-the-calm / auto-pause-on-crisis; re-seat the real-seconds constants; relabel the strain bar. | You can actually reach a quarter; the moment-to-moment survival read is honest. | 2 |
| — | **Balance pass (validation gate).** `tools/balance.mjs` settles every number against the *new* curve; acceptance = a competent player reaches the review. | Numbers are tuned against the reworked curve, never guessed in the spec. | gate |

### The reworked peak formula (B-split)

```
livePeak = quarterPeak × dayShape(hour)
         × (1 + noise + (eventMult − 1))                              ← FORESEEABLE lift (plannable, surfaced in the brief)
         × (1 + Smax · tanh((w_spike·spike + w_wob·wobble) / Smax))   ← RANDOM shock (spike-dominant, HARD-CAPPED, saturating)
```

- **Foreseeable lift** = daily noise (already baked into `S.peak` by `stepDemand`) + the event-regime
  multiplier (`S.mmods.demandMult`). Stays a plain multiplier — you *see it coming* (season + event
  are on screen), so building reserve for it is a fair skill test. Demand-response shave stays here.
- **Random shock** = the two in-the-moment transients (`S.demandJit`, `S.spikeMag`), combined through
  a **weighted saturating** function. `Smax` is the single explicit dial for *the hardest peak the
  game can ever throw* — the "true pinch point," set on purpose instead of falling out of a product.
  `tanh` **cannot explode** (unlike the sum-then-square idea we rejected, which inverts into a bomb
  past a 100% stacked surge). Weights make the **spike the dominant term**, wobble the seasoning.
- **Downward wobble stays relief, uncapped** — a lull should still help you. Only the *upward*
  transient saturates (implementation note in Phase 1).

---

## The two phases

Each phase is its own PR (per the repo's per-PR flow), test-green and independently landable.

| # | Phase | Doc | Module(s) it owns | Status |
| :-- | :--- | :--- | :--- | :--- |
| 1 | **Peak formula rework** | [phase-1-peak-formula.md](phase-1-peak-formula.md) | `demand.js` (shock helper, pure) + `sim.js:383` assembly + `CFG.v5_2.peak` | ⬜ not started |
| 2 | **Pacing & fail-state legibility** | [phase-2-pacing-failstate.md](phase-2-pacing-failstate.md) | `CFG` clock/strain constants, `sim.js`/`main.js` auto-pace, `render.js`+`index.html` relabel | ⬜ not started |

**Dependency:** 2 can start in parallel, but the **balance pass runs after 1** (you can't re-seat the
fill/drain and clock constants until the curve they fight is final). Ship 1 → tune against it → ship 2
with its re-seated numbers.

---

## Shared interface contract (additions to the v5 / v5.1 `S` shape)

v5.2 **adds nothing structural** to `S` — the rework is in *how existing fields combine*, not new
state. All numerics land in a new **`CFG.v5_2`** sub-namespace (so v5 / v5.1 knobs stay put).

```js
// Phase 1 — CFG.v5_2.peak
CFG.v5_2.peak = {
  shockCap,        // Smax — the hard ceiling on the random intraday surge fraction (the "true pinch point")
  wSpike,          // weight on the demand spike (dominant term)
  wWobble,         // weight on the load wobble (seasoning)
  // all three are BALANCE DATA — the tests pin structure (capped, weighted, saturating), not values
};

// Phase 2 — re-seated existing top-level constants (NOT new fields)
CFG.secondsPerDay;   // 180 → ~90–100 (shorter day)
CFG.strainRate;      // re-seated for the new day length (real-seconds)
CFG.strainRecover;   // re-seated for the new day length (real-seconds)
CFG.bankruptcyGrace; // re-seated for the new day length (real-seconds)
CFG.v5_1.stability.{fillCapacity,fillDispatch,drainRate}; // retuned against the tamed curve (per-game-hour)
```

### Signatures (new / changed)

| Signature | Owner | Consumed by |
| :--- | :--- | :--- |
| `peakShock(spikeSurge, wobbleSurge, cfg) → fraction` *(pure, saturating, `< shockCap`)* | 1 | `sim.js` demand assembly |

`stepDemand` / `forecastPeak` / the quarterly step are **unchanged** — v5.2 does not touch the
plannable baseline, only the intraday combination.

---

## Conventions

Identical to v5.1 ([`../plan-v5.1/README.md` §Conventions](../plan-v5.1/README.md)): TDD bite-sized
tasks, self-executing `tests/*.test.mjs` auto-discovered by `tools/run-tests.mjs`, determinism via
pinned RNG / `S.calm` / injected streams, the `engine.js`-sacred purity boundary, numerics under a new
`CFG.v5_2` sub-namespace, CHANGELOG + `docs/README` updated per merged phase.

**Deferred past this spec (user's call, kept out to stay focused):**
- **UI legibility pass** — RPG-style flip/hover fleet cards, visible queue timers (contractor +
  maintenance), a richer daily brief (cash / research / more levers). Its own piece, *after* the
  balance is proven fair; you can't design cards for a game you can't finish.
- **The fail-state / "no-game-over" principle** — whether the roguelite restart is the right model at
  all is **unanswerable until a fair quarter is playable**. Judge it after build #1 is played.
- **Exact tuning numbers** — `shockCap`, weights, `secondsPerDay`, re-seated strain/fill/drain → the
  `tools/balance.mjs` + prototype pass, never guessed here.

---

*Decomposed from the v5.2 playability grill (2026-10-31). Sibling of
[`../plan-v5.1/`](../plan-v5.1/README.md); treat as the current best shared understanding, not frozen.*
