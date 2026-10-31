# Grid Operator v5.3 — "Integrity" (master index)

> **Status: SCOPED via design grill + a pre-implementation review pass (2026-10-31). Not yet built.**
> v5.0–v5.2 reliably shipped *working systems*; an external audit (DeepSeek, triaged in
> [`../AUDIT-v5.2.md`](../AUDIT-v5.2.md)) showed that a green test run was proving the **modules** work
> while the **game** was broken. A second review — of this plan's *first draft* — then caught that the
> draft's keystone fix was itself unsound (it priced served load off `hr.price`, which the engine
> overwrites with the price cap on any shortfall, so the exploit merely moved to a sub-MW gap). This
> revision incorporates that review. v5.3 is a **feature freeze.** No new mechanics. Its definition of
> done is **coherence** — a correct, *measurable* economy and a harness that keeps it correct.

## The revised principle (why this milestone exists)

The old working rule was *"no CI; tests run on trust."* Right about **deploy** (Pages builds from
`main`), wrong about **tests**: 34 green suites coexisted with three critical economy bugs because
every suite validated a *function* and none validated a *player* — none asked "is the best strategy
the one we meant?" So v5.3 adopts the principle that makes the milestone stick:

> **Measure the game, not just the modules.** The economy's incentives are asserted automatically, in
> CI — the same standing the modules have. A change that makes going dark profitable, inflates the
> mint, or revives a dominant dial fails the build, not a playtest three phases later.

This reverses "no CI" **for tests only.** Deploy stays manual from `main`.

A second principle is reframed by this milestone, and it unblocks the whole economy fix:

> **The *clearing logic* is sacred — not the file.** `engine.js`'s merit-order dispatch math is
> untouchable. **Additive output fields are allowed.** The keystone needs the engine to expose the
> price it already computes internally (the marginal cost of the last *served* unit); exposing it
> changes no clearing, so it is permitted. "`engine.js` is sacred" is retired in favour of this.

## The problem (what the audits found, re-verified against `main` @ 83021f6)

