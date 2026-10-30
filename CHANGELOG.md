# Changelog

All notable changes to Grid Operator are recorded here. Versions follow the game's own
`vMAJOR.MINOR.PATCH` line (the same tags used in the git history and the `docs/` roadmaps).
This project has **no CI**; every merge to `main` redeploys the live build via GitHub Pages.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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
