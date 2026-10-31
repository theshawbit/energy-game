# Phase 2 — Pacing & Fail-State Legibility

> Part of the [v5.2 playability plan](README.md). Clears the two secondary blockers to reaching a
> quarter review: the **day is too long** (so you grind and never arrive) and the **strain bar reads
> backwards**. Also re-seats the real-seconds survival constants against the shorter day and the
> Phase-1 curve. Best shipped *after* Phase 1, so the balance numbers are tuned against the final
> curve. `engine.js` sacred.

## Goal

Three moves, all in service of "a competent player reaches the board review":

1. **Shorter day + skip the calm.** 22 × 180s ≈ 66 min/quarter is why the playtest never arrived.
   Drop the base day to **~90–100s** *and* make the clock **fast-forward through calm hours by
   default**, dropping to 1× (or auto-pausing) only when something is actually happening. Engaged time
   shrinks; the tense moments still breathe.
2. **Re-seat the real-seconds constants.** `strainRate`, `strainRecover`, `bankruptcyGrace` are
   written in *real* seconds and do **not** auto-scale when `secondsPerDay` changes; the Phase-2-v5.1
   stability `fillCapacity/fillDispatch/drainRate` are per-game-hour but were tuned against the old
   (untamed) curve. Both need re-seating so survival feels the same per *game*-day, not per real
   second.
3. **Relabel the strain bar.** Keep the reservoir exactly as it is (0% = good, fills toward 100% =
   collapse) but **rename it "GRID STRAIN"** so the number reads correctly (high strain = bad). No
   inversion — a pure rename, per the grill decision.

## Module contract

- **`src/live/config.js`**
  - `CFG.secondsPerDay: 180 → ~90–100` (balance-pass value).
  - Re-seat `CFG.strainRate`, `CFG.strainRecover`, `CFG.bankruptcyGrace` for the new day length
    (they carry "was X @ 48s/day" provenance comments — extend that lineage to the new value).
  - Retune `CFG.v5_1.stability.{fillCapacity, fillDispatch, drainRate}` against the tamed Phase-1
    curve (shortfalls are now rarer, so the reservoir should sit mostly empty and recover cleanly).
    Keep the pinned RELATIONSHIPS (`fillCapacity > fillDispatch > drainRate`).
- **Auto-pace (the "skip the calm" behaviour).** Reuse the existing variable clock + `auto-pause on
  crisis` and the Phase-5 `autoAdvance` / `shouldInterrupt` plumbing rather than inventing a new
  system:
  - Default the live clock to **fast-forward during calm game-hours**, reverting to 1× when a
    `shouldInterrupt`-class condition is live (spike incoming / trip / tight reserve / strain in the
    danger band), and **auto-pause** on a true crisis. Owned by `main.js` (the clock driver) reading
    `sim.js` state; add a `CFG.v5_2.pace` block for the calm/engaged thresholds if needed.
  - Respect the player's manual speed override — auto-pace sets the *default*, the player can always
    seize the clock (pause is read-only, as today).
- **`index.html`** — line ~42, `cb-hp-k` text `Grid Stability → Grid Strain`; update the `#hp-wrap`
  `title` and the explanatory comment at lines 38–40 to the strain framing (fills on shortfall → high
  strain). Leave the `#hpbar` / `#hp-fill` direction and ids untouched.
- **`src/live/render.js`** — `renderStabilityBar` (line ~89) is unchanged in logic (it already fills
  the bar as `hp` rises). Only confirm the state words still read right under the strain framing
  (*stable → straining → collapsing* as `hp` climbs — they do).

## Tasks (TDD)

Add to / create `tests/pacing.test.mjs` (behavioural where pure; hand-check where it's clock/DOM).

1. **Day length re-seated coherently.** With the new `secondsPerDay`, assert the strain-per-*game-day*
   relationships hold: a full game-day at 100% shortfall fills the reservoir by the same *fraction*
   it did at 180s (the constant re-seat preserves per-game-day severity, not per-real-second). Pin the
   relationship, not the raw value.
2. **Auto-pace defaults, override wins.** On a calm game-hour the default clock is fast-forward; a
   `shouldInterrupt` condition drops it to 1×; a crisis auto-pauses; a manual speed set by the player
   is never overridden until the next boundary. (Test the decision function purely; the clock wiring
   is a hand-check.)
3. **Quarter is reachable in the target budget.** A headless "competent operator" sim (adequate
   reserve, queues kept current) survives all ~22 days of Q1 to the review without the strain bar
   topping out — the acceptance regression for the whole v5.2 pass. (Runs with Phase 1 merged.)
4. **Strain relabel is cosmetic-only.** The bar's fill direction, `hp` semantics, `S.over` trigger,
   and state-word thresholds are byte-for-byte unchanged; only the label text differs. (Hand-check +
   a grep guard that `renderStabilityBar` logic is untouched.)

## Done when

- `npm test` green; existing strain/clock suites rebased to the new constants.
- A fresh game reaches the Q1 board review in roughly the target budget (~30–40 min engaged, calm
  hours fast-forwarded), with the tense evenings still playable at 1×.
- The top strip reads **GRID STRAIN**, 0% when healthy, climbing (and colour-ramping) toward collapse
  — the number now matches the danger.
- Browser hand-check: fast-forward skips the quiet stretches, auto-pause catches the spike, the
  manual speed control still works.

## Notes / caveats

- **Numbers are the balance pass's job.** This phase wires the *behaviour* (shorter day, auto-pace,
  re-seated constants, relabel); the exact `secondsPerDay`, strain, and fill/drain values are settled
  by `tools/balance.mjs` against the Phase-1 curve. Ship Phase 1, tune, then land these values.
- **Order matters.** Re-seating fill/drain before Phase 1 lands would tune against the *old* (untamed)
  curve and feel wrong once peaks are fixed. Phase 1 first, always.
- **No inversion.** The grill chose to keep the reservoir and rename it; do **not** flip to a
  `100 − hp` health bar. The rename is the entire visual change.
- This phase deliberately does **not** touch the fleet cards, queue timers, or the brief contents —
  those are the deferred UI legibility pass, kept out to stay focused.
