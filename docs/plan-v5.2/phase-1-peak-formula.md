# Phase 1 — Peak Formula Rework (B-split saturating shock)

> Part of the [v5.2 playability plan](README.md). Replaces the **multiplicative intraday surge** — the
> root cause of the uncontrollable day-5/6 blackout — with a **foreseeable lift × a weighted,
> capped, saturating random shock**. This is the core fix; everything else tunes against it, so it
> lands first. Touches only the live demand assembly; `stepDemand` / the quarterly baseline are
> untouched. `engine.js` sacred.

## Goal

Today the live demand (`sim.js:383`) multiplies four surge sources, so a winter evening can stack to
**+57% over baseline** (≈1,222 MW) at random — unpreventable, and treating a benign ±6% wobble as an
equal partner to a +20% spike. v5.2 splits the assembly in two:

- **Foreseeable lift (plannable).** Daily noise (already in `S.peak`) + the event-regime multiplier
  (`S.mmods.demandMult`) stay a plain multiplier. You see the season and the active event on screen,
  so building reserve for them is a fair planning test, not a dice roll. Demand-response shave stays
  on this side (it's a deliberate lever).
- **Random shock (capped).** The two in-the-moment transients — load wobble (`S.demandJit`) and the
  demand spike (`S.spikeMag` while `S.spikeT > 0`) — combine through a **weighted saturating**
  function with a hard ceiling `Smax`:

  ```
  shock = Smax · tanh((wSpike · spikeSurge + wWobble · wobbleSurge) / Smax)
  livePeak_demand = foreseeable × (1 + shock)
  ```

  `Smax` is the single explicit dial for **the hardest peak the game can ever throw** — the true
  pinch point, set on purpose. `tanh` saturates: small stacks stay roughly linear (everyday chop
  survives), big stacks asymptote to `Smax` and **can never explode**. Weights make the spike the
  dominant term; wobble is seasoning.

- **Relief stays uncapped.** `S.demandJit` is symmetric and mean-reverting; a *downward* excursion
  (a lull) must still relieve load. Only the **upward** transient feeds the saturating shock —
  `wobbleSurge = max(0, S.demandJit)`. The downward part applies as it does today (a plain
  `(1 + min(0, demandJit))` relief factor on the foreseeable side), so lulls still help.

## Module contract

- **`src/live/demand.js`** — add one pure export:
  - `peakShock(spikeSurge, wobbleSurge, cfg = CFG.v5_2.peak) → fraction` — returns
    `cfg.shockCap · Math.tanh((cfg.wSpike·spikeSurge + cfg.wWobble·wobbleSurge) / cfg.shockCap)`.
    Pure, deterministic, always `≥ 0` and strictly `< cfg.shockCap`. No state, no RNG, no DOM.
- **`src/live/sim.js`** — rewrite the `S.demand` assembly (currently line ~383) to:
  ```js
  const foreseeable = S.peak * interp(DEMAND_SHAPE, S.t)
                    * (S.mmods?.demandMult ?? 1) * (1 - (S.rmods?.demandShave ?? 0))
                    * (1 + Math.min(0, S.demandJit));                 // downward wobble = relief, uncapped
  const spikeSurge  = S.spikeT > 0 ? S.spikeMag : 0;
  const wobbleSurge = Math.max(0, S.demandJit);
  S.demand = foreseeable * (1 + peakShock(spikeSurge, wobbleSurge));  // upward transient, weighted + capped
  ```
  The transient *generators* (`S.demandJit` reversion, spike roll at `sim.js:319–326`) are unchanged
  — only how their output *combines* changes.
- **`src/live/config.js`** — add `CFG.v5_2.peak = { shockCap, wSpike, wWobble }` with PLACEHOLDER
  values (lean: `shockCap ≈ 0.18`, `wSpike: 1.0`, `wWobble: 0.4`) and a comment that these are balance
  data, settled by `tools/balance.mjs`, not here.

## Tasks (TDD)

Create `tests/peak-formula.test.mjs`.

1. **The cap is a hard ceiling.** For *any* non-negative `spikeSurge`/`wobbleSurge` (including absurd
   values), `peakShock(...) < CFG.v5_2.peak.shockCap`. This is the regression guard against the old
   +57% death-stack — the random surge can never exceed `shockCap`.
2. **Spike-dominant weighting.** With equal inputs, the spike contributes more than the wobble
   (`peakShock(x,0) > peakShock(0,x)` for `x > 0`) — the pinch point is the spike, by construction.
3. **Saturating & monotone.** `peakShock` is non-decreasing in each argument, and exhibits
   diminishing returns (the marginal gain shrinks as inputs grow — no linear blow-up). Small inputs
   stay near-linear (everyday texture preserved); large inputs asymptote.
4. **No multiplicative death-stack.** Reconstruct the documented worst case (noise .06, event .12,
   wobble .10, spike .20) and assert the reworked live demand is bounded by
   `foreseeable × (1 + shockCap)` and lands well under the old `×1.57` product (a fixed regression
   number, e.g. `< 1.40 × baseline` on the canonical stack).
5. **Foreseeable side unchanged.** With no transients (`spikeT = 0`, `demandJit = 0`), the reworked
   assembly equals the foreseeable lift exactly — `stepDemand`, the quarterly baseline, the event
   multiplier, and demand-response shave behave as before.
6. **Relief survives.** A negative `S.demandJit` still reduces demand (a lull relieves load); it never
   feeds the upward shock.
7. **Determinism.** Pinned spike/jitter streams → identical demand series across runs; `S.calm`
   suppresses transients and the assembly collapses to the foreseeable lift.

## Done when

- `npm test` green incl. `peak-formula.test.mjs`; existing suites that read `S.demand` rebased.
- A fresh game: the same cold-snap-plus-spike evening that used to blow past capacity now lands under
  a well-planned reserve; the peak is **tense but coverable**, and losing traces to under-building,
  not to a dice product.
- Hand-check in the browser across several winter days: no single evening exceeds
  `baseline × foreseeable × (1 + shockCap)`; the grid is survivable with a sanely built fleet.

## Notes / caveats

- **Values are placeholders.** The tests pin *shape* (capped, weighted, saturating, relief-preserving),
  never the magic numbers. `shockCap` / weights are settled by the balance pass against the real fleet
  — that pass is the acceptance gate for "reach the quarter review," not this phase alone.
- **`shockCap` is the design knob you reason about.** It is, literally, the worst random surge the game
  can throw over the foreseeable (already-planned-for) demand. Treat it as a first-class difficulty
  dial, documented as such.
- Keep the transient *generators* (spike chance/magnitude, jitter reversion) where they are — this
  phase changes *combination*, not *generation*. Re-tuning spike frequency/size is a balance-pass
  lever on top, not a structural change here.
- This phase makes the game **easier** on its own (the death-stack is gone); the fail-state re-seat in
  Phase 2 + the balance pass restore fair difficulty against the tamed curve.
