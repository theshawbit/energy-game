# Changelog

All notable changes to Grid Operator are recorded here. Versions follow the game's own
`vMAJOR.MINOR.PATCH` line (the same tags used in the git history and the `docs/` roadmaps).
Tests are **CI-gated** — a GitHub Action runs the full `npm test` suite (including the
`tools/balance.mjs` economy-incentive asserts) on every push and PR. **Deploy stays manual**:
every merge to `main` redeploys the live build via GitHub Pages with no build step and no
deploy pipeline. (See the root README's *Engineering principles* for why.)

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### v5.3 "Integrity" — economy-correctness milestone (2026-10-31)

A feature-freeze milestone born from an external audit that found 34 green test suites coexisting
with critical economy bugs — *engineering-mature, design-immature*. Five phases, no new features;
the point was to make the code honest and then prove it. See [`docs/plan-v5.3/`](plan-v5.3/README.md)
and [`docs/PLAYTEST-v5.3.md`](PLAYTEST-v5.3.md).

- **The real market (Phase 1).** Served load now earns the engine's **continuous clearing price**
  (`priceServed`, additive) instead of the cap-spiked signal, and dispatch is **price-taking** (full
  available capacity, so no withholding). This killed the "go dark by a sliver and bank the cap"
  exploit the audit found: covering the city is now strictly the profit-maximising play. Forced
  unserved load costs **VOLL** (a fairness knob). PnL is reconciled to cash to the dollar; minting ⚡
  is gated on a profitable, well-served quarter. *(The throttle dials were deleted here — `commit` is
  the only dispatch lever.)*
- **Tests are CI-gated (Phase 2).** A GitHub Action runs the full `npm test` suite on every push/PR,
  and `tools/balance.mjs` was rebuilt into a **9-assert incentive harness** (continuity, an incentive
  U-sweep, price-taking, conservation, reach-a-quarter, a dominant-strategy + hill-climbing adaptive
  probe, mint, no-dead-content). The environment RNG is seeded so the harness measures the real,
  volatile game. *(Revised principle: "no CI" now means no CI **for deploy**; deploy stays manual.)*
- **One trouble-meter; residue deleted (Phase 3).** The four overlapping "grid in trouble" signals
  collapsed onto the single grid-stability reservoir; inert/lying mechanics were **deleted** (the
  service-manager path, dead aging fields, a stranded auto-dispatch perk, the second wear model). The
  pause state was single-sourced (one resume click). A broken payoff was fixed: completing a KPI
  upgrade tier now raises the **live** KPI, not just the cap — buying a tier is never a 0-MW purchase.
- **Docs reconciliation + version stamp (Phase 4, early half).** The README module map was regenerated
  from `src/live/` (16 listed → 34 real), the revised principles recorded, and a single-sourced
  **version stamp** added to the page (quotable in a bug report). *(Revised principle: the **clearing
  logic** is sacred, not the `engine.js` file — additive outputs like `priceServed` are allowed.)*
- **Balance pass + playtest gate (Phase 5).** Every placeholder number settled against the asserting
  harness, with the passive-reach-a-quarter gate going **21/24 → 48/48**. Two deferred levers folded
  in: **H1** — stability fill now scales with shortfall **magnitude** (a shallow brownout barely dings
  the bar, a deep blackout fills fast); **H7** — the aging trip multiplier is **hard-capped** so a long
  run can't degenerate into certain trips (new day-400 non-degeneracy test). VOLL settled at 10× the
  price cap for survivability. A proxy playtest confirmed the game is coherent and its P&L legible at
  the board review; the human playtest and two live-screen legibility findings are recorded in
  [`PLAYTEST-v5.3.md`](PLAYTEST-v5.3.md).

**Known / deferred:** the human playtest; a UI legibility pass (surface the live VOLL/unserved
penalty; the overdrawn-cash readout; the audit's "content density outruns the data" note); the
fail-state "is roguelite game-over the right model?" decision (now *answerable*, deferred to v5.4);
and the Phase-4-late in-game/home copy rewrite (the home screen still sells the older "survive it to
win" run model — now unblocked).

### Changed — v5.2 Phase 2: pacing & fail-state legibility (2026-10-31)

Clears the two secondary blockers to reaching a quarter review and makes the survival read
honest. Second phase of the **v5.2 playability rebalance** ([`docs/plan-v5.2/`](docs/plan-v5.2/README.md)).

- **Shorter day + auto-pace.** `CFG.secondsPerDay` 180 → **100** (the old ~3-min day was why a
  quarter never arrived). On top, new **auto-pace**: the live clock fast-forwards
  (`CFG.v5.fastSpeed`) through calm game-hours and drops to **1×** the moment something needs
  watching — an active spike, a unit starting/strained/tripped, thin capacity headroom, or the
  strain reservoir in its danger band. New pure `pacePlan(S)` in `clock.js`; it **never forces a
  pause** (crisis pausing stays with the existing `autoPause` strain hook, so it can't fight the
  player for the wheel). Any manual speed change holds until the next day boundary (`paceHeld`).
- **Re-seated the real-seconds constants** for the shorter day: `strainRate` 14 → **25**,
  `strainRecover` 12 → **22** (INVERSE — `rate × secondsPerDay` ≈ const, per-game-day severity
  preserved), `bankruptcyGrace` 22 → **12** (DIRECT — `grace / secondsPerDay` ≈ const, the
  game-time grace window preserved). Stability fill/drain are per-game-hour and left for the
  balance pass to retune against the tamed curve.
- **Strain bar relabel** — `Grid Stability` → **`Grid Strain`** in the top strip (`index.html`).
  Cosmetic only: the reservoir, its fill direction (0% = good, rises to collapse), and
  `renderStabilityBar` are **unchanged** — no inversion to a health bar, per the grill decision.
- New `tests/pacing.test.mjs` (34 suites green): re-seat coherence (per-game-day severity/grace),
  the pure `pacePlan` classifier, and a relabel-is-cosmetic guard. Headless 15-day run clean;
  live-verified the relabel + no console errors. `engine.js` untouched.

### Changed — v5.2 Phase 1: peak formula rework (B-split saturating shock) (2026-10-31)

A human playtest of v5.1 (12 days, ~36 min, never reached a quarter review) exposed the real
playability killer: the **intraday peak**, not demand growth. v5.1's quarterly baseline is flat
within a quarter — but the **live demand assembly** (`sim.js`) multiplied four surge sources
(daily noise × event regime × load wobble × demand spike), so a winter evening could stack to
**+57% over baseline at random** (≈1,222 MW), an unpreventable spike that dropped the player into
an uncontrollable day-5/6 blackout. First phase of the **v5.2 playability rebalance** (grilled
2026-10-31, [`docs/plan-v5.2/`](docs/plan-v5.2/README.md)).

- **Split model ("B-split").** Demand is now a **foreseeable lift** (daily noise + event regime —
  plannable, surfaced in the brief, you build reserve for it) × a **capped random shock**
  (`1 + Smax·tanh((wSpike·spike + wWobble·wobble)/Smax)`). New pure `peakShock()` in `demand.js`;
  `tanh` saturates so the random surge can **never** stack into a death-peak — `shockCap` (Smax)
  is the single explicit "hardest peak the game can ever throw," the true pinch point, set on
  purpose. The spike is the dominant weighted term; the wobble is seasoning.
- **Relief preserved.** A *downward* load wobble stays uncapped relief on the foreseeable side
  (a lull still helps); only the *upward* transient feeds the cap.
- `stepDemand`, the quarterly baseline, and the event regime are **unchanged** — this reworks only
  how the intraday transients combine. `CFG.v5_2.peak` holds PLACEHOLDER balance numbers
  (`shockCap`, `wSpike`, `wWobble`); the tests pin the SHAPE (capped, spike-dominant, saturating,
  relief-preserving), not the values, which the balance pass settles against the real fleet.
- New `tests/peak-formula.test.mjs` (33 suites green). Browser-verified: zero demand-ceiling
  violations across 3,200 live ticks / 12 days; max demand 868 MW vs the old ~1,222. `engine.js` untouched.

### Planned — v5 "The Persistent Grid" (scoped, not built)

A **genre pivot** from survival roguelike to a persistent management / operations sim: one
grid you own and grow, no run reset, the goal being to keep a growing city powered. Fully
scoped in a design grill (pivot 2026-10-27, refined 2026-10-28) and captured in
[`docs/ROADMAP-v5.md`](docs/ROADMAP-v5.md). Headline design: a **daily** tactical loop (~3-min
live day) inside a **Year ▸ Quarter ▸ Day** calendar (quarter = season = fiscal period, ~22
days, ending in a scored board review); variable auto-pause clock; **Core+ dial-able dispatch**
(commitment · output band · reserve hold · push; peakers dissolve into tunable gas); four
axis-aligned KPIs mapped 1:1 to revenue; operating-style-driven degradation; **cut-throat
quarter-end maintenance** with a soft-specialized, levelling crew pool; lead-time construction
with an overextension soft-cap; a **hybrid economy** — regulated capacity floor + market swing
(which *revives* `market.js`/`finance.js`/`capacity.js` rather than retiring them); three
currency lanes with ⚡ automation gated to late game; emergent specialization; and a
**corporate-dystopian, Rust-District-→-New-Veridia** tone. `engine.js` stays sacred. The phased implementation spec
lives in [`docs/plan-v5/`](docs/plan-v5/README.md) (9 phases); it retires the earlier
`PLAN-v5.1-progression.md`.

### Added — v5 Phase 1: time & calendar, no game-over (2026-10-29)

First slice of the pivot — the persistent-grid lifecycle, built test-first.
See [`docs/plan-v5/phase-1-time-calendar.md`](docs/plan-v5/phase-1-time-calendar.md).

- **`Year ▸ Quarter ▸ Day` calendar** (`src/live/calendar.js`): 22-day quarters, 4
  quarters/year, season per quarter; a monotonic `absDay`, and a command-bar stamp
  (`Y1 · Q1 Winter · Day 1/22`) replacing the old `DAY n` readout.
- **Deliberate clock** (`src/live/clock.js`): a ~3-min live day (`secondsPerDay` 48 → 180),
  a three-speed set (hold · 1× · fast), and an `autoPause` hook. Pause is now a **read-only
  hold** (clock speed 0), and a **▶ fast-forward** button joins the console.
- **No run end.** Removed game-over entirely — blackouts, chronic shortfall and insolvency
  now inflict pain (strain, satisfaction, penalties, a one-time credit default) but **never
  end the grid**. Completing a quarter pauses into a **Planning Office** stub and resumes
  into the next quarter (`beginNextQuarter`); demand keeps steepening year-over-year with no
  reset.
- **Clean-break persistence** (`gridop.v5` key): v4 saves are ignored, not migrated.
- New `calendar`/`clock` suites + rewritten sim/persist assertions; all 16 suites green.

### Added — v5 Phase 2: dial-able dispatch (2026-10-29)

The fixed on/off fleet becomes the **Core+ four dials per plant**, and the dedicated
peaker is retired. See [`docs/plan-v5/phase-2-dispatch-dials.md`](docs/plan-v5/phase-2-dispatch-dials.md).

- **`dispatch.js` (new, pure)** — the dials → merit-order offer. `applyDials(u)` resolves
  commit · output band · reserve hold into `{min, max, committed, held}`; `defaultDials`
  gives sane opt-in defaults (baseload committed, gas in reserve) so a fresh fleet runs like
  v4 untouched; `cycleCost` classifies a dial change as a start/ramp (the Phase 3 Flexibility
  hook). `engine.js` stays **sacred** — the dials shape only the band it clears within.
- **Reserve hold** shaves the offered max, keeping headroom back from the market swing
  (surfaced on `S.reserveOffered` — it earns the capacity floor in Phase 6).
- **Peaker retired.** The dedicated `peaker` kind is gone; the former peakers are dial-able
  **fast gas** (`kind:"gas"`, `CFG.v5.gas` ramp/start timing). A gas plant dialled to a narrow
  high band is the old peaker, through the same engine. The build catalogue's entry now builds gas.
- **Dials UI** — every dial-able plant gets a Commit · Band · Reserve-hold · Push control strip
  in Manage ▸ Fleet; the live fleet bank still arms gas by tap/hotkey (commit dial).
- New `dispatch` suite (8 tasks) + sim/mutators assertions updated for the gas kind; all 17 green.
- **Push has no mechanical effect yet** — it is a stored dial until the Phase 3 degradation keystone.

### Added — v5 Phase 3: KPIs & style-driven degradation (2026-10-29)

The single `condition %` becomes **four axis-aligned KPIs**, and how you *run* a plant decides
which one decays — the degradation keystone the dials were built for. See
[`docs/plan-v5/phase-3-kpis-degradation.md`](docs/plan-v5/phase-3-kpis-degradation.md).

- **`kpi.js` (new, pure, RNG-free)** — the four axes (`reliability` · `efficiency` · `output` ·
  `flexibility`) and their effects: Output derates effective max (`effectiveMax`), Efficiency
  re-prices fuel (`heatRateMult`), Flexibility sets ramp speed + min stable load, Reliability
  gates trips. `degradeKPIs(u, style, dtH)` is the keystone: **push + sustained high load** wears
  Reliability & Output, **part-load** wears Efficiency, **cycling** (ramps/starts) beats up
  Flexibility (a start also nicks Reliability). `revenueCoeffs` is the clean 1:1 axis→money map
  Phase 6 will bet on.
- **Wear is earned by style, never ambient.** The old age-driven wear is gone — `ageHours` is
  still tracked (Phase 4 reads it) but no longer decays a plant by itself; a calm neutral day
  barely moves the KPIs.
- **`engine.js` stays sacred.** The Efficiency penalty is charged as an operator fuel *surcharge*
  on cash, not by reordering the merit order; the engine's clearing price is untouched.
- **`condition` lives on as a derived worst-axis proxy** (`min` of the four), so the dormant v4
  service / auto-service / UI code keeps working unchanged until Phase 4 replaces maintenance.
- **KPI UI** — the single condition bar becomes a compact 2×2 **R·E·O·F** micro-bar cluster, in
  both the live fleet rail and Manage ▸ Fleet (the "Health" column), each bar banded by its value.
- New `kpi` suite (10 tasks); the stale v4 age-wear test is re-pointed at the new style model; all 18 green.

### Added — v5 Phase 4: maintenance & crews (2026-10-29)

Repair becomes **cut-throat and quarter-end-only**, worked by a **soft-specialized, levelling
crew pool**. This retires the v4 mid-quarter service path wholesale. See
[`docs/plan-v5/phase-4-maintenance-crews.md`](docs/plan-v5/phase-4-maintenance-crews.md).

- **`maint.js` (new, pure)** — the per-KPI task catalogue (`overhaul→reliability`,
  `retune→efficiency`, `uprate→output`, `recalibrate→flexibility`), `scheduleTask` (quarter-end
  only — refused in operating), `taskRestore` (base × crew level × on/off-trade), `cancelTask`,
  and `resolveQuarterTasks` (runs at the quarter rollover: completes finished jobs, restores the
  KPI axis, lifts downtime, awards crew XP).
- **`crews.js` (new, pure)** — the crew pool: `makeCrew`, `tradeModifier` (1.0 on-trade, a penalty
  off-trade — never 0, so fungible), `gainXP` (passive levelling), `promote` (spends ⚡, raises the
  crew's level ceiling), `hireCrew` (cash, gated by the roster ceiling), `wageBill`.
- **Downtime is the teeth.** A booked plant sits in **MAINT** — offline for the whole next quarter
  — so triage trades off against serving a rising demand curve. There is **no mid-quarter buy-out**:
  a plant that breaks on day 5 is yours to nurse to the review.
- **Standing costs.** Wages (`N × wage`) are deducted at the quarter rollover (the seam Phase 6
  moves into `settleQuarter`'s PnL). ⚡ ("Guild Cred") promotes standouts; the roster ceiling bites.
- **Planning Office** gains the **maintenance triage** (per-plant KPI deficits + task/crew assign)
  and a **crew roster** (trades, levels, XP, promote/hire). The live fleet shows a MAINT status; the
  Manage ▸ Fleet Service/Overhaul button is gone, replaced by a pointer to the board review.
- **Seams noted:** the `servicemgr` meta skill is now **inert** in v5 (Phase 7's progression rework
  revisits the meta roster); wage deduction moves to `settleQuarter` in Phase 6.
- New `maint` + `crews` suites (10 tasks); v4 service tests retired from `sim.test`; all 20 green.

### Added — v5 Phase 5: lead-time construction (2026-10-29)

New plant becomes a **multi-quarter capital project committed at the quarter-end review** — no
more instant capacity. This retires the v4 instant `buildCapacity` path. See
[`docs/plan-v5/phase-5-construction.md`](docs/plan-v5/phase-5-construction.md).

- **`construct.js` (new, pure)** — `BUILDABLES` (every tech with a lead-time, carrying MW, cost
  and `leadQuarters`), `commitBuild` (quarter-end only — refused in operating; respects research
  gates and cash; deducts capital and queues a `Build`), `tickBuilds` (runs at the quarter rollover:
  a clean quarter decrements `quartersLeft`, completion appends a live `makeUnit` with fresh KPIs +
  dials + a generated name), `concurrencySlip` (the overextension soft-cap) and `forecastDemand`.
- **Lead-times are the wait.** Gas/solar/wind/battery land in 1 quarter, coal/CCS in 2, geo in 3,
  nuclear/SMR in 4 — an in-flight build produces **nothing** until it comes online, so you build
  *ahead* of the demand curve or brown out.
- **Overextension is a soft-cap, not a ceiling.** Past a comfortable count of concurrent projects,
  each further commit carries a rising **slip risk** (capped). A slip makes **no progress that
  quarter** and charges a cost overrun — delay, never a hard block; a huge queue still finishes.
- **Planning Office** gains a **Capacity & construction** section: a demand forecast (Q+1/Q+2/Q+4
  peak vs capacity-incl-in-flight, with shortfall flags), the in-flight queue, and commit buttons
  (research-gated techs disabled; a slip warning when the queue is crowded). **Manage ▸ Build** is
  now a **read-only** pipeline/forecast view that points to the quarter-end review.
- **Seams noted:** `forecastDemand` uses the steep v4 `peakGrowth`, so far-horizon peaks read very
  large — the demand-scaling retune is deferred to Phase 6. `tools/balance.mjs` (a dev-only tuning
  script, not in the suite) still imports the retired v4 paths and is left stale.
- New `construct` suite (10 tasks, deterministic via an injected rng); v4 `buildCapacity` tests
  ported to a direct `addUnit` helper or moved into `construct.test`; all 21 suites green.

### Added — v5 Phase 6: hybrid economy & the overlord's verdict (2026-10-30)

The loop now settles on a **regulated capacity floor + a market swing + a quarterly board
verdict** — the KPI→revenue mapping goes live, and failure becomes **stagnation, never a
game-over**. This **revives** (does not delete) the shipped `market.js`/`finance.js`/`capacity.js`.
See [`docs/plan-v5/phase-6-hybrid-economy.md`](docs/plan-v5/phase-6-hybrid-economy.md).

- **Two income surfaces.** The **floor** (`capacity.floorEarn`) pays availability on the MW each
  committed thermal unit holds back via `reserveHold`, at the ratcheted floor rate, keyed to that
  unit's **Reliability**. The **swing** (`market.swingEarn`/`swingCoeff`) is the residual served
  load clearing at spot, scaled by the fleet's **Output/Flexibility** capture quality. Held reserve
  earns the floor, pushed MW earns the swing — the two never double-count, and a fresh fleet's swing
  equals the raw v4 spot revenue (no regression). Efficiency stays on the fuel-cost side (the Phase 3
  `effSurcharge`), so it isn't double-charged.
- **`verdict.js` (new, pure)** — `settleQuarter(S) → Verdict` grades the quarter from `S.quarterLog`
  alone (fleet KPI average · serve rate · clean standing) into a 0..1 grade, ratchets next quarter's
  floor rate, and hands a bonus or fine with a barbed one-liner; `applyVerdict(S, v)` banks it and
  sets the **stagnation lever**. `freshQuarterLog`/`freshEconomy` seed the new `S.quarterLog`/
  `S.economy` state, accrued each tick and reset at every rollover.
- **Stagnation, not death.** A quarter that serves below the threshold stalls the *next* quarter's
  demand growth (never the base), and insolvency keeps its v4 teeth (a default still craters credit)
  but is **never** a game-over — `S.over` is never set; recovery must be earned.
- **Seams closed.** Crew wages (Phase 4) and build overruns (Phase 5) now settle into the quarter's
  PnL at `settleQuarter`.
- **180s-day re-tune.** `strainRate`/`strainRecover`/`satDrain`/`bankruptcyGrace` were still sized for
  the old 48s day; scaled for the 180s day so a brownout's strain escalates over a real stretch of a
  shortfall rather than pinning instantly. `bankruptcyGrace` now gates *pain onset*, not death.
- **Planning Office** gains the **board review**: the overlord's verdict card (grade, KPI/serve/clean,
  floor-vs-swing split, rate ratchet, bonus/fine, the barbed note) and a read-only contract book.
- New `economy` (14 checks) + `verdict` (18 checks) suites; `guards`/`maint` re-based on the new
  settlement; all **23 suites green**.
- **Still deferred:** the steep `peakGrowth` demand *cadence* (per-day compounding) is a dedicated
  balance pass, not this phase; `tools/balance.mjs` remains stale.

### Added — v5 Phase 7: progression — specialization, ceilings & ⚡ perks (2026-10-30)

The grid now **grows deeper, not just wider.** The v4 `Mk I→II→III` upgrade ladder is **retired**
wholesale and replaced by three growth lanes, built at the quarter-end Development Office. See
[`docs/plan-v5/phase-7-progression.md`](docs/plan-v5/phase-7-progression.md).

- **`progression.js` (new, pure).** `applyUpgrade`/`upgradeCost`, `raiseCeiling`/`ceilingCost`,
  `unlockPerk` + the automation gate (`automationTier`/`isAutomationUnlocked`), and the two
  automation behaviours (`autoMaintenancePlan`/`dispatchAssist`). State in → values out / mutate-`S`.
- **Specialization (cash).** Each thermal plant carries per-axis attainable-maxes `u.caps` (seeded at
  100 by `freshCaps`). Spending cash raises one axis's cap by a step along a **steepening** per-axis
  curve (`cost0` × `costGrowth^steps`) — no branch lock, any mix allowed, spreading thin costs more.
  The four axes **subsume the old Mk tier** (its cap/fail/spin effects now live on Output/Reliability/
  Flexibility). Renewables and batteries grow by *building more*, not specializing.
- **KPI curves read past 100.** `kpi.js` now extends every effect curve to `CFG.v5.upgrade.axisMax`
  (150) so a specialized axis is a real edge: Output beats nameplate MW, Efficiency burns less fuel,
  Flexibility ramps faster / turns down further. `degradeKPIs` clamps to each axis's own cap (not a
  flat 100), and maintenance restores *toward the raised cap* — a specialized plant is nursed back to
  its upgraded level, not erased to base.
- **Research ceilings (RP).** Cash alone reaches `baseCeiling` (120); `raiseCeiling` spends RP to lift
  a whole **tech family's** hard ceiling on an axis by `ceilingStep` (up to `axisMax`), stored in
  `S.capCeil`. The named v3 research tree (`research.js`) is kept intact for build gates / buffs; its
  now-inert `amp-upgrades` node is re-pointed to a **15% discount** on specialization cost.
- **⚡ Perks + the automation growth-gate.** `unlockPerk` spends ⚡ on roster expansion, research-branch
  unlocks (the v5 path that opens `advgen`/`forecasting` nodes), and **automation** —
  **Auto-Maintenance** (free crews auto-assigned to the neediest plants at the review; still paid) and
  **Dispatch Assist** (unpinned committed plants open their band to the legal max each tick). Automation
  is **growth-tier-gated** (`CFG.v5.perks.tiers`: fleet size × year) — a small grid can't automate, so
  you feel the clerical burden of scale before earning the relief. A **📌 pin** toggle shields a
  hand-tuned plant from Dispatch Assist.
- **Development Office** UI in the Planning Office: per-plant R·E·O·F specialization chips, per-family
  ceiling raises, and the perk catalogue (automation shown locked-until-tier).
- New `progression` suite (40 checks); `research`/`sim` re-based off the retired Mk ladder; all
  **24 suites green**.
- **Still deferred:** the `peakGrowth` demand cadence re-tune (carried from Phase 6); v4 narrative copy
  (→ Phase 9); `tools/balance.mjs` remains stale.

### Added — v5 Phase 8: crisis toolkit & seasonal event regime (2026-10-30)

Two additions make the live day survivable and the seasons matter. See
[`docs/plan-v5/phase-8-crisis-events.md`](docs/plan-v5/phase-8-crisis-events.md).

- **Mid-quarter crisis toolkit (`src/live/crisis.js`, new/pure).** Because maintenance is
  quarter-end only, a plant that fails on day 5 now has an **earned, penalised** escape hatch —
  nothing free:
  - **Load-shed** — `loadShedTiers(S)` / `triggerLoadShed(S, tierId)` cut a pre-prioritised
    non-critical load tier (industrial → commercial → residential), a *controlled* brownout that
    **reuses** the shipped shortfall mechanic (the cut simply lowers demand for a short window so the
    grid clears). It takes a real satisfaction hit now and books a fine into the quarter PnL
    (`quarterLog.shedFines`) — verified **cheaper than the blackout it averts**, never free.
  - **Demand response** — `canDemandRespond` / `triggerDemandResponse` fire an active peak shave,
    gated **strictly** on the demand-response research branch (`rmods.demandShave > 0`): foresight,
    never a panic button. One shot per window, then a cooldown.
  - A **telegraphed trip auto-pauses** the clock (Phase 1 `autoPause`) so the tools are reachable
    before the grid falls.
- **Seasonal event regime (`src/live/events.js`, new/pure, grown from `mutators.js`).** Each quarter
  is a season with a weather bias + a weighted event deck dealt from the shipped mutator ids.
  `rollRegime(S, rng)` deals the coming quarter's events at the rollover (deterministic under a pinned
  stream); `regimeMods(S)` folds the active regime into the **same shape** `computeMutatorMods`
  returns, so `step` consumes it through `S.mmods` with no new plumbing — **winter/summer peak hard**,
  the shoulder seasons are milder. The one-shot per-run mutator roll is **retired** (the regime
  supersedes it); the Operating Room gains a crisis bar (regime name + shed tiers + DR button).
- Costs settle through Phase 6 (new `quarterLog.shedFines` folds into the verdict PnL). New
  `crisis` (17 checks) + `events` (14 checks) suites; all **26 suites green**.
- **Still deferred:** the `peakGrowth` demand cadence re-tune; v4 narrative copy + the regime's
  flavour text (→ Phase 9, which owns all copy); `tools/balance.mjs` remains stale. (Note: `sim.test`
  carries a pre-existing trip-hazard flake — it doesn't pin the global RNG — unrelated to this phase.)

### Added — v5 Phase 9: world & narrative — the identity arc + C.A.S.S./overlord voice (2026-10-30)

The final v5 phase. A **cosmetic world layer** over the finished sim: the district's visual
identity, the dispatch AI's deadpan barks, and the overlord's verdict voice — **all copy lives as
data in `CFG.v5.world`**, and a pure selector (`src/live/world.js`) reads it. See
[`docs/plan-v5/phase-9-world-narrative.md`](docs/plan-v5/phase-9-world-narrative.md).

- **Identity arc (`eraOf`).** The grid grows from the **Rust District → Transition → New Veridia**,
  gated on two *monotonic* inputs together — the calendar year **and** the demand peak — so it never
  regresses. The era sets a `body[data-era]` accent and relabels the crisis strip; it never gates play.
- **Era-aware plant naming.** `plantName(tech, n, era)` / `makeUnit(…, era)` draw late-era builds from
  the New Veridia name pools (`Solaris Fields Solar`, `Veridia Prime Nuclear`, …); omitting `era` (or
  `"rust"`) keeps the **shipped foundry names exactly** — every one still appears, and a name is fixed
  once at a unit's birth. `construct.tickBuilds` passes the live era.
- **C.A.S.S. — the dispatch AI (`cassLine`).** A deadpan one-liner for every shipped mutator id and
  live state (`trip`/`strain`/`brownout`/`milestone`/`calm`), keyed off the day so it's deterministic
  and **never consumes the economic RNG**; it rides the crisis bar. Unknown keys fall back, never empty.
- **The overlord's verdict voice (`overlordNote`).** Replaces the Phase 6 stub string — a pure,
  grade-driven selector over the verdict's own fields (praise is never warm, a fine is always barbed).
  `verdict.js` now imports it; the scoring logic is untouched.
- **The cardinal rule, tested.** Flavour **colours** the sim, it never **gates** it: the `world` suite's
  strip test blanks every copy table to `""` and asserts an identical run — same cash, dispatch, fleet
  condition, demand peak. New `world` suite (5 tasks / 40 checks); **all 27 suites green**. The storyline
  bibles' `Mk`-ladder / succession language is reconciled to the persistent-grid KPI frame (docs only).
- **Still deferred (carried past v5):** the `peakGrowth` demand cadence re-tune (a dedicated balance
  pass); `tools/balance.mjs` remains stale. (The pre-existing `sim.test` trip-hazard flake — it doesn't
  pin the global RNG — is unrelated; note `createGame` draws `Math.random` at construction, so a
  deterministic headless run must pin the global RNG *before* calling it.)

### Fixed — v5.1: daily-brief panel overflow (2026-10-30)

Follow-up to Phase 7 (playtest report). The daily-brief overlay had **no CSS of its own**, so it
inherited the base centred 460px modal with no max-height — on a normal screen it overflowed the
viewport with no way to scroll, leaving the **Advance / Step-a-day buttons unreachable**, and its two
columns stacked into one cramped, centred strip.

- **`styles/live.css`** — new `.modal.brief` block: a wide (820px), left-aligned, **scrollable** sheet
  (`max-height:90vh; overflow-y:auto`), a real two-column `.brief-cols` grid (stacks to one column at
  phone width), styled section headings + alert chips, and a **sticky footer** so Advance / Step stay in
  reach without scrolling to the very bottom.
- CSS only — no markup or logic change; `renderBrief` already emitted these class names.

### Changed — v5.1 Phase 7: UI overhaul (2026-10-30)

Final phase of the [v5.1 rebalance](docs/plan-v5.1/README.md) — the capstone. A week of play showed
the single-column console was overcrowded, and v5.1 added a lot (HP bar, two rolling queues, a 4×9
upgrade matrix, the brief). This re-lays the live screen onto a **wider canvas** so everything v5.1
added fits without feeling denser than v5 did. Layout only — no logic changes, **all 32 suites stay green**.

- **Wider single-column console.** `.wrap` widens to ~1520px; the demand-vs-capacity graph sits on
  top, the fleet below it at full width. The old fixed-height no-scroll skeleton (which fought the
  wider canvas) is retired for natural page scroll with a height-capped canvas.
- **Fleet in four dispatch-role lanes** (`render.js` `buildUnits`/`updateUnits` reworked) — *Baseload ·
  firm* · *Dispatchable gas* · *Renewable* · *Storage*, mapping `u.kind` 1:1, so the lanes are stable
  and immune to tech sprawl (coal/SMR/geo/CCS all = firm; gas = the former peaker). Each lane is its
  own live monitor table, role-accented, with a count badge and an empty-state line; rows still build
  once and patch each frame (no teardown) and now **auto-sort by urgency within their lane**. Columns
  size to content so nothing truncates or overlaps at narrow lane widths. Responsive: 4 across → 2×2
  (tablet) → single column (phone), no horizontal scroll.
- **Grid-stability HP bar in the top strip** (`renderStabilityBar`) — the Phase 2 text readout becomes
  an always-visible life bar that colour-ramps toward collapse, with a `data-state` fill-vs-danger pulse.
- **Per-plant upgrade drill-down** (`renderPlantDetail`) — a firm/gas plant's new **⚙** opens a panel
  with its four 9-tier axis ladders (pips · current tier · live KPI vs attainable cap · next-tier cost +
  ETA) and queue-upgrade buttons routing to the Phase 3 contractor line; it re-renders in place after a
  queue and closes on Escape / Close. The ⚙ stops the row's arm handler so opening it never fires a gas unit.
- **`index.html`** restructured (top-strip HP bar, fleet-lanes mount below the graph, plant-detail
  overlay); **`styles/live.css`** gains the wider grid, the four lanes, the HP-bar states, and the
  drill-down panel, with the narrow fallback. The brief panel (Phase 5) and the quarter-review scorecard
  (Phase 6) already carried their own panels.
- Browser-smoked across desktop / tablet / phone: four operational lanes, the HP bar unmissable, upgrades
  one click deep, zero console errors. **v5.1 COMPLETE (all 7 phases).**

### Added — v5.1 Phase 6: KPI → ⚡ currency (2026-10-30)

Sixth phase of the [v5.1 rebalance](docs/plan-v5.1/README.md). Fixes the **orphaned skill currency**:
the end-of-run ⚡ award died with the v5 run, leaving the permanent skill tree with no faucet and
`S.zap` (crew promotions, perks) funded by nothing. ⚡ now **mints quarterly** from a KPI scorecard and
banks to the profile every board review — one unified pool the live run spends and the tree carries over.

- **`src/live/scorecard.js` (new, pure).** `scoreQuarter(S)` reads the closed quarter's log alone and
  scores **seven metrics in two channels** — PnL (net **margin**, **cost** discipline $/MWh, **capital
  efficiency** on cash sunk) and Satisfaction (**reliability**, **headroom**, **cleanliness**,
  **affordability**) — each `0..1` on its own curve, every division guarded against an empty log. Each
  channel averages its metrics and mints its **50/50** share of the pool, so a lopsided operator can't
  out-earn a balanced one and no single metric dominates. `mintCurrency(sc)` → the rounded, never-negative
  ⚡ total.
- **One ⚡ pool.** `main.js` mirrors `S.zap` ↔ `profile.currency`: seeded from the banked balance at run
  start, written back after every promote/perk spend, and topped up at the quarter rollover by banking the
  verdict's mint through `awardCurrency` (meta.js's only faucet), latched to fire **once** per quarter.
- **`verdict.js`** attaches the scorecard + `mintTotal` to the verdict (the grade formula is **unchanged** —
  the scorecard is the additive *currency* layer, the serve/kpi/clean composite still drives the ratchet);
  `freshQuarterLog` gains the raw accumulators the scorecard needs (`opCost`, `capitalSunk`, `reserveAccum`,
  `priceAccum`, `hours`). **`sim.js`** accrues operating cost / reserve / price / hours per tick;
  **`construct.js`** + **`contractor.js`** accrue `capitalSunk` when capital is committed.
- **`render.js`** — the Board Review verdict card gains a scorecard block: the seven metrics as bars under
  their two channel subtotals, the 50/50 split, and the ⚡ minted (styled in `styles/live.css`).
- **`meta.js`** — the dead `currencyForRun` end-of-run award is retired; `scoreTracks` / `SCORE_TRACKS`
  stay for the per-track records + stats hub.
- **`config.js`** — new `CFG.v5_1.score` (pool size, channel split, and the reference points each metric
  normalises against). PLACEHOLDER curves, to be tuned by play.
- New `scorecard` suite (6 spec tasks) + `meta` rebased off `currencyForRun`; `verdict` passes unchanged.
  **All 32 suites green.**

### Added — v5.1 Phase 5: daily brief loop (2026-10-30)

Fifth phase of the [v5.1 rebalance](docs/plan-v5.1/README.md). Reintroduces the pre-grill **daily
summary** as a **blocking-but-skippable** beat — the one place you review the fleet and feed the two
rolling queues (maintenance crews + contractor upgrades) — without the 22 forced pauses a quarter.

- **`src/live/brief.js` (new, pure-ish).** `shouldInterrupt(S)` — the auto-advance gate: true when an
  exception demands attention (a rolling maint/upgrade job landed this day, a crisis auto-pause, capacity
  headroom gone tight, cash under a floor, or the stability bar in its danger band). `briefSummary(S)` —
  a pure read returning the day recap, both queues with ETAs, demand vs capacity + the next-quarter
  forecast, and the active alerts. `openBrief(S)` / `closeBrief(S)` flip `S.calendar.mode` + the clock.
- **Auto-advance through quiet days.** At each day boundary `sim.surviveDay` opens the brief **unless**
  the player has armed `S.autoAdvance` **and** nothing demands attention — quiet days are skipped and the
  sim keeps running; the brief only *yanks you back* on an exception (and clears auto-advance until you
  re-arm). Early game you're in it often; once in a groove it collapses.
- **Gated on `S.briefEnabled`** (armed per session by `main.js`, like the seasonal regime) so headless
  runs stay operating-only and deterministic. New `step` guard: the sim no-ops outside `"operating"`
  (`"brief"` and `"planning"` freeze the loop — no double-stepping across a mode flip).
- **Builds are surfaced, not committed here** — the brief lists in-flight construction + a forecast nudge,
  but committing a new plant is still a quarter-review action.
- **`config.js`** — `CFG.v5_1.brief` (the interrupt thresholds: headroom %, cash floor, stability danger
  band). PLACEHOLDER — the most feel-dependent dial in v5.1, to be tuned against a prototype by play.
- **`sim.js`** seeds `autoAdvance`/`jobsDone`/`briefEnabled` and tallies rolling completions (`tickContractor`
  now returns its done count too); **`main.js`** handles the third mode in the frame loop and wires the
  brief's quick-add buttons to `queueMaint`/`specializeUnit` + the advance / step-a-day controls;
  **`render.js`** `renderBrief` draws the panel (Phase 7 restyles); **`index.html`** adds `#briefOverlay`.
- New `brief` suite (6 spec tasks, 18 assertions) + `tickContractor` return extended. **All 31 suites green.**

### Changed — v5.1 Phase 4: rolling maintenance (2026-10-30)

Fourth phase of the [v5.1 rebalance](docs/plan-v5.1/README.md). **Reverses v5's quarter-end-only
maintenance batch** — a plant failing on day 5 no longer limps to day 22 before it can be nursed.
Maintenance is now the *slow-but-steady* repair channel, run on a rolling calendar by the crew pool.

- **`src/live/maint.js` rewritten to a rolling model.** `queueMaint(S, unitId, axis, crewId)` books
  the cost, reserves a crew, marks the plant offline, and spawns a `MaintJob{daysLeft}` — queueable
  **any day**, no quarter gate. `tickMaint` (called each tick in `sim.step`) ages jobs and, on
  completion, restores the worked axis's live KPI toward `u.caps[axis]` (Phase 3's upgraded cap —
  maintenance fights decay, upgrades raise the ceiling), levels + frees the crew, and lifts the
  plant's downtime. The plant is **offline while in the shop** — the teeth, now measured in days.
- **The crew pool is the maintenance-only limiter.** `axisRestore(axis, crew)` = base × level
  mastery × on/off-trade modifier; `maintCost`/`maintDays` scale with how far the axis has decayed
  below its cap (a near-dead plant costs more and takes longer). Upgrades draw the separate
  contractor line (Phase 3), so the two run truly in parallel.
- **Retires the quarter-end batch** — `scheduleTask` / `resolveQuarterTasks` / `Task{quartersLeft}`
  and the quarter-close resolution in `sim.surviveDay` are gone. Auto-maintenance (`autoMaint` perk)
  moves from a once-a-quarter plan to a **daily top-up** that queues the neediest plant.
- **`config.js`** — new `CFG.v5_1.maint` (lead/severity days, cost floor + per-point charge, per-axis
  restore). The legacy `CFG.v5.maint` numeric fields stay only for the task catalogue's axis + label.
- **UI** — the Fleet panel's service note and the board-review maintenance copy are reworded to the
  rolling language (queue now, a crew works it over the next few days); cost/restore/ETA read from
  the rolling model.
- `maint` suite rewritten (8 tasks) + rebased `crews`/`progression` suites. **All 30 suites green.**

### Changed — v5.1 Phase 3: upgrade ladders & contractor queue (2026-10-30)

Third phase of the [v5.1 rebalance](docs/plan-v5.1/README.md). **Reworks Phase 7's progression**
into the *fast* capacity channel — sweat existing assets between builds — on a rolling line with
its own labor.

- **Four parallel 9-tier cash ladders per plant.** Each KPI axis (Output / Reliability /
  Efficiency / Flexibility) now has its own `u.tiers[axis]` (0..9) driving `u.caps[axis]` via
  `axisTierValue` (each tier +`tierStep` of base → tier 9 ≈ **2.6×** base). Cost steepens
  **geometrically** per tier (`upgradeCost`, Infinity at the cap), so you can't rush to max.
- **New `src/live/contractor.js` (pure).** `queueUpgrade` commits cash up front and spawns an
  `UpgradeJob` on a rolling calendar; `tickContractor` (called each tick in `sim.step`) ages jobs
  and, on completion, applies the tier + raises the cap. **Separate labor — never the maintenance
  crew pool (Phase 4)**, so upgrades and maintenance run truly in parallel. You pay to *wait* for
  a higher ceiling, not to *have* it; degradation still pulls the live KPI below the raised cap.
- **`progression.js` reworked** — adds the ladder (`axisTierValue`, `upgradeTierMax`,
  `upgradeCost(u, axis, rmods?)`, `canUpgrade`); **retires** Phase 7's instant `applyUpgrade` and
  the RP family-ceiling lane (`raiseCeiling`/`axisHardCeiling`/`S.capCeil`) — the 9-tier ladder
  defines the ceiling directly. The Modular Upgrades research discount is preserved (threaded via
  the optional `rmods` arg). **⚡ perks survive unchanged** on `S.zap` (their funding rehomes to
  the Phase 6 quarterly currency — called out here, not silently dropped).
- **`config.js`** — `CFG.v5_1.upgrade` (tier step, geometric cost, lead days); `freshTiers()`;
  `CFG.v5.upgrade.axisMax` lifted to 262 so the KPI effect curves read the full tier-9 cap.
- **UI** — the quarter-review Development Office now shows per-plant axis ladders (tier N/9 +
  next-tier cost + ETA) that queue onto the contractor line, plus the in-flight queue; the RP
  family-ceiling controls are gone. Phase 7 gives this the full per-plant drill-down.
- New `contractor` suite (6 tasks) + rebased `progression`/`sim`/`research` suites. **All 30
  suites green.**

### Added — v5.1 Phase 2: fail-state & grid-stability HP bar (2026-10-30)

Second phase of the [v5.1 rebalance](docs/plan-v5.1/README.md). **Reverses the single most
load-bearing v5 pillar — "no game-over."** This is a deliberate, grilled decision, not a
regression: a blackout now has both *teeth* and an *exit*.

- **New `src/live/stability.js` (pure).** A grid-stability reservoir (`S.stability.hp`, 0..max)
  **fills on a shortfall and drains on served hours**, asymmetric by cause via `classifyShortfall(S)`:
  a **capacity** shortfall (every recovery lever exhausted — all dispatchables committed, reserves
  released, bands wide, load-shed firing, DR active/ungated, still short) fills at the **full** rate;
  a **dispatch** shortfall (a usable move remained — an uncommitted plant, a held reserve, a throttled
  band, an idle charged battery, an un-fired DR, an un-shed tier) fills at the **half** rate. You are
  **never killed while a lever remains** (punish incompetence, don't ambush it). A served hour drains
  it slower than it fills, so a flickering grid still nets upward and eventually dies.
- **Verdict coupling** (`applyVerdictToStability`) — a strong quarter **heals** the bar; a weak one
  **damages** it and **accelerates** next quarter's fill (`fillMult`). KPIs now matter to survival.
- **Topping out ends the run** → `S.over` / `S.reason = "grid-collapse"`; `step()` freezes. A
  **roguelite restart** (`persist.restartRun`) banks this run's records into the profile, then hands
  back a fresh grid — the profile's banked ⚡, purchased skills, credit standing and records carry over.
- **`sim.js`** — `step` drives `tickStability` each tick off the post-shave served-vs-demanded MW and
  no-ops once `S.over`; the quarter rollover couples the verdict. `createGame` seeds
  `S.over/reason/runStartDay/stability`. **`config.js`** — `CFG.v5_1.stability` (placeholder balance
  numbers; the tests pin the *relationships*, not the values).
- **UI (minimal wire; Phase 7 styles it)** — a Grid-Stability readout in the top status strip
  (ramps colour as it climbs) and a **grid-collapse end screen** with the roguelite restart.
- New `stability` suite (6 tasks: full/half/drain rate ordering, top-out freeze, verdict both-ways,
  roguelite restart). The v5 "no `S.over`" assertions in `sim`/`verdict` are **formally retired**.
  **All 29 suites green.**

### Changed — v5.1 Phase 1: hybrid demand curve (2026-10-30)

First phase of the [v5.1 rebalance](docs/plan-v5.1/README.md). **Fixes the root cause of the
unrecoverable mid-quarter blackout** a week of play exposed: demand compounded +6%/day
(`peakGrowth` 1.06), doubling in ~12 days and outrunning the only capacity lever (quarter-end
builds).

- **New `src/live/demand.js` (pure).** Demand is now a **hybrid curve**: a *plannable* per-quarter
  baseline (`S.quarterPeak`) that **steps once at each quarter rollover** (`rollQuarterPeak`, +12%
  default) instead of compounding daily, plus a bounded **seasonal daily noise** so the live `S.peak`
  wobbles around the baseline (`stepDemand` — summer days swing hardest; `S.calm` flattens it for
  tests). `forecastPeak(S, n)` is the honest forward baseline the build panel plans against.
- **`sim.js`** — `surviveDay` no longer compounds `S.peak` daily; it refreshes the live peak off the
  baseline each day and steps the baseline at the rollover (reading the Phase 6 `growthStall`). The
  meta efficiency skill now carries into the quarterly step via `S.peakGrowthMult`. New seeded
  `S.rngDemand` stream (isolated from the economic RNG).
- **`construct.forecastDemand`** delegates to `demand.forecastPeak` so the build panel tracks the real
  cadence; the retired daily-compounding forecast is gone.
- New `demand` suite (5 tasks) incl. the **plannability regression guard** — a forecast operator is
  never surprised beyond the season's noise band (the old runaway curve can't recur). `sim`/`construct`
  suites rebased off daily growth; **all 28 suites green**. (Live-boot smoke was blocked by a stale
  browser ESM cache of `render.js` — a file unchanged this phase, verified correct on disk + fresh
  fetch; the node suite is the authoritative gate, and a hard-refresh clears the pane.)
- **Tuning deferred** (per the grill): the step size / noise amplitude are `CFG.v5_1.demand` knobs for a
  `tools/balance.mjs` pass — the tests pin *shape* (stepped, bounded, forecastable), not the numbers.

## [4.2.6] — 2026-10-26

- Proper generated plant names (`Harrowgate Nuclear`, `Blackmoor Coal`, …) via a
  `plantName(tech, n)` helper + per-tech place-name pools; retires the `Coal A` / `Solar
  Farm 2` placeholders.

## [4.2.5] — 2026-10-26

- How-to / FAQ reworked as an operator briefing.

## [4.2.4] — 2026-10-25

- Fleet is now a live monitor **table** rather than a bank of cards.

## [4.2.1 – 4.2.3] — 2026-10-25/26

- **Reliability & volatility model.** Wear rebuilt as a function of **load × age** (fair,
  strategic decay); trip hazard is **condition-gated** rather than a flat base rate, tuned
  via a lookup table; added an overhaul service tier.
- Rare trips + a **volatile net-load curve** as the real moment-to-moment challenge.
- Live readouts decoupled from frame rate (calm display cadence).
- See [`docs/PLAN-v4.2.1-reliability-and-volatility.md`](docs/PLAN-v4.2.1-reliability-and-volatility.md).

## [4.2.0] — 2026-10-25

- **"Control Room" UI/UX redesign** (CR-1…CR-4): relocated/redesigned command bar with a
  no-scroll skeleton, master status cluster + derived operator readouts, fleet as a live
  instrument bank, and a control-room strip-chart + annunciator event log.
- See [`docs/PLAN-v4.2-control-room.md`](docs/PLAN-v4.2-control-room.md).

## [4.1.0] — 2026-10-25

- Gameplay feel: reworked trips + softened cold-start economy.
- Contract ladder: hedging is now **additive**, with a managed book.
- Full landing page + a live screen that fills the viewport.

## [4.0.0] — 2026-10-25

- **"The Book" economy.** Revenue = contracted blocks at a locked price + residual served
  load at a live **spot price** driven by your own reserve margin (thin-but-covered pays;
  a shortfall never does).
- **Financing:** debt, credit, and bankruptcy — the economic teeth.
- **Earned forecast:** a fog model + forecast research branch + a chaotic-market mutator.
- Multi-track scoring + stats hub; meta economy unlocks, a finite-run win condition, a
  capacity market, and buyer offers.
- Data-driven spot tuning (via a balance harness) to tame windfalls.
- See [`docs/ROADMAP-v4.md`](docs/ROADMAP-v4.md) and [`docs/PLAN-v4.md`](docs/PLAN-v4.md).

## [3.0.0] — 2026-10-18

- **Research tech tree** (the v3 core): divert in-run cash into an R&D lab for Research
  Points, spent across transmission/efficiency, storage, demand-response, and generation
  branches (unlocking SMR, geothermal, and carbon capture).
- Per-run **mutator deck** (fuel spike, heat wave, cold snap, drought, renewable lull) and
  **meta-gating** of research branches via permanent ⚡ unlocks.
- Deferred: a "juice" pass (screen-shake, celebration/breakthrough feedback, sound).
- See [`docs/ROADMAP-v3.md`](docs/ROADMAP-v3.md) and [`docs/PLAN-v3.md`](docs/PLAN-v3.md).

## [2.0.0] — 2026-10-11

- **Real-time roguelike core**: the live 24-hour dispatch loop, wear/trips, Manage planning
  panel, milestones, scoring, and the cross-run meta-currency (⚡) with skills.
- See [`docs/ROADMAP-v2.md`](docs/ROADMAP-v2.md).

## [1.x] — original MVP

- The original single-file turn-based "build a fleet to 2050" simulator, preserved in
  [`archive/`](archive/) and as the reference build at [`batch/index.html`](batch/index.html).

[Unreleased]: https://github.com/theshawbit/energy-game/compare/main...HEAD
