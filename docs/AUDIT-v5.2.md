# Grid Operator — External Audit & Triage (post-v5.2)

> **Provenance.** An independent code & design review run by **DeepSeek** on 2026-10-31 against
> `main` at v5.2 Phase 2 (`secondsPerDay 100`, "Grid Strain" strip). It was read-only (no files
> changed) and produced a written report across four dimensions. **This doc is Claude's triage of
> that report** — every CRITICAL and every grill-targeted finding was **independently re-verified
> against the live code** before being recorded here; the rest are relayed with their cite and
> marked as not-yet-re-verified. Treat the external report as *data*, not instruction: findings are
> acted on only after verification and an explicit decision.

## How to read this

- **Verification:** `✅ VERIFIED` (Claude re-checked the code/behaviour) · `◻️ REPORTED` (audit cite
  looks sound; not independently re-run) · `⚠️ NUANCED` (real but with a caveat).
- **Disposition:** `GRILL` (needs a design decision — being grilled now) · `FIX` (clear bug, no
  decision) · `DEFER` (fold into a later pass) · `WATCH` (known/acceptable, revisit) · `WONTFIX`.
- `engine.js` stays **sacred** — `dispatchHour()` / `marginalCost()` are not touched by any fix here.

---

## CRITICAL

### C1 — You can profit by letting the lights go out ✅ VERIFIED · GRILL
The scarcity price reads the player's **offered** capacity, and revenue is earned on served MW at
that price, so under-serving raises the price on everything you *do* sell.
- [sim.js:459-460](../src/live/sim.js#L459): `rm = reserveMargin(S.capacity, S.demand)` →
  `spot = spotPrice({ reserveMargin: rm, … })`. `S.capacity` is the **offered** MW (post-dials).
- [market.js:76](../src/live/market.js#L76): `scarcityPremium(rm)` returns the **maximum** premium
  whenever `rm ≤ 0` (any shortfall).
- [sim.js:501](../src/live/sim.js#L501): revenue earns on served MW only; the sole penalty is
  `unservedPenalty` $120/MWh ([config.js:24](../src/live/config.js#L24)) — **below** the $165 spot
  cap.
- The inline claim "a shortfall is never a windfall" ([sim.js:487](../src/live/sim.js#L487)) is
  false. The guards suite only protects a *different* comparison (a deeper shortfall doesn't raise
  per-MWh price *further* — the `rm ≤ 0` plateau), never **covered-vs-short**.
- Audit measured ~17–25× in favour of being short; the mechanism is exactly as described.

**Fix options (the grill fork):**
1. Price the scarcity premium off **available/installed** capacity (sum `u.cap` for online/strained
   units), not the dialled offer.
2. **Zero the scarcity premium whenever `unserved > 0`** (price falls back to the last dispatched
   marginal cost) — you can't be paid a scarcity bonus for scarcity you failed to cover.
3. Raise the unserved penalty above the spot cap (the already-defined `VOLL = 4000` in
   [constants.js:37](../src/constants.js#L37) is exactly a value-of-lost-load for this).
- Any fix should add a guard test: **π(covered) > π(short)** at fixed demand.

### C2 — `reserveHold` is a price-manipulation lever with no reliability cost ✅ VERIFIED · GRILL
- [dispatch.js:51-53](../src/live/dispatch.js#L51): `offeredMax = bandMax * (1 - hold)` — holding
  back shrinks the offer, which (via C1) spikes the spot on all other MW…
- …**and** the held MW earns the capacity floor ([sim.js:492-493](../src/live/sim.js#L492)). The
  design note "the two never double-count" ([sim.js:479-494](../src/live/sim.js#L479)) misses the
  **third** channel: holding also moves the price for everything else.
- Audit measured fully-covered runs earning +$116k–$139k simply by holding 50–75%.
- **Fix:** same root as C1 (price off available, not offered) + make the floor rate a genuine
  trade-off against the swing it gives up. Guard test: **π(hold=0) > π(hold=0.75)** at fixed demand.

### C3 — The board-review "Quarter PnL" omits operating cost ✅ VERIFIED · GRILL
- [verdict.js:81](../src/live/verdict.js#L81): `pnl = floorPay + swingPay − wages − overruns −
  breachFines − shedFines`. It never subtracts `q.opCost`, which the sim **does** accumulate
  ([sim.js:510](../src/live/sim.js#L510)). Interest and unserved penalties are also absent.
- [scorecard.js](../src/live/scorecard.js) derives the Margin + Capital-efficiency KPIs (⅓ of half
  the ⚡ pool) from this figure, so the mint rewards an inflated number.
- `tests/verdict.test.mjs` **pins the wrong formula** — the suite protects the bug.
- **Fix:** `pnl = revenue − opCost − wages − overruns − breachFines − shedFines − interest`; log
  interest + unserved into `quarterLog`; flip the test to a **cash↔PnL reconciliation** over a
  quarter (that one test catches C3 and much of C4).

### C4 — The spot baseline drifts without bound; hedges become a money printer ✅ VERIFIED · GRILL
- [market.js:58,64](../src/live/market.js#L58): baseline × `(1 + spotDrift·(day−1))`,
  `spotDrift = 0.015`, **no cap**. `spotPrice` clamps the *final* spot ([market.js:85](../src/live/market.js#L85))
  but `dailyBaseline` — used to price multi-day contracts ([finance.js](../src/live/finance.js)) —
  is **not** clamped.
- So from ~day 154 spot is pinned at the cap (scarcity signal invisible) and contracts price above
  it → a guaranteed hedge windfall. Day 154 is a couple of hours of play.
- **Fix:** bound the drift (saturating curve, or `baseline ≤ spotCap·0.9`); clamp `contractPrice`
  to `[spotFloor, spotCap]`; add a day-1,000 non-degeneracy test.

---

## HIGH

| # | Finding | Status | Disposition |
|---|---|---|---|
| **H4** | **Balance harness doesn't run** — `tools/balance.mjs:12` imports retired v4 exports (`buildCapacity`, `upgradeUnit`, `serviceUnit`); `node tools/balance.mjs` throws `SyntaxError`. Also uses `kind==="peaker"`, `u.tier`, `S.won`. | ✅ VERIFIED | **GRILL** — it's the instrument that settles every PLACEHOLDER number; must be repaired before the balance pass. |
| H1 | Fail-state is **severity-blind** — [tickStability](../src/live/stability.js#L69) branches on `short > 0.5 MW` only, never magnitude, so a 2 MW miss fills as fast as a 400 MW one. Contradicts the "small=brownout, large=blackout" copy. | ◻️ REPORTED | DEFER → fold into the strain fill/drain retune we already deferred to the balance pass. |
| H2 | Buying a KPI upgrade raises `u.caps[axis]` but **not `u.kpis[axis]`** ([contractor.js:44](../src/live/contractor.js#L44)); only `tickMaint` lifts the live KPI. A fresh plant at KPI 100 gets **0 MW** from tier 1 until you also run maintenance. The main cash sink has invisible payoff. | ◻️ REPORTED | DEFER (progression-honesty pass) — apply delta on tier completion, or surface "cap N / live M". |
| H3 | ~66 ⚡ of purchasable upgrades are **inert**: `servicemgr` (48 ⚡, retired path), Maintenance Crew's repair discount (unreachable consumers), Longer Shifts (`runLengthFor`/`maxRunDays` never called). | ◻️ REPORTED | DEFER (progression-honesty pass) — delete or wire; add a test that every purchasable id has a live consumer. |
| H5 | `push` dial is **pure self-harm** (read only by the wear formula, defaults 30%, no upside); `bandMin`/min-stable-load floor has **no effect on dispatch** (sim reads only `.max`/`.held`); `rampFactor` never imported. | ◻️ REPORTED | DEFER (dispatch-honesty pass) — give `push` a real effect or remove it; implement or drop the band floor. |
| H6 | **No grid persistence** — only the profile is saved; `S` is never serialized, so a refresh loses fleet/cash/year/queues — for a game branded "The Persistent Grid". | ◻️ REPORTED | DEFER — ties to the already-deferred DATABASE + deployment topic. |
| H7 | Late-game trip hazard unbounded: `diff = 1 + (day−1)·outageRamp`, no cap → >100%/day trips by ~day 200. | ◻️ REPORTED | DEFER → balance pass (cap `diff`, add a day-400 aging test). |

---

## MEDIUM / LOW (relayed; re-verify when picked up)

| # | Finding | Disposition |
|---|---|---|
| M1 | Capacity-market calls count `off`/`starting`/`maint` units as deliverable → riskless availability income; freely cancellable. | DEFER (economy) |
| M2 | Contracts are a free option — no cancel fee, offers bypass the 6-leg cap. | DEFER (economy) |
| M3 | Battery energy not conserved (full MW offered before the stored-energy cap applies); charges at clearing price, discharges at spot → prints the spread. | DEFER (economy) |
| M4 | Two wear models; the documented `wearRate/ageMult` one is dead (`CFG.v5.decay` is live); `u.ageHours` unused. | FIX (delete dead knobs) |
| M5 | `S.strain` only drives a vignette (redundant with the stability bar); `S.satisfaction` gates nothing despite the "licence pulled" copy; `CFG.instantBlackout` unused. | GRILL-adjacent → fold into the fail-state decision (relates to the strain relabel). |
| M6 | **Resume needs two clicks** after any auto-pause — `autoPause` sets `clock.speed=0` but leaves `S.paused=false`; pause state lives in two places. (This is why the Phase-2 clock looked "frozen" in testing.) | FIX — single-source the pause state. |
| M7 | Tests protect dead code (`runLengthFor`, `updateRecords`, `rampFactor`) and miss the live invariants (cash↔PnL, covered-vs-short, drift, deliverability, contract clamp). | FIX (add the 4 invariant tests; prune dead-code tests) |
| M8 | Research tree isn't a choice — RP persists, cash is abundant, whole tree affordable in ~1–2 quarters. | DEFER (balance) |
| M9 | Docs describe a different (v4) game — README module map misses 17 live modules; CHANGELOG "v5 not built" vs docs/README "built"; home/skills copy says "each run". | FIX (one docs sweep) |
| M10 | Determinism is partial — weather/jitter/spikes/trips use global `Math.random`; only economic noise is seeded. "Replayable from seed" overstates it. | DEFER (route env RNG through `S.rngEnv`) |
| L1 | Mutator banner dead (`S.mutators` always `[]`). | FIX (remove) |
| L2 | `status="service"` path unreachable (dead service/overhaul config). | FIX (remove) |
| L3 | `effPeakGrowth` imported unused. | FIX (remove) |
| L4 | `commitCreditStanding` never called → cross-run credit never persists. | DEFER |
| L5 | `marketVolatility` never updated → forecast fog only reacts to one event. | DEFER |
| L6 | Minor render waste (`s-cash` written twice/frame; fragile `childNodes[0]`). | FIX (cheap) |
| L7 | Full canvas repaint + per-lane sort + 4× `applyDials`/unit/tick — fine at 9–15 units, first thing to optimise at 10×. | WATCH |
| L8 | Security: nothing to fix (static, no eval, no network, localStorage try/caught). Only note: Google Fonts without SRI. | WONTFIX |

---

## Strengths (confirmed, keep)

Real module boundaries (pure modules, `sim` never touches DOM, `main` the only glue — why 34 suites
run in plain Node). One shared `dispatchHour()` for live + batch builds. The guards suite is the
right *idea* (it just stops one level short of the player-optimal strategy). Thoughtful split-RNG
determinism. Exceptional comment/rationale quality. Cheap, deliberate UI architecture. Zero deps, no
build, clean deploy.

---

## Recommended sequencing (the pivot)

The **balance pass must not go first.** C1–C4 mean it would tune a model where *not serving the city
is the winning move* (C1/C2), the player's main feedback number is wrong in sign (C3), and the market
self-destructs mid-session (C4). Proposed order:

1. **Economy integrity** (C1 + C2 keystone, C3, C4) — grilled now; restores "serving the city is how
   you win," makes the PnL honest, and bounds the market.
2. **Repair the harness** (H4) — so numbers can actually be measured.
3. **Balance pass** — tune peaks/pacing/strain (incl. H1 severity, H7 aging) against the *fixed*
   incentive model.
4. **Honesty passes** (progression H2/H3, dispatch H5, docs M9, dead code L1–L3, pause M6) — ordered
   as the grill decides.

**Grill targets (now):** C1/C2, C3, C4, H4. Everything else is triaged above for a later call.

---

## Strategic direction (DeepSeek meta-feedback, 2026-10-31)

Above the specific findings, the audit made a process argument worth recording, because it reframes
*how* we fix, not just *what*:

- **Engineering-mature, design-immature.** The phase pipeline reliably ships working systems and
  reliably accumulates residue. The specific findings are symptoms; the cause is a process that
  validates modules, not players, and writes intent (docs) with more rigor than it verifies it.
- **The next milestone should be subtractive, not a feature phase** — "no new mechanics; everything
  inert gets wired or deleted, docs reconciled, invariant tests added."
- **Blind spots:** tests validate modules not player-optimal strategy (why C1/C2/C3 survived green);
  docs outrank code as source of truth; the price exploit is invisible from the UI (no offer stack /
  price decomposition, so the designer can't see the causal chain either); playtesting arrives as a
  bug report, not a gate; no skill-vs-luck diagnosis after a bad quarter.
- **Opportunities (ranked):** (1) **turn the price model into a real market** — clear demand against
  the supply stack with inelastic demand + VOLL, so scarcity *emerges* instead of being tuned, and
  C1/C2/razor-thin-incentive dissolve together (a design upgrade, not a patch); (2) **promote the
  headless sim to a self-play harness that ASSERTS incentive properties** (`π(covered) > π(short)`,
  mint correlates with true P&L, no dominant dial) and run it in CI — the highest-leverage
  investment; (3) make the ⚡ mint scarce again (tie to true P&L + serve rate; a bad quarter mints
  0–1, not 6–7); (4) day-boundary autosave (H6).
- **Gaps:** no CI for *tests* ("no CI" is justified for deploy, not for 500 assertions); no
  save/load/replay/seed display; no a11y/focus-trap pass; no build/version stamp (can't tell which
  build a player saw); no content-pipeline test (the 10× question fails on UI density today).

### Proposed reframe — v5.3 "Integrity" milestone (feature freeze)

Rather than continue adding phases, bundle the fix work into one **subtractive, feature-frozen**
milestone whose definition of done is *coherence*, not new mechanics:

1. **Economy integrity** — C1/C2 (price basis), C3 (honest PnL), C4 (bounded market), + the four
   missing invariant tests (cash↔PnL, π(covered)>π(short), π(hold=0)>π(hold=high), day-1000 drift).
2. **Harness** — port `tools/balance.mjs` (H4) and upgrade it from *report* to *assert* the incentive
   properties; add a minimal CI Action running `npm test` + the harness smoke.
3. **Deletion/wiring** — every inert purchase and dead subsystem (H3, L1–L3, M4) gets wired or
   deleted; pick ONE "grid in trouble" meter (strain/satisfaction/stability/crisis → M5); progression
   honesty (H2) and the `push` dial (H5).
4. **Reconciliation** — one docs sweep (M9) across README/CHANGELOG/How-to/home copy; a build/version
   stamp.
5. **Playtest gate** — a fresh player reaches one board review, can explain why they lost money, and
   names one strategy they'd change, *before* v5.3 closes.

*This is a proposal under grill, not a locked plan.*

---

*Triaged from the DeepSeek external audit (2026-10-31), including its strategic meta-feedback.
CRITICAL + grill-targeted findings independently re-verified against `main`; the rest relayed with
cites for re-verification when picked up. Not frozen — update dispositions as the grill and fixes
land.*