- **C1 — profit by going dark.** Served load was priced off a reserve-margin heuristic over *offered*
  capacity, and `scarcityPremium(rm)` returns the **max** premium on any shortfall; the only penalty
  was `unservedPenalty` $120/MWh, *below* the $165 spot cap. **And the first-draft fix made it worse:**
  `dispatchHour()` sets `price = PRICE_CAP` (300) whenever `unserved > 1e-9` ([engine.js:58](../../src/engine.js#L58)),
  so pricing served MW at `hr.price` pays the **cap on the entire peak** the instant you're a sliver
  short. Measured ~3.1× operating profit for a 0.4 MW peak shave, invisible to every gate.
- **C2 — `reserveHold` was a free price lever + free floor.** Dissolved here: the continuous price (below)
  kills the price lever; decoupling the availability floor from the hold dial kills the floor farm.
- **C3 — the board PnL omitted operating cost** (and interest, unserved, and it *subtracted* `shedFines`
  that were never charged to cash). The ⚡ mint reads this wrong number.
- **C4 — the spot baseline drifted without bound**, and the contract baseline was never clamped, so
  the market pinned at the cap mid-session and hedges printed money.
- **The deadband.** The engine trips unserved at `> 1e-9`; the sim's penalty/strain/shortfall all sit
  behind `shortfall > 0.5` ([sim.js:594](../../src/live/sim.js#L594)) over *offered* capacity — so a
  sub-0.5 MW gap pays nothing, strains nothing, and reads as serve-rate 100%. A latent C1 in its own
  right; Phase 1 removes it.

## The fix (six workstreams, one goal: a coherent, self-defending game)

| # | Workstream | Why | Phase |
| :-- | :--- | :--- | :--- |
| 1 | **Economy integrity.** Price served load at a new **continuous** `priceServed`; charge **forced** unserved at a bounded VOLL; remove the deadband; decouple the floor from the hold dial; honest PnL + full cash reconciliation + scarce mint; bounded market. | Serving the city becomes the *only* profit-max move (by `ε·VOLL` at every level); the player's feedback number is correct; the market stops self-destructing. The exploits become **structurally impossible**. | 1 |
| 2 | **Seeded env RNG + asserting harness + CI.** Route weather/jitter/spike/trip through a seeded stream (M10), then repair `tools/balance.mjs` and upgrade it from *report* to **assert** — over a continuum and an adaptive probe, on the *real volatile game*. Minimal GitHub Action. | The audit's highest-leverage investment, done honestly: the economy is measured on every push, against the game players actually face — and bug reports replay from a seed. | 2 |
| 3 | **Wire-or-delete + one trouble-meter.** Delete every inert/lying mechanic; collapse four "grid in trouble" meters to one; single-source the pause. | Kills the residue permanently; the freeze is hard (no new mechanics — see below). | 3 |
| 4 | **Reconciliation + version stamp.** One docs sweep; a version stamp on a release checklist. | The docs stop out-ranking the code; a bug report can name its build. | 4 |
| 5 | **Balance pass + playtest gate.** Settle every placeholder against the *fixed* economy via the asserting harness; then a fresh-player gate (in *engaged* minutes). | Numbers are tuned against a model where serving wins; coherence is verified by a human. | 5 |

### The keystone: a continuous clearing price (C1) + VOLL (the dominance proof)

With demand `D`, served `S`, unserved `U = D − S`, and the price the player earns on served load:

- **The bug:** `hr.price` jumps to the cap (300) at `U > 0`, so `π(short by ε) ≈ D·300 − c(D)` beats
  `π(covered) = D·p_cov − c(D)` (where `p_cov ≈ 10–120`). No VOLL fixes a per-served-MW price jump with
  a per-unserved-MW charge — the optimum is `U → 0`.
- **The fix:** price served load at **`priceServed`** — the marginal cost of the last *served* unit,
  captured **before** the cap overwrite — which is **continuous** across the coverage boundary. The
  `ε` of load you'd drop is break-even at the margin (revenue `ε·p` cancels cost `ε·mc`), so:

  ```
  π(covered) − π(short) = ε · VOLL  >  0      for any VOLL > 0, at every demand level
  ```

  Covering strictly dominates, and **VOLL stops being load-bearing** — it's tuned for *fairness*, not
  dominance. No player-side scarcity rent: when covered, `served/demand` is always 1, so a rent is a
  flat multiplier, not scarcity; the rising clearing price *is* the scarcity signal (cost-based
  marginal pricing). `engine.js` gains one additive field (`priceServed`); its clearing math is
  untouched.

---

## The five phases

Each phase is its own PR (per the repo's per-PR flow), test-green and independently landable.

| # | Phase | Doc | Owns | Status |
| :-- | :--- | :--- | :--- | :--- |
| 1 | **Economy integrity** | [phase-1-economy-integrity.md](phase-1-economy-integrity.md) | `engine.js` (+`priceServed`, additive), `market.js` (bounded baseline, retire reserve-margin revenue path), `sim.js` (continuous-price revenue, forced-VOLL, deadband, `S.spot` redefine, `push`/`bandMin` deletion), `verdict.js` (honest PnL + reconciliation), `scorecard.js` (scarce mint), `finance.js` (clamp) + the invariant tests | ⬜ not started |
| 2 | **Seeded env RNG + asserting harness + CI** | [phase-2-harness-ci.md](phase-2-harness-ci.md) | `sim.js`/`rng.js` (M10 seeded env stream), `tools/balance.mjs` (port + assert + adaptive probe), a new autoplay bot, `.github/workflows/test.yml` | ⬜ not started |
| 3 | **Wire-or-delete + one meter** | [phase-3-wire-or-delete.md](phase-3-wire-or-delete.md) | non-dispatch deletions (mutator banner, service path, second wear model, `satisfaction`, crew discount — L1–L3/M4/H3), the trouble-meter consolidation (M5-audit), pause single-source (M6-audit), the H2 payoff correctness fix | ⬜ not started |
| 4 | **Reconciliation + version stamp** | [phase-4-reconciliation.md](phase-4-reconciliation.md) | `docs/README`, `CHANGELOG`, How-to + home copy (M9), a version stamp | ⬜ not started |
| 5 | **Balance pass + playtest gate** | [phase-5-balance-playtest-gate.md](phase-5-balance-playtest-gate.md) | no code of its own — settles every placeholder via the harness, then the human gate (also closes the v5.2 balance pass that never ran) | ⬜ not started |

**Dependency order (the audit's pivot — the balance pass must NOT go first):**

```
1 (economy integrity, incl. the dispatch deletions)
   → 2 (seeded RNG, then assert the CORRECT model against the FINAL dispatch surface)
       → 3 & 4 (residue + docs, parallel)
           → 5 (tune against the fixed model, then gate)
```

Phase 1 is the keystone. The two **dispatch-touching deletions** (`push`, `bandMin`) live in Phase 1,
not Phase 3, so Phase 2 asserts against the final dispatch surface and needs **no re-baseline**
(review M6). 3 and 4 are independent honesty passes. 5 is last by definition.

---

## Shared interface contract (changes to the `S` shape / engine)

v5.3 is subtractive: it removes more than it adds. The one *additive* change is an engine output field.

```js
// Phase 1 — engine (additive output; clearing math unchanged)
dispatchHour(...) → { …, price, priceServed, served, unserved, … }
//   price        : UNCHANGED — the scarcity signal, = PRICE_CAP on any unserved (existing callers keep it)
//   priceServed  : NEW — marginal cost of the last SERVED unit, pre-cap, CONTINUOUS across coverage

// Phase 1 — CFG.v5_3.market  (the real-market economy)
CFG.v5_3.market = {
  voll,          // $/MWh on FORCED unserved — tuned for FAIRNESS (bounded; ~10–20× max clearing price), NOT dominance
  vollQuarterCap,// a ceiling on per-quarter VOLL exposure (can't single-handedly bankrupt; stability bar is the fail-state)
  // NOTE: a live knob, SEPARATE from constants.VOLL (which the batch simulateDay still uses — engine.js:103)
  // RETIRED from the first draft: scarcityCap + any player-side rent (served/demand≡1 when covered)
};

// Phase 1 — RETIRED
//   CFG.spotDrift         (C4 — unbounded calendar drift, deleted)
//   CFG.unservedPenalty   (C1 — replaced by forced-VOLL)
//   the reserve-margin REVENUE heuristic (C1 — replaced by priceServed); reserveMargin() itself stays
//       (still feeds the scorecard headroom input + the capacity-call tightness — see Phase 1's consumer table)

// Phase 2 — seeded env RNG (M10, pulled forward)
S.rngEnv;        // weather / demand jitter / spikes / trips draw from here (was global Math.random) → replayable
```

### Signatures (new / changed / retired)

| Signature | Phase | Note |
| :--- | :--- | :--- |
| `dispatchHour() → { …, priceServed }` | 1 | **additive** engine field; clearing unchanged |
| revenue = `residualServed × priceServed × fleetSwing` (+ contracts first) | 1 | continuous; `fleetSwing` KPI multiplier kept (scales covered & short equally) |
| forced-unserved cost = `U · voll`, bounded by `vollQuarterCap`, `U > 0` (no deadband) | 1 | chosen sheds exempt (already priced via `shedFines` + satisfaction) |
| `pnl = revenue − opCost − wages − overruns − breachFines − shedFines − interest − unservedCost` | 1 | true account; full `Δcash` identity asserted |
| `contractPrice` clamped to `[spotFloor, PRICE_CAP]` | 1 | C4 (bound updated — `scarcityCap` is gone) |
| `assertIncentives(runs) → {ok, violations[]}` over a **U/hold continuum + adaptive probe** | 2 | asserts, with a margin, on the real volatile game |
| `autoplay(strategy, S) → quarterResult` | 2 | bot driving the headless sim; `serve-everything` defined operationally, baseline a *distinct* policy |

---

## What the harness does (locked scope)

All in CI, on the **real volatile game** (M10 seeded):

1. **Incentive asserts over a continuum** — `π(covered) > π(short)` across a sub-MW **U-sweep**
   `{0.1, 0.5, 1, 5, 20, 50, 100}` (strictly decreasing in U); `π` **non-increasing across
   `hold ∈ {0, .1, … .9}`** (a surplus-fleet fixture catches the interior floor farm); mint correlates
   with true PnL; `priceServed(D−ε) == priceServed(D)` within 1e-9 (continuity).
2. **Conservation asserts** — the full `Δcash = PnL + bonus − fine − capex − R&D − Δdebt + salvage`
   identity; contracts settle to the exact identity.
3. **Dominant-strategy search + adaptive probe** — the canned policies *and* a greedy hill-climb over
   per-hour `bandMax`/`reserveHold`/commit (the only thing that finds a temporal/interior optimum);
   assert the intended policy wins **by a margin**, not merely ranks first.
4. **"Reach a quarter" bot gate** — a competent baseline bot (a *distinct* policy from
   `serve-everything`) reaches the Q1 review from the frozen start within a frozen budget.
5. **No-dead-content gate** — a **registry** of purchasable ids with a **state-delta test on a canonical
   fixture** (observable effect when bought), **no exceptions file**.

**Still deferred (own pass):** balance-regression snapshots and the difficulty-curve report. (Seeded
replay is now *possible* via M10, but the snapshot/curve tooling on top of it is later.)

---

## Deferred past this milestone (explicitly out of scope)

- **UI legibility pass** — RPG fleet cards, queue timers, richer brief. A feature pass; v5.3 is a
  freeze. (The playtest gate's outcome-2 failure routes here with a concrete requirement.)
- **The fail-state / "no-game-over" principle** — now *judgeable* (Phase 5 produces the first fairly
  played quarter); the decision itself is the milestone *after* v5.3.
- **Mechanic upsides deferred to v5.4** — a real upside for `push`, a consequence for `satisfaction`,
  a wired crew discount. Deleted in v5.3, reconsidered as *designed* mechanics later.
- **DATABASE + deployment / grid persistence (H6, L4)**; **deeper economy (M1–M3, M8-audit) and
  late-game aging (H7)**; **contract re-basing + cancellation fee (audit M2)** — fold into the balance
  pass / a later economy pass as they surface; not keystones.

---

*Decomposed from the v5.2 external audit + its strategic grill, then revised against a
pre-implementation review of the first draft (all 2026-10-31). Sibling of
[`../plan-v5.2/`](../plan-v5.2/README.md); treat as the current best shared understanding, not frozen.*
