# Phase 1 — Legibility in the current UI

> Ships first. No new shell, no model change. Pays down v5.3's two outstanding playtest findings in
> today's UI, so value lands in week one and the big visual work is de-risked behind it.

## Why first

v5.3 proved the economy is *correct* but its playtest flagged it is not yet *legible*: you cannot tell,
live, why you made or lost money, and one readout outright contradicts the model. These are read-side fixes
that need none of the v5.4 shell — so they ship independently, immediately, and the fix carries over to the
new surface unchanged (the board review's *content* survives the reskin).

## Owns

- `src/live/render.js` — the board-review/verdict view (`verdictCard`, render.js:613), a new live
  **attribution line** on the operating screen, and the spot readout's "why" line.
- `src/live/verdict.js` / `src/live/scorecard.js` — expose the **existing** VOLL / unserved / opCost
  breakdown to the view. No new number is computed; v5.3 already accrues these.
- The **duplicate price tiles**: since v5.3 both `S.price` (`Wholesale`, `s-price`) and `S.spot`
  (`Spot · P&L`, `cl-spot`) are set to `hr.priceServed` (sim.js:410/465) — the *same* number under two
  names. Merge to one price readout (carrying the "why" line) or explicitly relabel so they don't read as
  two independent prices.

## Approach

1. **L1 — board-review attribution.** The verdict card already shows a P&L total; itemize it so the player
   can trace it: revenue (contracts + served), minus opCost, wages, overruns, breach/shed fines, interest,
   and **forced-unserved VOLL** as its own line with the MWh and $/MWh that produced it. The number exists;
   surface it.
2. **L1 — live attribution + spot "why".** On the operating screen, add a one-line explainer to the spot
   readout: the clearing price is the marginal cost of the last served unit (cost-based), and when forced
   unserved > 0, a visible "paying VOLL on N MW" line. This is the live counterpart of the board breakdown.
3. **L2 — kill the "debt-free at negative cash" contradiction.** Audit status strings against the actual
   `cash`/`debt` values; make the language track the numbers (negative cash is *not* "debt-free"). A trust
   fix, not a model fix.
4. **L2 (cousin) — collapse the duplicate price tiles.** `Wholesale` and `Spot · P&L` are the same
   `priceServed` number; show one price (with the "why" line) or relabel so the two tiles are not read as
   independent signals. Otherwise the "why" line explains a number the player already sees twice.

## Done when

- The board review traces the full P&L including a named VOLL line, matching the harness's numbers.
- The live screen shows *why* the price is what it is and *that* VOLL is accruing when it is.
- No status string contradicts `cash`/`debt`.
- The HUD shows one price for `priceServed`, not two tiles reading identically under different names.
- All suites green; the v5.3 incentive harness unchanged and still green (no economy touched).

## Risks & open questions

- **O6 (README):** the spot "why" copy must explain a cost-based marginal price **without** implying a
  throttle the player no longer has (dials were deleted in v5.3). The fix is a *verb choice*: the price is
  **demand-driven, not supply-chosen** — "demand climbed into the gas band, so gas sets the price," never
  "you set the price." Copy review required.
- Keep this strictly read-side. If a "fix" tempts a change to how a number is *computed*, it belongs to the
  v5.3 harness's domain, not here.
