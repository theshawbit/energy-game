# Phase 6 — Hybrid Economy

> Part of the [v5 implementation plan](README.md). Settles the loop on a **regulated capacity floor
> + a market swing**, wires the **KPI→revenue** mapping, and stands up the **overlord's quarterly
> verdict**. Depends on Phase 2 (reserve-hold splits floor vs swing) and Phase 3 (`revenueCoeffs`).
> This phase **revives**, not deletes, the shipped `market.js` / `finance.js` / `capacity.js`.
> `engine.js` sacred.

## Goal

Three money-surfaces settle the game: a **capacity floor** (paid to keep capacity *ready* — earned
by Reliability, so the city is never uncovered), a **market swing** (live spot PnL you work for,
sharpened by Efficiency/Output/Flexibility), and the **overlord's quarterly verdict** (grades your
KPIs, adjusts your rate next quarter, hands bonuses/fines). Failure is **stagnation + escalating
pain, never removed** — chronic blackouts or insolvency stall growth, draw fines, tighten credit;
you can wreck a quarter, never the save. This phase also performs the real-second-constant re-tune.

## Module contract

- **`src/live/market.js` (revived)** — the scarcity-driven spot swing stays; re-balanced for the
  180s day and the new dial-shaped offers. `reserveHold` headroom is *withheld from* the swing (it
  earns the floor instead), so the swing PnL reflects only pushed MW.
- **`src/live/finance.js` (revived)** — term contracts / hedging stay as a swing-smoothing tool;
  credit/insolvency stays as the *pain* path (tighter credit, fines) but **never a game-over** —
  `triggerDefault` cratering credit is kept; the bankruptcy *end* is removed.
- **`src/live/capacity.js` (revived)** — already models availability pay + breach fines; this *is*
  the regulator's floor. Floor payment keys to Reliability (`revenueCoeffs.floor`) and the reserve
  held via the dial; a breach draws a recoverable fine (escalating pain), not death.
- **`src/live/verdict.js` (new, pure)** — exports:
  - `settleQuarter(S) → Verdict` — reads `S.quarterLog` (served, breaches, swing PnL, fleet KPI
    averages, emissions/clean standing), scores the quarter, sets `floorRateNext` (the overlord
    ratchets the rate up or down), computes `bonus`/`fine`, writes a one-line `note` in the
    overlord's voice. Pure: state in → `Verdict` out.
  - `applyVerdict(S, verdict)` *(mutates `S.economy`/`S.money`)* — banks bonus/fine, sets next
    quarter's floor rate.
- **`src/live/sim.js`** — revenue path becomes: `floorPay = capacityPayment × revenueCoeffs.floor`;
  `swingPay = residualMW × spot × margin/volume/capture coeffs`; both accrue into `S.quarterLog`.
  The Phase 1 quarter rollover now calls `settleQuarter` → `applyVerdict` and surfaces the Verdict in
  the Planning Office. **Stagnation model:** chronic shortfall/insolvency depresses demand growth and
  tightens credit instead of setting `S.over`.
- **`config.js`** — `CFG.v5.econ` (floor formula, verdict thresholds, rate ratchet, bonus/fine
  curve) and the **re-tuned** `strainRate`/`strainRecover`/`bankruptcyGrace` for the 180s day
  (balance-harness pass; `bankruptcyGrace` now gates *pain onset*, not death).
- **`render.js`** — the Planning Office gains the **board review**: the overlord's verdict card (KPI
  grade, PnL, rate change, bonus/fine, the barbed note), the floor-vs-swing earnings split, and the
  contract book.

## Tasks (TDD)

Create `tests/economy.test.mjs` and `tests/verdict.test.mjs`.

1. **Floor pays for readiness, keyed to Reliability.** Held reserve under an obligation accrues the
   capacity payment × `revenueCoeffs.floor`; a high-reliability fleet earns the full floor, a worn
   one less.
2. **Swing pays for pushed MW.** Residual served load clears at spot and is scaled by the
   efficiency/volume/capture coeffs; reserve-held MW earns floor, not swing — the two don't
   double-count.
3. **Reserve-hold trades swing for floor.** Raising `reserveHold` shifts a unit's earnings from
   swing toward floor; total depends on which the market/verdict rewards that quarter. (Locks the
   Phase 2 dial's economic meaning.)
4. **A shortfall is never a windfall.** Revenue reads only `hr.served`; an unserved spike earns
   nothing and draws the unserved penalty + (under obligation) a breach fine. (Port the v4
   invariant.)
5. **`settleQuarter` grades and ratchets.** A strong quarter (KPIs high, load met) → positive
   verdict, `floorRateNext` up or a bonus; a weak quarter → rate squeeze/fine and a harsher note.
   Pure and deterministic from `S.quarterLog`.
6. **Clean standing folds in.** Lower emissions intensity improves the verdict's clean-standing
   component; a dirty quarter is penalised. (Emissions is *here*, not a KPI.)
7. **Default is pain, not death.** Going insolvent with debt craters credit (fines, worse rates) but
   `S.over` is **never** set; the grid keeps running. A catastrophic hole stalls growth/compounds
   pain rather than ending the game.
8. **Re-tune holds the day.** With `secondsPerDay` ~180 and the re-tuned constants, a modeled
   chronic-brownout quarter produces escalating strain/fines on the intended timescale (balance
   harness case), not an instant collapse and not a free ride.
9. **Wages/maintenance settle in the quarter.** Crew wages (Phase 4) and any overruns land in
   `settleQuarter`'s PnL, closing the Phase 4 seam.

## Done when

- `npm test` green incl. both new suites; the revived modules pass their existing tests re-based on
  the new offers.
- A quarter-end shows a real overlord verdict: KPI grade, floor-vs-swing PnL, a rate change, a
  bonus or fine, and a barbed one-liner. Next quarter's floor rate reflects it.
- Wrecking a quarter hurts — fines, worse credit, stalled growth — but the save survives; recovery
  must be earned.
- The 180s-day re-tune is recorded in the balance harness, not eyeballed.

## Notes / caveats

- This is the **net de-risk** phase: you're re-balancing shipped, tested modules, not writing a
  market from scratch. Lean on their existing suites; change inputs, not the clearing logic.
- The verdict's *voice* is a stub here (plain barbed lines); Phase 9 gives the overlord/C.A.S.S.
  their full copy. Keep `settleQuarter` returning a `note` string so Phase 9 only swaps text.
- Guard the stagnation model with a test (task 7) — it's the single most important break from the
  roguelike and the easiest to regress into a game-over by accident.
