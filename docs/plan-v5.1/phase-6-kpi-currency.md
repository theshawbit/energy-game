# Phase 6 — KPI → Currency Economy

> Part of the [v5.1 rebalance plan](README.md). **Fixes the orphaned skill currency** — the end-of-run
> award died with the v5 run and nothing replaced it. The quarter-end board review now **scores PnL +
> Satisfaction KPIs and mints ⚡**, banked to the profile. Depends on Phase 2 (the verdict is now
> survival-coupled) + the Phase 3/4 activity it scores. `engine.js` sacred.

## Goal

Every quarter's board review becomes the currency faucet:

- **Two KPI channels, seven metrics.**
  - **PnL** (did you run a good business): **net margin**, **cost discipline** (fuel + O&M per MWh
    served), **capital efficiency** (return on cash sunk into builds + upgrades).
  - **Satisfaction** (did you serve the city): **reliability** (served fraction / blackout-free
    hours), **headroom** (kept a safe reserve margin), **cleanliness** (CO₂ intensity), **affordability**
    (wholesale price kept reasonable).
- **One pool, 50/50 weighted.** Each metric mints on its own curve; the PnL channel contributes 50% of
  the quarter's ⚡, Satisfaction the other 50%, so a lopsided operator (great profit, dark city) can't
  out-earn a balanced one.
- **Banked to the profile every quarter.** ⚡ accrues as you play (not only at death), survives the
  roguelite restart, and funds the permanent skill tree (Home → Skills). This closes the loop the
  player hit ("where do skills come from?").

## Module contract

- **`src/live/scorecard.js` (new, pure)** — exports:
  - `scoreQuarter(S) → Scorecard` — reads `S.quarterLog.kpi` (the accumulators Phase 2/6 fill across
    the quarter) and computes each metric's 0..1 score + its ⚡ reward on a configured curve, grouped
    into `pnl` / `sat`, with `mintPnL`, `mintSat` (each the 50% channel sum) and `mintTotal`.
  - `mintCurrency(scorecard) → ⚡` — `mintTotal` (kept separate so tests can assert the 50/50 split).
- **`src/live/verdict.js` (reworked)** — `settleQuarter` now also calls `scoreQuarter`, attaches the
  `Scorecard` to the Verdict, and feeds the grade into Phase 2's `applyVerdictToStability`. The Verdict
  carries `mintTotal` for the review card.
- **`src/live/sim.js`** — accumulate the KPI inputs into `S.quarterLog.kpi` each tick/day (served MWh,
  unserved, fuel+O&M cost, CO₂, wholesale price, reserve margin, capital sunk); the quarter rollover
  banks `mintCurrency` to the profile and resets the accumulators.
- **`src/live/meta.js`** — the skill tree stays; its **earning path is restored** (quarterly mint, not
  end-of-run). If Phase 7's retired ⚡ perks are being rehomed, they become profile skills here.
- **`config.js`** — `CFG.v5_1.score` (per-metric curves + ⚡ reward weights; the 50/50 channel split).
- **`render.js`** — the board-review card shows the seven KPIs, each channel's subtotal, the 50/50
  split, and the ⚡ minted; the Skills screen shows the banked ⚡ growing quarter over quarter.

## Tasks (TDD)

Create `tests/scorecard.test.mjs` (+ touch `tests/verdict.test.mjs`).

1. **Seven metrics, grouped.** `scoreQuarter` returns a `Scorecard` with the three PnL + four
   Satisfaction metrics, each a 0..1 score from `S.quarterLog.kpi`.
2. **50/50 channel weighting.** `mintPnL` and `mintSat` each cap at 50% of the quarter's possible ⚡;
   a perfect-PnL / zero-Satisfaction quarter mints ≈ half of a perfect-both quarter (and vice-versa).
3. **Each metric mints on its own curve.** Improving one metric raises `mintTotal` monotonically within
   its channel's 50% share; no single metric can dominate the whole pool.
4. **Banked to the profile, persists restart.** The rollover adds `mintCurrency` to `profile.currency`;
   a Phase 2 restart keeps it (cross-check with `stability.test` / `restartRun`).
5. **Verdict couples to survival.** The Verdict grade derived from the scorecard feeds
   `applyVerdictToStability` — a strong scorecard heals the HP bar, a weak one damages it.
6. **Determinism / purity.** `scoreQuarter` is a pure read of `S.quarterLog.kpi`; identical logs →
   identical scorecards + mint.

## Done when

- `npm test` green incl. `scorecard.test.mjs`; the dead `currencyForRun`/end-of-run award removed or
  repurposed, `verdict.test` rebased.
- In play: each board review shows a real KPI scorecard, mints ⚡ you can *see* accrue, and that ⚡ is
  spendable on the Skills tree between/after runs — the "no way to earn skills" bug is gone.

## Notes / caveats

- This is where the "⚡ has no income" bug the player reported is actually fixed — make sure the
  faucet (quarterly mint) and the drain (skills + any rehomed perks) both exist, or the loop is still
  broken.
- Decide explicitly whether ⚡ is spendable **live** (anytime) or **between runs** (classic roguelite).
  The grill implied the permanent skill tree is a between-run meta layer; if any ⚡ sink is live
  (e.g. crew promotion), keep those as a separate in-run currency or clearly dual-purpose the bank —
  don't let the two silently share and confuse the player (the original two-⚡ confusion).
- KPI curves are balance data; the tests pin the *structure* (seven metrics, 50/50 split, monotone
  mint, banked-and-persists), not the reward numbers.
