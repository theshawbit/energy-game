# Phase 2 — Dial-able Dispatch

> Part of the [v5 implementation plan](README.md). Replaces the fixed on/off fleet with the **Core+
> four dials per asset** and dissolves the dedicated peaker into dial-able gas. Depends on Phase 1
> (the `S` shape + `u.dials` fields). `engine.js` stays sacred — the dials produce the *bands* the
> merit order clears **within**; they never touch `dispatchHour()`.

## Goal

Every dispatchable asset exposes four live dials — **commitment, output band, reserve hold, push** —
that the player sets during the live day. `dispatch.js` turns those dials into the per-unit MW offer
(`{min, max, committed}`) that `step()` aggregates into the `avail` map handed to `dispatchHour()`.
The engine still economically clears; the player now shapes *the constraints it clears within*. The
peaker unit type is gone — fast gas is just a plant with a wide, fast band.

## Module contract

- **`src/live/dispatch.js` (new, pure)** — exports:
  - `applyDials(u) → { min, max, committed }` — resolves a unit's dials into its offer to the merit
    order. `committed === false` (or dial `commit` off) → `{min:0, max:0, committed:false}`. Output
    band clamps to `[0, effectiveMax(u)]` where `effectiveMax` already honours the Phase 3 Output
    KPI (dormant/100 until Phase 3). `reserveHold` shaves the *offered* `max` (headroom kept
    available for the capacity floor rather than pushed into the market swing).
  - `defaultDials(u) → Dials` — the sane opt-in defaults (committed if firm/baseload, full band, mid
    reserve hold, easy push) so a player who touches nothing still runs a sensible grid.
  - `cycleCost(u, fromDials, toDials) → {ramped, started}` — classifies a dial change as a ramp
    and/or a start, the signal Phase 3 reads to wear Flexibility. Pure; records nothing itself.
- **`src/live/sim.js`** — `step()`'s `avail` build switches from `unitOutput` on/off to
  `applyDials(u)` for firm/gas; renewables and batteries keep their existing paths (their "dial" is
  commitment only for now). `reserveHold`'s shaved headroom is surfaced on `S` for Phase 6's floor
  accounting (`S.reserveOffered`).
- **`src/live/config.js`** — gas tech inherits the old peaker's ramp/start characteristics under
  `CFG.v5.gas`; remove the separate `peaker` kind from the live fleet factory (keep the batch
  build's untouched).
- **`render.js`** — the fleet instrument bank gains four dial controls per row (slider/toggle),
  wired read→write to `u.dials`. Defaults visible; "expert" dials collapsible.

## Tasks (TDD)

Create `tests/dispatch.test.mjs`.

1. **Default dials make a sane offer.** `applyDials(u)` with `defaultDials` → `committed:true`,
   `max` = unit cap, `min` = its floor; a fresh `createGame()` fleet runs without the player
   touching anything (demand met as in v4).
2. **Commit off zeros the offer.** `commit:false` → `{min:0, max:0, committed:false}`, and that unit
   contributes 0 to the `avail` map.
3. **Output band clamps.** `bandMax` above cap clamps to cap; `bandMin` below 0 clamps to 0;
   `bandMin > bandMax` is normalised (min wins, max raised to min) — never an inverted band.
4. **Reserve hold shaves the offered max.** `reserveHold = 0.3` → offered `max` is 70% of the band
   max; the held 30% is surfaced on `S.reserveOffered`. At `reserveHold = 0` the full band is offered.
5. **Engine clears within the band.** Build an `avail` map from `applyDials` across the fleet, call
   `dispatchHour`; assert each tech's dispatched MW ≤ the summed offered band and the clearing price
   is unchanged from feeding the same MW directly (engine untouched).
6. **Push is stored, not yet acted on.** `push` round-trips on `u.dials`; `cycleCost` flags a
   start when a unit goes committed-false→true and a ramp when the band moves — the hooks Phase 3
   will read. (Assert the classification; no KPI effect yet.)
7. **Peaker is retired.** The live `makeFleet()` contains no `kind:"peaker"`; the former peaker is a
   gas unit with a wide fast band and `CFG.v5.gas` ramp/start timing. A gas unit dialled to a narrow
   high band behaves like the old peaker (fast, expensive top-up) through the same engine.
8. **Determinism intact.** With `S.calm` and pinned RNG, a scripted dial sequence produces identical
   dispatch across runs.

## Done when

- `npm test` green incl. `dispatch.test.mjs`.
- In the browser, each plant shows four working dials; defaults run a sane grid; dialling reserve
  hold visibly trades offered MW for held headroom; a gas plant covers peaks on demand.
- No `peaker` kind remains in the live path; the merit order and clearing price match v4 for an
  equivalent fleet (engine provably untouched).

## Notes / caveats

- Push has **no mechanical effect until Phase 3** — it is a stored dial here. Resist adding wear in
  this phase; the degradation keystone belongs entirely to `kpi.js` so the two aren't entangled.
- `reserveHold` earns the capacity floor in **Phase 6**; here it only shapes the offer and surfaces
  `S.reserveOffered`. Keep the accounting out of this phase.
- Renewables/batteries get the full dial set in a later tier; Phase 2 only needs their commitment to
  keep the `avail` build uniform.
