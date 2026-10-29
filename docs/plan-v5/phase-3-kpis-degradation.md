# Phase 3 — KPIs & Degradation

> Part of the [v5 implementation plan](README.md). Replaces the single `u.condition %` with **four
> axis-aligned KPIs** and makes **how you run a plant drive which KPI decays** — the degradation
> keystone. Depends on Phase 1 (`u.kpis` fields) and Phase 2 (the `push`/band/cycle dials that
> define operating *style*). `engine.js` stays sacred.

## Goal

Each asset carries `{ reliability, efficiency, output, flexibility }` (0–100) in place of
`condition`. The live-day dispatch style — read off the Phase 2 dials and the unit's realised load —
degrades specific axes: **Push + sustained high load → Reliability & Output; part-load → Efficiency;
frequent ramps/starts → Flexibility & Reliability.** Those KPIs then derate the plant (Output),
re-price it (Efficiency), gate its trip risk (Reliability) and set its agility (Flexibility), and
expose a `revenueCoeffs` mapping Phase 6 turns into money. The quarter's accumulated decay *is* the
maintenance bill Phase 4 opens.

## Module contract

- **`src/live/kpi.js` (new, pure)** — exports:
  - `freshKPIs() → {reliability:100, efficiency:100, output:100, flexibility:100}`.
  - `degradeKPIs(u, style, dtH)` *(mutates `u.kpis`)* — `style` is
    `{ loadFrac, push, ramped, started }` (loadFrac already computed in `step`; push from the dial;
    ramp/start from `dispatch.cycleCost`). Applies per-axis decay from `CFG.v5.decay`. Pure given
    `style` — no RNG.
  - `effectiveMax(u) → MW` — derate from the Output KPI (`cap * outputFactor(kpis.output)`); this is
    the hook Phase 2's `applyDials` already calls.
  - `heatRateMult(kpis.efficiency) → ×` — Efficiency KPI → $/MWh multiplier the dispatch cost reads.
  - `rampFactor(kpis.flexibility) → ×` and `minStableLoad(kpis.flexibility) → frac` — Flexibility →
    ramp speed + min stable load.
  - `revenueCoeffs(kpis) → { floor, margin, volume, capture }` — the clean 1:1 mapping
    (Reliability→floor, Efficiency→margin, Output→volume, Flexibility→capture) Phase 6 consumes.
- **`src/live/sim.js`** — the wear loop switches from `u.condition -= wear` to
  `degradeKPIs(u, style, dtH)`; `unitOutput`/dispatch read `effectiveMax`; the spin/var-cost path
  reads `heatRateMult`. `tripHazard` reads `kpis.reliability` where it read `condition`.
- **`src/live/config.js`** — `CFG.v5.decay` (per-axis rates keyed to style), `outputFactor` /
  `heatRate` / `flex` curves. Retune-aware: these replace the single `wearRate`.
- **`render.js`** — the single condition bar per plant becomes **four KPI lamps/bars**; colour-coded
  to the axis, with the trend (which axis you're wearing right now).

## Tasks (TDD)

Create `tests/kpi.test.mjs`.

1. **Fresh fleet is all-100.** `createGame()` → every dispatchable `u.kpis` is 100 across all four
   axes; renewables (no wear) carry no `kpis` or are flagged exempt (match v4's `condition == null`).
2. **Push + high load wears Reliability & Output, not Efficiency.** `degradeKPIs` with
   `{loadFrac:0.95, push:1}` over a game-day drops reliability & output measurably; efficiency &
   flexibility ~unchanged.
3. **Part-load erodes Efficiency.** `{loadFrac:0.2, push:0}` drops efficiency; reliability/output
   barely move. (Spinning-idle floor still applies.)
4. **Cycling beats up Flexibility & Reliability.** A sequence of `{ramped:true}` / `{started:true}`
   styles drops flexibility and nicks reliability; efficiency/output ~unchanged.
5. **Output KPI derates capacity.** `effectiveMax(u)` at `output:50` is below cap by the configured
   factor; `applyDials` offers the derated max; dispatch sees less MW.
6. **Efficiency KPI re-prices.** `heatRateMult` rises as efficiency falls; the unit's var-cost share
   in `step` increases, pushing it down the merit order (engine still clears — only the input cost
   changed).
7. **Reliability gates trips.** `tripHazard` keyed to `kpis.reliability` reproduces the v4 curve
   when reliability stands in for condition (port the `research.test.mjs` wear-slows check to the
   reliability axis). A 100-reliability plant is near-immune; mid-band is punishing.
8. **Flexibility sets agility.** `rampFactor`/`minStableLoad` improve with flexibility; a
   low-flexibility plant has a narrower usable band (higher min stable load) — surfaced to Phase 2's
   band clamp.
9. **`revenueCoeffs` is the clean mapping.** All-100 KPIs → all coeffs at their max; dropping one
   axis lowers exactly its one coefficient, the others steady. (Locks the 1:1 contract Phase 6 bets
   on.)
10. **A neutral run preserves KPIs.** `S.calm`, easy push, mid-band, no cycling over a day → all
    axes within a small tolerance of start. Wear is *earned by style*, never ambient.

## Done when

- `npm test` green incl. `kpi.test.mjs`; the ported reliability/trip test matches v4 behaviour.
- In the browser, four KPI lamps per plant move in response to how you dial it — pushing hard visibly
  bleeds Reliability/Output; babying a plant at part-load bleeds Efficiency.
- A plant derates, re-prices, and trips off its own KPIs; nothing reads `u.condition` in the live
  path any more.

## Notes / caveats

- **Emissions / "clean standing"** is *not* a fifth KPI — it stays the existing carbon/CO₂
  accounting and folds into the **Phase 6** verdict. Don't add it here.
- Keep `degradeKPIs` pure and RNG-free; all live-day randomness stays in `step` (volatility/trips).
  This is what lets the degradation be balance-tuned deterministically.
- The v4 `condition`-based service (`autoService`, `serviceCost`) is **not** removed here — Phase 4
  replaces the whole maintenance model. Phase 3 leaves it dormant/bypassed, not deleted, to keep the
  diff focused.
