# Phase 8 — Crisis Toolkit & Events

> Part of the [v5 implementation plan](README.md). Gives the player **mid-quarter recourse** —
> deliberate load-shedding + demand response — and makes the world **dynamic by season** via an
> event regime grown from `mutators.js`. Crisis depends on Phase 6 (recourse settles against the
> economy); the seasonal regime half needs only Phase 1. `engine.js` sacred.

## Goal

Because maintenance is quarter-end only, the live day needs an **earned, penalised** escape hatch
when a plant fails mid-quarter — nothing free. Two tools: **deliberate load-shedding** (a *controlled*
brownout: cut pre-prioritised non-critical load to dodge a cascading blackout — reuses the shipped
brownout/blackout mechanic) and **demand response** (shave the peak, *only if you built/contracted
it ahead* — plugs into the demand-response research branch). Meanwhile each quarter carries a
**weather/event regime** by season (Q1 winter peak, Q3 summer peak), so the days you manage vary.

## Module contract

- **`src/live/crisis.js` (new, pure)** — exports:
  - `loadShedTiers(S) → Tier[]` — the pre-prioritised non-critical load blocks the player can cut
    (set up ahead; "brown out the slums" in the fiction).
  - `triggerLoadShed(S, tier)` *(mutates `S`)* — cuts the tier's MW from demand for the shed window,
    dodging the shortfall, at a cost: satisfaction/standing hit + (Phase 6) a fine/clean-standing
    ding. Controlled, so it avoids the *cascade*, but it is not free and not a win.
  - `canDemandRespond(S) → bool` + `triggerDemandResponse(S)` — shaves the peak by the
    demand-response research shave **only if** that branch/contract was secured ahead; refused
    otherwise. One-shot per window with a cooldown.
- **`src/live/events.js` (new, grown from `mutators.js`)** — exports:
  - `REGIMES` — per-season event regimes (winter-peak, summer-peak, shoulder seasons) carrying
    weather bias + an event deck (fuel spike, heat wave, cold snap, drought, renewable lull,
    chaotic market — the shipped mutator ids).
  - `rollRegime(S, rng)` — at the quarter rollover (Phase 1 hook) selects the season's regime and
    deals its events for the coming quarter; deterministic under injected `rng`.
  - `regimeMods(S) → mods` — the per-tick weather/demand/fuel bias the active regime applies (reuses
    `computeMutatorMods` shape so `step` consumes it unchanged).
- **`src/live/sim.js`** — `step` consumes `regimeMods` where it reads `S.mmods`; a crisis
  (telegraphed trip, imminent cascade) fires Phase 1's `autoPause` so the player gets the beat to
  reach for a tool. Load-shed/DR settle their costs through Phase 6.
- **`config.js`** — `CFG.v5.crisis` (shed tiers, costs, DR shave + cooldown) and `CFG.v5.regimes`
  (seasonal weather bias, event odds/seasonality).
- **`render.js`** — the Operating Room gains crisis controls (shed tiers, DR button with its
  availability state) surfaced on the auto-pause alert; the daily brief shows the active regime.

## Tasks (TDD)

Create `tests/crisis.test.mjs` and `tests/events.test.mjs`.

### Crisis

1. **Load-shed dodges the shortfall.** With demand > capacity, `triggerLoadShed(S, tier)` cuts the
   tier's MW so the grid clears, preventing the blackout path — but applies the satisfaction/standing
   penalty (earned + penalised).
2. **Shed is controlled, not free.** The penalty is real and scales with the tier; a shed that
   averts a cascade still costs less than the blackout it prevented (so it's a genuine lesser-evil
   choice, verifiable numerically).
3. **Demand response gates on prep.** `triggerDemandResponse` is refused when the DR branch/contract
   isn't secured; with it, shaves the configured peak once, then cools down.
4. **Auto-pause gives the beat.** A telegraphed trip / imminent cascade sets `S.clock.autoPaused`
   (Phase 1) so the tools are reachable before the grid falls.

### Events / regime

5. **Season picks the regime.** `rollRegime` in Q1 selects a winter-peak regime, Q3 summer-peak;
   shoulder quarters get their own. (`seasonOf` from Phase 1.)
6. **The deck deals from the regime.** The quarter's events are drawn from the active regime's deck;
   odds/seasonality match `CFG.v5.regimes`; deterministic under pinned `rng`.
7. **`regimeMods` feeds `step` unchanged.** The mods object matches the `computeMutatorMods` shape so
   `step` applies weather/demand/fuel bias with no new plumbing; a winter regime lifts the demand
   peak, a drought bites hydro/renewables, etc.
8. **Determinism.** Pinned `rng` → identical regime + event sequence across runs; `S.calm` still
   suppresses the live jitter layer independently.

## Done when

- `npm test` green incl. both new suites.
- Mid-quarter, a failing plant can be survived by shedding a prioritised load tier (watching the
  standing cost) or by firing pre-built demand response — and the game auto-pauses to let you choose.
- Each quarter *feels* like its season: winter and summer peak differently, the event deck colours
  the days, and the daily brief names the regime.

## Notes / caveats

- Load-shed **reuses** the shipped brownout/blackout mechanic — don't build a parallel one; the
  "controlled" part is that the player chooses the cut instead of the grid cascading.
- DR's "only if built ahead" is the planning hook — keep it strictly gated on the research
  branch/contract so it rewards foresight, never a panic button.
- The regime is the mechanical half of Phase 9's world; keep the *flavour* text out of `events.js`
  (ids + mods only) so Phase 9 owns all copy.
