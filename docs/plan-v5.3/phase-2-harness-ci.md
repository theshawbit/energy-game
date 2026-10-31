# Phase 2 — Seeded Env RNG + Asserting Harness + CI

> Part of the [v5.3 Integrity plan](README.md). First routes the environment's stochastics
> (weather / jitter / spikes / trips) through a **seeded** stream (M10, pulled forward) so the harness
> measures the *real volatile game* and bug reports replay from a seed; then repairs the dead balance
> harness and promotes it from *"report distributions"* to *"assert incentive properties"* — over a
> **continuum and an adaptive probe**, not a handful of endpoints — and puts it and `npm test` in a
> minimal GitHub Action. The audit's highest-leverage investment and the mechanism that enforces the
> revised principle, *measure the game, not just the modules.* Must follow Phase 1 — and Phase 1's
> dispatch deletions — so the model it asserts is the right one and the dispatch surface is final.

## Goal

Three problems, in order:

- **The harness is dead.** [`tools/balance.mjs:12`](../../tools/balance.mjs#L12) imports retired v4
  exports (`buildCapacity`, `upgradeUnit`, `serviceUnit`) and uses `kind==="peaker"`/`u.tier`/`S.won`,
  so `node tools/balance.mjs` throws before it runs.
- **The game is noiseless under the harness (M8/M10).** Weather, demand jitter, spikes and trips draw
  from global `Math.random` ([sim.js:317-326, 370](../../src/live/sim.js#L317)); pinning it for
  determinism *freezes* them, so the "reach a quarter" gate and VOLL exposure would be measured on a
  skeleton, not the volatile game that actually kills players.
- **The policy space can't see the exploit (B4).** Four static quarter-level policies can't express an
  hour-varying, sub-MW, interior optimum. A green harness over that policy set *certifies* the bug.
  "No canned policy beats serve-everything" is not "no strategy beats it."

## Part A — Seeded env RNG (M10, pulled forward)

Route weather, demand jitter, spike rolls and trip rolls through a seeded `S.rngEnv` (the same
split-stream discipline the economic noise already uses — `S.rng`/`S.rngForecast`). Deterministic from
a logged seed ⇒ (a) the harness runs the *real* volatile game across a seed batch, (b) a player's bug
report replays exactly. Keep the env stream **separate** from the economic streams so sharpening one
never desyncs the other (the existing `seed ^ 0xF0` pattern).

> This is determinism *infrastructure*, not a game mechanic — it sits inside the feature freeze. It
> also retires the "Replayable from seed overstates it" caveat the audit raised (M10).

## Part B — The asserting harness (locked scope)

An **autoplay bot** drives the headless sim under several policies; **probes** assert properties over
the resulting distributions, across a **seed batch** (Part A). All CI-gating:

1. **Incentive asserts — over a continuum.**
   - `π(covered) > π(short)` as a **strictly-decreasing sub-MW U-sweep** `{0.1,0.5,1,5,20,50,100}` MW
     (not two points — the sub-MW optimum must be in range);
   - `π` **non-increasing across `hold ∈ {0,.1,….9}`** on a surplus-fleet fixture (the interior floor
     farm);
   - `priceServed(D−ε) == priceServed(D)` (continuity);
   - mint correlates with true PnL.
2. **Conservation asserts** — the full `Δcash = pnl + bonus − fine − capex − R&D − Δdebt + salvage`
   identity; contract-settlement identity.
3. **Dominant-strategy search + adaptive probe** — the canned policies (`do-nothing`,
   `overbuild-and-hold`, `serve-everything`, `cheap-baseload`) **plus** a greedy hill-climb over
   per-hour `bandMax`/`reserveHold`/commit against net profit (the only thing that finds a
   temporal/interior optimum). Assert the intended policy wins **by a margin** (`≥ X%`), not merely
   ranks first. `serve-everything` is defined *operationally* and the "reach a quarter" baseline bot is
   a **distinct** policy, so the race isn't circular.
4. **"Reach a quarter" bot gate** — the baseline bot reaches the Q1 board review from the **frozen
   start** within a **frozen budget** (both numbers named in the plan, not left as "within budget"),
   measured across the seed batch.
5. **No-dead-content gate** — a **registry** of purchasable ids, each with a **state-delta test on a
   canonical fixture** (buying it produces an observable, distinct effect). **No exceptions file** — an
   id with no measurable effect fails the build. (Greens once Phase 3's deletions land.)

**Still deferred (own pass, on top of M10):** balance-regression snapshots and the difficulty-curve
report. Seeded replay is now *possible*; the tooling that diffs economic metrics across versions is
later telemetry, not an integrity guard.

## Module contract

- **`src/live/sim.js` / `src/live/rng.js`** — `S.rngEnv` seeded stream; weather/jitter/spike/trip draw
  from it; seeded at `seedRun`, logged for replay.
- **`tools/balance.mjs`** — rewrite to the v5 action surface; **pin the global RNG before
  `createGame`** (the construction-time `Math.random` gotcha); expose `autoplay(strategy, S)` and
  `assertIncentives(runs) → {ok, violations[]}`; exit **non-zero** on any violation, each printed as an
  `ok`/`FAIL` line with the measured margin.
- **`tests/harness.test.mjs`** — a small, fast seed batch of the asserts (so the harness is covered by
  `npm test` + auto-discovery); the heavy sweep stays a separate `node tools/balance.mjs <bigN>` the
  Action also runs and Phase 5 uses.
- **`.github/workflows/test.yml`** — minimal Action: on push + pull_request → checkout, Node,
  `npm test`, then `node tools/balance.mjs` (smoke batch). ~15 lines. **Tests only**; no deploy (Pages
  still builds from `main` manually). The Action's own comment states the narrow principle.
- **`tools/run-tests.mjs`** — update the header comment that claims *"mirrors the project's no-build,
  no-CI discipline"* (the no-CI-for-tests principle is reversed here; full copy sweep is Phase 4).

## Tasks (TDD)

1. **Seed the env stream** (Part A) — a test: a pinned `S.rngEnv` seed reproduces an identical
   weather/spike/trip series across runs; the economic streams are unaffected.
2. **Port the bot** — `node tools/balance.mjs` runs a seeded v5 quarter end-to-end (RNG pinned first).
3. **Canned strategies** — the four policies as pure strategy functions; `serve-everything`
   operational; baseline bot distinct.
4. **Continuum + conservation asserts** — the U-sweep, hold-sweep, continuity, reconciliation.
5. **Adaptive probe** — the greedy per-hour hill-climb; assert it does **not** beat `serve-everything`
   by more than the margin (if it does, that's the exploit — fail).
6. **Reach-a-quarter gate** — frozen start + budget; assert the baseline bot reaches Q1 across the
   batch.
7. **No-dead-content registry** — the state-delta fixture test; no exceptions file.
8. **Wire CI** — green on a branch push; a deliberately reverted Phase-1 continuity fix (local
   experiment) makes it go **red** — prove the gate bites, then restore.

## Done when

- A pinned seed replays the full stochastic game; `node tools/balance.mjs` runs clean and **fails
  loudly** on an injected incentive violation (incl. a sub-MW short and an interior hold).
- `tests/harness.test.mjs` green under `npm test`; the Action green on push; the adaptive probe finds
  no strategy that beats `serve-everything` by the margin.
- The project has a visible test gate for the first time.

## Notes / caveats

- **The adaptive probe is the point of this phase.** Endpoint asserts can't see an interior or limit
  optimum; the hill-climb is what turns "the modules pass" into "no strategy we didn't intend wins."
- **CI is for tests, not deploy** — narrow and deliberate; say so in the Action's comment.
- **Keep CI fast** — a smoke batch; the heavy sweep is local / Phase 5. A slow gate gets ignored.
- **Public repo = free Actions minutes**, suites run in seconds — no new paid service, seconds of
  wall-clock per push.
- **What the harness still won't catch** (named honestly, for Phase 5's human gate and later work):
  multi-quarter treadmill/aging behaviour (one-quarter runs), contract/offer *fair value* (conservation
  is an identity, not fairness), whether the winning line is *legible or fun*, and the mint *rate* (vs
  monotonicity). These are design calls, not asserts.
