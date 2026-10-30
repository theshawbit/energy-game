# Phase 2 — Fail-state & Grid-Stability HP Bar

> Part of the [v5.1 rebalance plan](README.md). **Reverses the v5 "no game-over" pillar.** Reintroduces
> a run that can end — via a grid-stability reservoir (HP bar) that fills on blackout and drains on
> clean hours — and a **classic roguelite restart** (grid resets, profile persists). Depends on Phase 1
> (a sane curve to produce realistic shortfalls). `engine.js` sacred.

## Goal

A blackout must have both *teeth* and an *exit*. The HP bar provides both:

- **Fills on shortfall, asymmetric by cause.** A *true capacity shortfall* (all levers exhausted —
  fully armed, reserves on, load-shed fired, DR active, bands maxed, still short) fills it at
  **full rate**. A *dispatch shortfall* (you still had a usable move) fills at **half rate** — ignoring
  a crisis you could have handled is still slowly fatal (punish incompetence), but you're never killed
  while a lever remains. A clean hour (supply ≥ demand) **drains** it, slower than it fills, so a grid
  that keeps scraping back from the brink still eventually dies.
- **Coupled to the verdict (Phase 6 hook).** A strong quarter **heals** a chunk of the bar; a failed
  quarter **damages** it / raises next quarter's fill-rate. KPIs matter to survival, not just score.
- **Tops out → `S.over` → roguelite restart.** The run ends; the grid resets to a fresh start
  (baseline demand, starting fleet/cash); the **profile persists** — banked ⚡, purchased skills, and
  the records this run earned.

## Module contract

- **`src/live/stability.js` (new, pure)** — exports:
  - `classifyShortfall(S) → "none" | "dispatch" | "capacity"` — "capacity" only when every recovery
    lever is already exhausted (all dispatchables committed, reserves armed, load-shed active, DR
    firing, bands at max) and supply still < demand; "dispatch" when short but a lever remains; "none"
    when served. This is the gate that enforces "never killed while a move exists."
  - `tickStability(S, suppliedMW, demandMW, dtH)` *(mutates `S.stability`, may set `S.over`/`S.reason`)*
    — fills by `CFG.v5_1.stability.fillCapacity` / `fillDispatch × dtH` per the classification, drains
    by `drainRate × dtH` when served; clamps `hp` to `[0, max]`; sets `S.over = true`,
    `S.reason = "grid-collapse"` when `hp ≥ max`.
  - `applyVerdictToStability(S, verdict)` — the Phase 6 coupling: heal `hp` on a strong verdict, damage
    it (or bump a `fillMult` for next quarter) on a weak one. Pure read of the Verdict grade.
- **`src/live/sim.js`** — `step` calls `tickStability` each tick with the tick's supplied vs demanded
  MW; once `S.over`, `step` no-ops (the run is frozen pending restart), matching how v4 handled the
  terminal flag. The quarter rollover calls `applyVerdictToStability`.
- **`src/live/persist.js`** — `restartRun(S, profile)` (or a main.js entry): bank this run's records
  into the profile (best peak served, quarters survived, ⚡ earned) **before** discarding the grid,
  then hand back a fresh `createGame` state. No new currency is minted here — currency comes from the
  quarterly KPIs (Phase 6); the restart only *persists* what was already banked.
- **`config.js`** — `CFG.v5_1.stability` (max, fillCapacity, fillDispatch, drainRate, verdict
  heal/damage amounts). **Re-seat the real-second constants** (`strainRate`, `strainRecover`,
  `bankruptcyGrace`) against the HP-bar model so they interact sanely with the 180s day.
- **`render.js`** — the HP bar lives in the **persistent top status strip** (Phase 7 styles it); a
  filling bar reads loud (colour ramps as it approaches max), a draining one reads calm. A
  "grid-collapse" end shows a run-summary + restart screen. (UI polish is Phase 7; this phase wires
  the state + a minimal readout.)

## Tasks (TDD)

Create `tests/stability.test.mjs`.

1. **Capacity shortfall fills full-rate.** With every lever exhausted and supply < demand,
   `classifyShortfall` → "capacity" and `tickStability` fills at `fillCapacity`.
2. **Dispatch shortfall fills half-rate.** Short but with a usable lever (an un-armed battery / un-fired
   DR / un-shed tier), `classifyShortfall` → "dispatch" and the fill is `fillDispatch` (< fillCapacity).
3. **Clean hours drain, slower than fill.** Served (supply ≥ demand) → `hp` decreases by `drainRate`;
   assert `drainRate < fillCapacity` so a flickering grid nets upward over a fill/drain cycle.
4. **Top-out ends the run.** Driving `hp` to `max` sets `S.over = true`, `S.reason = "grid-collapse"`;
   subsequent `step` calls no-op.
5. **Verdict couples both ways.** `applyVerdictToStability` heals on a strong Verdict grade and
   damages (or raises the fill multiplier) on a weak one; a pure function of the Verdict fields.
6. **Restart is roguelite.** `restartRun` returns a fresh grid (baseline demand, starting fleet/cash,
   `S.over` cleared) while the profile keeps banked ⚡, purchased skills, and gains this run's records.

## Done when

- `npm test` green incl. `stability.test.mjs`; the v5 "no `S.over`" test/assumption is formally
  retired (the contract note in both plan READMEs updated).
- In play: a true capacity shortfall visibly drains your grid's life; recovering buys it back slowly;
  ignoring a crisis you *could* have fixed still bleeds you at half-rate; a sustained collapse ends the
  run into a restart that keeps your skills/currency.

## Notes / caveats

- The "capacity vs dispatch" classification is the heart of the fairness guarantee — get it exact, and
  reuse the Phase 8 crisis levers (load-shed/DR armed-state) to decide whether a move remained. Do not
  approximate it with "supply < demand" alone, or you'll kill players who still had options.
- This reverses the single most load-bearing v5 pillar. Call it out prominently in the CHANGELOG and
  the phase PR; it is a deliberate, grilled decision, not a regression.
- Exact bar size and rates are balance data — the tests pin the *relationships* (full > dispatch >
  drain, top-out ends, verdict both-ways), not the numbers.
