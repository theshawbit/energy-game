# Phase 5 — Balance Pass + Playtest Gate

> Part of the [v5.3 Integrity plan](README.md). The closing act: settle **every placeholder number**
> against the now-correct economy using the Phase-2 asserting harness, then put the finished game in
> front of a fresh player before v5.3 closes. No code of its own (beyond tuning constants) — it's the
> acceptance gate. It also finally runs the **v5.2 balance pass that never happened** (the `shockCap` /
> pacing / strain numbers are still placeholders on `main`). This is last **by definition** — you tune
> and gate the *finished* economy, never before it.

## Goal

The audit's pivot, made operational: *the balance pass must not go first.* Before Phase 1, tuning
would have optimised a model where **not serving the city is the winning move** (C1/C2), the player's
feedback number is wrong in sign (C3), and the market self-destructs mid-session (C4). Now the
incentives are correct and asserted, the numbers can be settled honestly — and a human can confirm
the game is coherent, which no assertion can do for us.

## The two gates

### A. The balance pass (harness-driven)

Use `node tools/balance.mjs <bigN>` (the heavy sweep) to settle, against the fixed economy and with
the incentive asserts held green throughout:

- **v5.3 economy numbers** — `CFG.v5_3.market.voll` and `vollQuarterCap`. VOLL is now a **fairness**
  knob (the continuous price already guarantees dominance for any `voll > 0`), so tune it for
  survivability: ~**10–20× the max clearing price**, with the per-quarter cap set so a bad run bankrupts
  via the stability bar, not via a single VOLL spike (review M2). The **mint gate curve** behind
  `mint = 0 if pnl ≤ 0 or serveRate < 0.98` — where the knee sits, how fast it ramps (review m7).
- **v5.2 carryovers that never got tuned** — `CFG.v5_2.peak.{shockCap, wSpike, wWobble}`,
  `CFG.secondsPerDay` + the re-seated `strainRate/strainRecover/bankruptcyGrace`, and
  `CFG.v5_1.stability.{fillCapacity, fillDispatch, drainRate}` against the tamed curve.
- **The folded-in deferrals that are now balance levers** — fail-state severity (H1: scale the
  stability fill with shortfall magnitude), late-game aging cap (H7: bound the trip `diff`).

**Acceptance (automated):** all the harness asserts green (incl. the continuum U/hold sweep and the
adaptive probe), *and* the "reach a quarter" bot gate passes at the settled numbers — a competent
policy reaches the Q1 review from the **frozen start and budget** (numbers fixed in the plan, not left
as "within budget" — review m2), and the adaptive probe finds no unintended strategy that beats
serving the city by the asserted margin.

### B. The playtest gate (human)

The audit's final recommendation, and the thing that would have caught the whole v5.2 rework a
milestone earlier. **Before v5.3 closes**, a fresh player must:

1. **Reach one board review** (a full quarter) without coaching, in **≤ ~15 *engaged* minutes** —
   hands-on time, *excluding* auto-paced fast-forward (review M9: a quarter is 22 × 100 s, whose
   fast-mode floor is already ~12 min, so a wall-clock target would mostly measure whether `pacePlan`
   stayed in fast mode, not whether the game is legible);
2. **Explain why they lost (or made) money** — i.e. the causal chain is legible from the UI, not only
   from the code (this is also the audit's "the exploit is invisible from the UI" point: if the player
   can't see *why* spot moved, neither can the designer);
3. **Name one strategy they'd change** next run — evidence the decisions are real, not a formality.

If the player can't do (2) because the price/causal chain isn't visible, that's a finding, not a pass
— it routes to the deferred UI legibility pass with a concrete requirement, and v5.3 still closes on
the economy being *correct* (the gate records the UX gap rather than blocking the integrity work
indefinitely).

## Tasks

1. **Heavy sweep** — run the harness at scale; record the settled numbers and the margins on each
   incentive assert (so "how fair" is a number, not a vibe).
2. **Lock the numbers** — replace every PLACEHOLDER in `CFG.v5_2` / `CFG.v5_3` / the re-seated
   constants; re-run `npm test` + the harness green.
3. **Fail-state severity + aging** (H1/H7) — fold in as the balance levers they now are; add the
   day-400 aging non-degeneracy test the audit asked for.
4. **Human playtest** — one fresh player, observed; capture the three outcomes above verbatim.
5. **Record the result** — a short playtest note in `docs/` (pass, or the specific UX finding that
   routes onward); update the CHANGELOG.

## Done when

- Every placeholder number is settled; `npm test` and the full harness sweep are green at the locked
  values.
- The "reach a quarter" bot gate and all incentive asserts pass at the shipped numbers.
- A fresh player reached a board review, explained their P&L, and named a strategy change — or the
  gate recorded exactly which UX gap blocked (2), with a concrete handoff to the UI pass.
- v5.3 is coherent: the game on screen, the code, the docs, and the incentives all agree — and a
  human has confirmed it plays.

## Notes / caveats

- **This retires the v5.2 "balance pass" deferral** — those numbers have been placeholders on `main`
  since v5.2 Phase 2; they get settled here, against the corrected economy, which is the only model
  worth tuning against.
- **The fail-state principle is now judgeable.** With a fairly played quarter in hand, the question
  the v5.2 grill parked — is roguelite game-over the right model at all? — can finally be answered.
  That decision is the *next* milestone's, not this one's; v5.3 only had to make it answerable.
- **The human gate is the point.** The whole milestone exists because validation arrived as a bug
  report instead of a gate. Closing v5.3 without the human playtest would repeat the exact mistake it
  was built to fix.
