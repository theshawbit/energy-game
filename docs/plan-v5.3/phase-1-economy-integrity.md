# Phase 1 — Economy Integrity (the keystone)

> Part of the [v5.3 Integrity plan](README.md). Retires the reserve-margin revenue heuristic and prices
> served load at a new **continuous** clearing price (`priceServed`), with **forced** unserved load
> charged at a bounded VOLL. Makes the board PnL an honest, fully-reconciled account and the ⚡ mint
> scarce; bounds the market; removes the deadband; decouples the availability floor from the hold dial;
> and deletes the two dispatch-touching lies (`push`, `bandMin`) so Phase 2 asserts against the final
> dispatch surface. This is the load-bearing change, so it lands first. **Principle: the *clearing
> logic* is sacred** — `priceServed` is an *additive* engine output; the merit-order math is untouched.

## Goal

The first-draft keystone (price served load at `hr.price`, charge VOLL on unserved) was **unsound**:
`dispatchHour()` overwrites `price` with `PRICE_CAP` (300) the instant `unserved > 1e-9`
([engine.js:57-58](../../src/engine.js#L57)) — the engine's own comment says *"unserved load sets the
scarcity price but is never sold."* So `hr.price` is a **scarcity signal**, not a revenue price.
Pricing served MW at it pays the cap on the whole peak at a sliver of shortfall; the profit optimum
becomes "short by an epsilon" (measured ~3.1× for a 0.4 MW peak shave), and it's invisible to every
gate. No VOLL offsets a per-served-MW price jump with a per-unserved-MW charge.

The fix is a **continuous** revenue price plus a bounded fairness-VOLL, which together make covering
strictly dominant at every demand level.

## The fix

### 1. `priceServed` — an additive, continuous engine output

`dispatchHour()` already computes the right number in its loop: `price` is the max marginal cost of
dispatched units, right up until line 58 overwrites it on shortfall. Capture it **before** the
overwrite and return it alongside the unchanged `price`:

```js
// engine.js — ADDITIVE only; clearing math unchanged
const priceServed = price;                     // marginal cost of the last SERVED unit (pre-cap, continuous)
const unserved = rem > 1e-9 ? rem : 0;
if (unserved > 0) { S.unserved = unserved; price = PRICE_CAP; }  // price = scarcity signal (unchanged)
const served = demandMW - unserved;
return { stack: S, price, priceServed, served, unserved, varCost, emissions, demand: demandMW };
```

Existing callers that read `hr.price` (HUD scarcity signal, forecast) are unchanged. **Revenue** now
reads `priceServed`.

### 2. Continuous-price revenue + price-taking (the dominance proof)

**The player is the whole market** (`dispatchHour` clears only the player's fleet), and today the
engine's `avail` is built from `unitOutput`, which for firm/gas returns the **dial-shaved offer**
(`applyDials(u).max`, where `reserveHold` shrinks it). So pricing served load at `priceServed` would
hand the player a **monopoly-withholding lever**: hold a cheap unit back → a costlier unit clears →
`priceServed` rises on *every* served MW. `priceServed` off the *offer* satisfies continuity (B1) but
violates **price-taking (B2)**. The two reconcile only if the player can't move the price.

**Fix (Option 1 — locked):** build the engine's `avail` from each online unit's **full available
capacity** (`effectiveMax`), not the dial-shaved offer. Then `priceServed` is set by **demand climbing
the real stack** — it rises with scarcity but is **invariant to the player's dials** (price-taking).
The throttle dials (`reserveHold`, `bandMax`-as-throttle, `bandMin`) can no longer move dispatch, so
they become dead levers and are **deleted** (`reserveHold` joins `push`/`bandMin`); **commit (on/off)**
is the dispatch lever. Revenue:

```js
const revenue = contractRevenue + residualMW * priceServed * fleetSwing;   // $/h — continuous, price-taking
```

Because `priceServed` doesn't jump at the coverage boundary, dropping an `ε` of load is break-even on
the energy margin (`ε·p` revenue cancels `ε·mc` cost), so with VOLL on the shortfall:

```
π(covered) − π(short by ε) = ε · VOLL  >  0      for any VOLL > 0, at every demand level
```

Covering strictly dominates — **no player-side scarcity rent** (the rising `priceServed` as the real
stack deepens *is* the scarcity signal), and no withholding lever (dispatch uses full capacity).
Deleting the throttle dials now is honest: in a single-supplier market "withhold to move the price" is
an exploit, not a strategy; a *real* bidding/withholding mechanic returns in a later milestone once an
exogenous supply stack / competitors make the player a genuine market participant.

### 3. Forced-VOLL, bounded, no deadband (C1)

Replace `unservedPenalty` ($120) at [sim.js:602](../../src/live/sim.js#L602) with the live
`CFG.v5_3.market.voll`, and fix the two structural flaws the review found:

- **Remove the deadband.** Charge VOLL (and accrue `shortfallMWh`, fill the stability bar) on
  `unserved > 0`, not `shortfall > 0.5`, and compute it from the **engine's** `hr.unserved` (same
  predicate the cash debit uses) so cash and the log reconcile. A sub-MW gap is no longer invisible.
- **Forced only, bounded.** VOLL hits *forced* shortfall (couldn't cover). **Chosen** shortfall
  (load-shed / demand-response) is exempt — it's already priced via `shedFines` + the satisfaction hit
  — classified with the existing `classifyShortfall` ([stability.js:36](../../src/live/stability.js#L36)).
  Per-quarter VOLL exposure is capped (`vollQuarterCap`) so it can't single-handedly bankrupt; the
  **stability bar remains the fail-state**. (The exact multiple + cap → Phase 5; structurally,
  `voll > 0` is all dominance needs.)
- **Separate knob.** `CFG.v5_3.market.voll` is the *live* value; `constants.VOLL` (used by the batch
  `simulateDay`, [engine.js:103](../../src/engine.js#L103)) is left alone.

### 4. Re-base the availability floor on firm *reserve* (C2 residue)

With `reserveHold` gone, "held reserve" no longer exists as a dial, so the floor is re-based on the
**system firm reserve** — firm+gas capacity that is *available but not dispatched* this tick:
`firmReserve = max(0, Σ effectiveMax(online firm/gas) − firmDispatched)` (firm/gas dispatched read from
the engine's `hr.stack`). The floor pays `floorEarn(firmReserve, avgFirmReliability, floorRate)` — a
genuine capacity payment for keeping firm iron available above demand, which no dial can farm and which
doesn't double-pay dispatched MW. C2 is fully dead (price lever gone via #2, floor lever gone here).
Magnitude (`floorRate`) → Phase 5.

### 5. Delete the dead dispatch dials (`reserveHold`, `bandMax`-throttle, `bandMin`, `push`) — here, not Phase 3

Once dispatch reads `effectiveMax` (#2), the throttle dials move nothing, so they land **with** the
economy rework (review M6 — Phase 2 asserts the final dispatch surface). Phase 3 keeps only the
non-dispatch residue.

- **`reserveHold`** — was the price/floor lever (C2); now inert. **Delete.**
- **`bandMax` / `bandMin` / output band** — no longer throttles dispatch. **Delete** (the band offer is
  gone; a unit online offers its full available capacity).
- **`push`** — read only by the wear formula, no upside: a dial that only hurts. **Delete** (a real
  upside is v5.4, per the freeze).

The surviving dial is **`commit`** (on/off). This guts the v5 Phase-2 "Core+ dials" down to commit —
the honest set, since the rest were either exploits or no-ops. *(Implementation note: this can land as a
second commit on the branch — once #2 makes the dials inert, deleting their plumbing/UI is mechanical
and the economy invariants already hold.)*

### 6. Bounded market (C4)

- **Retire the calendar drift.** Delete `CFG.spotDrift` and the `(1 + spotDrift·(day−1))` factors in
  `exogenousBaseline` / `dailyBaseline`.
- **Clamp `contractPrice`** to `[CFG.spotFloor, PRICE_CAP]` in [finance.js](../../src/live/finance.js).

### 7. Honest PnL + full reconciliation + scarce mint (C3 + M1)

- **`verdict.js:81`** — `pnl = revenue − opCost − wages − overruns − breachFines − shedFines − interest
  − unservedCost`. Accrue `interest` and `unservedCost` into `quarterLog`.
- **Charge `shedFines` to cash.** Today `crisis.js:38` books `shedFines` to the log but never debits
  cash, while `verdict` subtracts them — a phantom cost. Debit cash when the shed settles, so the cost
  PnL subtracts is real (consistent with the VOLL-exempt treatment of chosen sheds in #3).
- **Battery recharge into a cost line.** `S.cash -= add * hr.price` ([sim.js:580](../../src/live/sim.js#L580))
  is in no log field — add it to `opCost` (or its own line) so recharge isn't free in the PnL.
- **The reconciliation identity:** `Δcash = pnl + bonus − fine − capex − R&D − Δdebtprincipal +
  salvage`. Log each line so the identity holds (this is test #3).
- **`scorecard.js`** — Margin / Capital-efficiency read the *true* PnL; the mint is gated on **true PnL
  × serve rate** (`mint = 0 if pnl ≤ 0 or serveRate < 0.98`; formula + curve settled in Phase 5). A
  losing/dark quarter mints 0–1. Affordability (`qlog.priceAccum`) reads the new revenue price, not the
  old `S.price`.

### 8. Redefine `S.spot`; map the retired price's consumers (M3)

Make **`S.spot` the new revenue price** so the HUD, blended price, forecast and affordability all read
the honest number. The reserve-margin *revenue* path is retired, but `reserveMargin()` itself stays —
it still feeds other consumers. Phase 1 carries a **consumers-of-the-retired-price table** with a
decision per row:

| Consumer | Reads | Decision |
| :--- | :--- | :--- |
| HUD spot / blended price (`render.js`, `readouts.js`) | `S.spot` | `S.spot` ← new revenue price (honest) |
| Forecast (`sim.js:469-477`, `forecast.js`) | `S.spot`/baseline | forecast the new revenue price (or retire if it only tracked the heuristic) |
| Scorecard headroom (`qlog.reserveAccum`, `scorecard.js:48`) | `reserveMargin` | **kept** — `reserveMargin()` survives |
| Capacity-call tightness (`capacity.js:43`) | `reserveMargin` | **kept** |
| Offer/Desk preview pricing (`actions.js`, `render.js`) | `dailyBaseline` | re-point to the drift-free baseline |
| Affordability (`qlog.priceAccum`, `sim.js:511`) | `S.price` | reads the new revenue price |

## Module contract

- **`src/engine.js`** — add `priceServed` to the return (additive; clearing untouched).
- **`src/live/config.js`** — add `CFG.v5_3.market = { voll, vollQuarterCap }` (PLACEHOLDER; comment:
  balance data, live knob separate from `constants.VOLL`). **Retire** `CFG.spotDrift`,
  `CFG.unservedPenalty`, and the `push`/`bandMin` config.
- **`src/live/market.js`** — drop the drift factor; retire the reserve-margin *revenue* path (keep
  `reserveMargin()` for its other consumers).
- **`src/live/sim.js`** — continuous-price revenue (`priceServed × fleetSwing`); forced-VOLL on
  `hr.unserved > 0`, bounded + classified; `S.spot` redefine; recharge→cost; delete `push`/`bandMin`
  dispatch reads.
- **`src/live/capacity.js` / floor path** — re-key `floorEarn` to available firm capacity.
- **`src/live/verdict.js`** — true-account PnL + reconciliation logging.
- **`src/live/crisis.js`** — debit `shedFines` to cash.
- **`src/live/scorecard.js`** — true-PnL mint inputs + the serve-rate gate.
- **`src/live/finance.js`** — clamp `contractPrice`.

## Tasks (TDD) — the invariant tests the audits said were missing

Create `tests/economy-integrity.test.mjs`; flip the bug-pinning assertions in `tests/verdict.test.mjs`.

1. **Continuity.** `priceServed(D−ε) == priceServed(D)` within 1e-9 across the coverage boundary; and
   `priceServed` is never `PRICE_CAP` by construction (it's captured pre-overwrite).
2. **π(covered) > π(short) — a continuum.** At fixed demand, `π` is **strictly decreasing** over a
   sub-MW U-sweep `{0.1, 0.5, 1, 5, 20, 50, 100}` MW. The C1 regression guard, written as a continuum
   (not two points) so the sub-MW optimum can't hide.
3. **Cash ↔ PnL reconciliation.** Over a simulated quarter, `Δcash == pnl + bonus − fine − capex −
   R&D − Δdebt + salvage` within rounding — every flow logged (catches C3, M1, and much of C4).
4. **π non-increasing across `hold ∈ {0,.1,….9}`** on a **surplus-fleet fixture** (the interior floor
   farm, M5-audit). The C2 regression guard.
5. **Deadband gone.** A 0.4 MW forced gap charges VOLL, accrues `shortfallMWh`, and fills the
   stability bar — no shortfall is invisible.
6. **Chosen vs forced.** A deliberate load-shed charges `shedFines` (to cash) + satisfaction but **not**
   VOLL; an equal forced gap charges VOLL. Both reconcile.
7. **Day-1000 non-degeneracy (C4).** With drift retired, spot does not pin at the cap over a long run;
   `contractPrice` stays in `[spotFloor, PRICE_CAP]`.
8. **Mint scarcity.** `pnl ≤ 0` or `serveRate < 0.98` ⇒ mint 0–1; a strong, well-served quarter mints
   well.
9. **Engine behavioural equivalence.** `priceServed` equals the engine's pre-override marginal price,
   derived independently from `hr.stack` + `marginalCost` (a *behavioural* assert — a byte-identical
   source test can't catch a caller duplicating the rank logic, review m5). The clearing math
   (`served`, `price`, `varCost`) is unchanged vs the golden fixtures.

## Done when

- `npm test` green incl. `economy-integrity.test.mjs`; `verdict.test.mjs` pins the *correct* formula;
  suites reading the old spot path rebased.
- A headless run confirms: under-serving (any depth, incl. sub-MW) loses; an interior hold loses; a
  fully-served tight evening earns the real (continuous) clearing price.
- The board PnL on screen equals the quarter's actual cash movement.
- `push` and `bandMin` are gone from the tree; no module reads them.

## Notes / caveats

- **Values are placeholders.** Tests pin structure (continuity, covered-beats-short over a continuum,
  reconciliation, non-degeneracy, mint gate). `voll`, `vollQuarterCap`, the mint curve → Phase 5.
- **VOLL is now a fairness knob, not a dominance knob** — the continuous price does the dominance work,
  so VOLL is tuned for survivability (bounded, forced-only) without weakening the invariant.
- **The clearing logic stays sacred.** `priceServed` is additive; if a consumer needs a number the
  engine doesn't expose, add another *output* — never touch the dispatch ranking.
- **This phase makes covering correct, not necessarily *hard*.** Fair difficulty against the fixed
  model is the Phase 5 balance pass (which also finally settles the v5.2 peak/pacing/strain
  placeholders).
