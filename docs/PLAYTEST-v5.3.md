# v5.3 "Integrity" — Phase 5 Balance & Playtest Record

> The closing act of the [v5.3 Integrity plan](plan-v5.3/README.md): settle every placeholder
> number against the now-correct economy with the asserting harness, fold in the two deferred
> levers (H1/H7), and put the finished game in front of a player. Recorded per Phase 5, task 5.

## A. The balance pass (harness-driven) — PASS

Settled against `node tools/balance.mjs` (24- and 48-seed sweeps) with **all 9 incentive asserts
held green throughout**. The headline gate moved from **21/24 → 48/48**.

### Settled numbers (every placeholder closed)

| Knob | Value | Basis |
| :-- | :-- | :-- |
| `v5_3.market.voll` | **3000** ($/MWh) | 10× `PRICE_CAP` (300) — low end of the spec's 10–20× band, chosen for survivability. Fairness knob; the continuous price already guarantees dominance. |
| `v5_3.market.vollQuarterCap` | **2,000,000** ($) | Governs a passive run's cash trough (bottoms ~−1.3M, recovers to ~+2.3M by quarter-end) and keeps the stability bar — never a VOLL spike — the run-ender. |
| `v5_1.stability.sevRef` | **0.5** (new, **H1**) | Fill now scales with shortfall magnitude (fraction of the city dark), saturating at a 50%-short blackout. A shallow brownout barely dings the bar; a deep one fills fast. |
| `outageRampCap` | **4.0** (new, **H7**) | Hard-caps the aging trip multiplier (`agingDiff`) so a long run can't degenerate into certain trips. A day-400 neglected plant trips ~55%/day, not 100%. |
| `secondsPerDay` | **100** (confirmed) | A 22-day quarter is ~12 fast-mode minutes, under the ≤15 engaged-minute target (M9); `bankruptcyGrace` 12 rides the same ratio. |
| `v5_2.peak.shockCap` | **0.18** (confirmed) | At +18% max surge a committed fleet covers the Q1 peak (serve 100%) while a passive grid is genuinely short — the pinch bites the unprepared, and sharpens as demand steps up. |
| stability `fillCapacity/fillDispatch/drainRate` | **8 / 3 / 1.5** (confirmed) | With H1 on top, a passive opening reaches the first board review on all seeds while a true capacity shortfall still tops the bar in ~12.5 game-hours. |

### Acceptance (automated) — all green at the shipped numbers

- **Reach-a-quarter:** 48/48 — the passive baseline bot reaches the Q1 board review from the frozen
  start within the frozen budget (DQ+3 game-days).
- **Incentive U-sweep:** π strictly decreasing in MW left short (`0:11000 … 100:−289000`) — shorting
  the city always loses.
- **Dominant strategy / adaptive probe:** the profit-maximising policy (canned *and* hill-climbed)
  keeps the lights on at **99.9–100%** serve — there is no profitable way to go dark.
- **Mint, conservation, continuity, price-taking, no-dead-content:** all green.
- **Aging non-degeneracy** (the day-400 test the audit asked for): `tests/aging.test.mjs` pins the cap
  and that a well-kept plant is immune at any age.

38 test suites + the full harness sweep are green at the locked values.

## B. The playtest gate (human) — PARTIAL: proxy pass, human gate OUTSTANDING

The spec's gate is a **fresh human player**, which an automated session cannot be. What was done
instead is a **proxy playtest**: a Claude-driven browser session through the start of a quarter, to
check the two things an assertion can't — that the game is **coherent** and that its P&L is
**legible from the UI** (the audit's "the exploit is invisible from the UI" requirement).

**Proxy observations (pass):**
- The live screen is coherent: calendar/clock, demand vs. online, reserve-margin dial, cash + its
  live rate, spot, and the one grid-strain meter all read and move together; zero console errors.
- **Auto-pace works as designed** — it fast-forwards the calm hours and drops to 1× into the evening
  peak.
- The **board review surfaces the full P&L causal chain** — Floor income, Swing income, Quarter PnL,
  next floor rate, and the seven-metric scorecard (Margin · Cost discipline · Capital efficiency ·
  reliability · headroom · cleanliness · affordability). "Why did I make/lose money" is answerable
  *at the review*.
- The browser economy matched the harness to the dollar (passive run troughs ~−1.3M then recovers to
  ~+2.3M) — the sim is faithful, no bug.

**Legibility findings (route to the deferred UI pass — not blockers, per the spec's escape valve):**
1. **The passive cash trough isn't attributed on the live screen.** A grid that leaves peak load
   unserved bleeds to ~−1.3M over the first ~12 days before swing income overtakes cost. That is the
   intended "you must dispatch to profit" lesson, but the *recovery path* ("commit gas to stop the
   VOLL bleed") is not visible live — the per-hour cash-flow readout and the cumulative cash can look
   contradictory because auto-pace fast-forwards through the exact (costly) peak window where the rate
   swings hardest. **Requirement for the UI pass:** surface the unserved-load/VOLL penalty as a live
   line item, and/or hold 1× through a cash-negative peak.
2. **The finance readout showed "debt-free" at negative cash** — the credit/debt line should reflect
   an overdrawn position.

**The human gate remains the user's to run.** A fresh player should, unobserved by code:
1. reach one board review without coaching in ≤ ~15 *engaged* minutes (excluding auto-paced fast-forward);
2. explain why they made or lost money; and
3. name one strategy they'd change next run.

Capture those three verbatim. If (2) fails on finding #1 above, that confirms the UI-pass requirement
rather than reopening the economy.

## Verdict

**v5.3 closes on the economy being correct and coherent.** The incentives are asserted, the numbers
are settled, the sim is faithful to the harness, and the board review explains the P&L. Two
legibility gaps and the human playtest are recorded as concrete hand-offs, per the plan's design: the
milestone makes the game *correct and judgeable*; the final human judgement and the UI-legibility
polish are the next steps, not blockers.

## Known / deferred onward

- **The human playtest** (above) — the user's to run and record.
- **UI legibility pass** — findings #1–#2 here, plus the audit's content-pipeline note (the "10×
  content test fails on UI density, not data" — the live screen gets crowded well before the data
  does).
- **The fail-state principle decision** — with a fairly-played quarter now in hand, "is roguelite
  game-over the right model at all?" is finally *answerable*; that decision is v5.4's.
- **Phase-4-late copy** — the in-game How-to and home-screen copy still describe the older
  survival-run model ("survive it to win"); with the numbers and fail-state now locked, that rewrite
  is unblocked (the immediate follow-up).
