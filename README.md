# Grid Operator

### ▶ [Play it live](https://theshawbit.github.io/energy-game/)

A browser game about **energy economics**. The main game (`index.html`) is **Grid Operator — Live**: you keep a growing city powered in real time, dispatching reserves and riding the evening peak while a live wholesale market prices your plants through merit-order dispatch. Dip below demand and the grid browns out; let it run deep and it's a blackout. Survive each day and demand climbs, a rising carbon price makes dirty plants cost more, and each run throws a different set of conditions at you. Between runs you grow permanently stronger.

The original turn-based sim (build a fleet year by year to 2050) is preserved as a reference build at [`batch/index.html`](batch/index.html).

No build step, no dependencies. Because the code is split into ES modules, serve the folder over HTTP rather than opening the file directly:

```bash
python3 -m http.server 8000   # or any static file server; then open http://localhost:8000
```

(Opening `index.html` as a `file://` URL won't work — browsers block module loading over `file://`.)

### Hosting

The live build is served by **GitHub Pages** straight from `main` at the repo root
(https://theshawbit.github.io/energy-game/) — every merge to `main` redeploys
automatically, with no build step. A `.nojekyll` marker keeps Pages from running
the content through Jekyll. All asset and module paths are **relative**, so the game
runs correctly from the `/energy-game/` subpath (or any other host).

### Engineering principles

Two rules were revised during the **v5.3 "Integrity"** milestone; they explain why the
Action exists, why deploy is still manual, and why `engine.js` grew a field:

- **"No CI" now means no CI *for deploy*, not for tests.** A GitHub Action runs the full
  `npm test` suite on every push and PR (`.github/workflows/test.yml`); economy incentives
  are asserted there too (`tools/balance.mjs`), so a regression fails the build. **Deploy
  stays manual** — Pages serves `main` directly with no build step, so there is nothing for
  a deploy pipeline to gate. Bumping the version stamp is part of that manual release ritual.
- **The *clearing logic* is sacred — not the `engine.js` file.** The merit-order dispatch math
  is never altered, but **additive** engine outputs are allowed: v5.3 added `priceServed` (the
  pre-cap marginal cost of the last served unit) so revenue is a continuous function of coverage.
  This retired the blanket "`engine.js` is untouchable" rule without weakening the invariant it
  was protecting.

## How to play (Live)

You hold a **posting** as a city's grid operator and run it quarter after quarter. Each day is a live 24-hour clock (~100 real seconds); demand follows the daily curve toward the evening peak and **steps up each quarter** as the city grows.

1. **From the home screen, press Start your shift** (a How-to/FAQ and your permanent Skills live here too; you return here when a posting ends). 
2. **Keep capacity ≥ demand.** Baseload (nuclear, coal) and renewables (solar, wind — variable with time of day and weather) run automatically. Gas **peakers** and the **battery** are your reserves — commit them as the peak approaches:
   - Click a fleet row, or press <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> for peakers and <kbd>B</kbd> for the battery. <kbd>Space</kbd> pauses.
   - Peakers take time to spin up, so pre-commit them before the peak.
3. **Watch the one meter that can kill you.** A sustained shortfall fills the **grid-stability reserve** (top-right); the deeper the shortfall, the faster it fills, and served hours drain it back. Let it top out and the grid **collapses** — the posting ends and you take a new one, keeping what you banked. A shortfall you still have a lever for (an uncommitted plant, a charged battery, load-shed, demand response) fills it slower than one where every lever is spent, so you're never killed while a move remains.
4. **Maintain & upgrade — rolling, not batched.** Press **Manage** to open the planning panel (this **pauses the clock**). Queue **rolling maintenance** (a crew works a plant over a few days, restoring its KPIs toward their caps), **upgrade** a plant along its four KPI axes — reliability · efficiency · output · flexibility — through its **contractor ladders**, commit **lead-time builds** of new capacity, or **decommission** a plant for salvage. A fleet row's **⚙** opens that plant's ladders.
5. **Set your queues each day, answer to the board each quarter.** Every day opens a quick **brief** (skippable) to adjust maintenance and reserves. Every quarter closes with a **board review** that grades your **profit** and the city's **satisfaction** and mints **⚡**.
6. **Trade conditions.** Each season deals a weighted deck of **events** — a fuel-price spike, heat wave, cold snap, drought, renewable lull — bending demand, fuel cost, or renewable output. From day 3 a **carbon price** escalates, lifting fossil plants' running cost and re-sorting the merit order.
7. **Come back stronger.** Spend banked **⚡** on permanent **Skills** at the home screen. Your ⚡, skills, and best records are saved in your browser and carry to the next posting, so each one starts a little stronger.

## The economics

Both games clear the market through the same verified **merit-order dispatch engine**:

- **Dispatch order (cheapest first):** free wind & solar → stored battery energy → thermal plants ranked by marginal cost (nuclear, SMR, geothermal, coal, gas, CCS variants, peakers).
- **Price** each hour is the marginal cost of the *last* plant dispatched (uniform-price auction). The live game also exposes an additive **`priceServed`** — the pre-cap marginal cost of the last *served* unit — so revenue is a continuous function of how much of the city you cover.
- **Revenue** in the live game is **contracted blocks at a locked price + residual served load at a live spot price**. Spot rises when your grid is tight and crashes when you're flush, driven by your *own* reserve margin — so thin-but-covered is lucrative while a shortfall is never a windfall (both paths read *served* load only; unserved earns nothing). Hedge the swings with term contracts at the Desk. The wholesale clearing price shown up top is a signal of what your plants cost to run right now. (The batch reference game earns the wholesale clearing price directly.)
- **Carbon price** adds `$/t × tCO₂/MWh` to every fossil plant's running cost. Enough of it re-sorts the merit order — flipping coal behind gas, then behind clean energy. **Carbon capture** plants have a high base cost but very low emissions, so they overtake unabated plants once carbon climbs.
- **Blackouts** (unserved load) earn nothing, and load you leave dark with no lever to cover it is **penalised** on top (a value-of-lost-load charge) — you can't profit by letting the lights go out.

### Units

| Quantity | Unit |
|---|---|
| Power / capacity | MW |
| Energy | MWh (= MW × h) |
| Price / marginal cost | $/MWh |
| Emissions factor | tCO₂/MWh |

## Project layout

```
index.html              Live game entry (markup + style/module bootstrap)
styles/live.css         Live game styling + design tokens
styles/main.css         Batch game styling + tech color tokens
src/
  constants.js          Shared static config & data tables (tech economics, load shapes)
  engine.js             Verified merit-order dispatch — dispatchHour() (pure, + additive priceServed) + simulateDay()
  live/                 The live game (persistent ops sim). Pure modules hold no state and touch no DOM.
    — core state, loop & view —
    sim.js              Live state machine & per-tick step() / surviveDay() — no DOM
    main.js             Live glue: owns state, runs the RAF loop, wires input, drives screen nav
    render.js           Live view — paints DOM/canvas from state; never mutates
    config.js           Live tuning (CFG.v5* namespaces), build catalogue, upgrade ladders & the starting-fleet factory
    actions.js          Player actions (commit dial, specialize, decommission, R&D, research, contracts) — no DOM
    version.js          Single-source build-version constant for the UI stamp (bumped on the release checklist)
    — time & calendar —
    calendar.js         Year ▸ Quarter ▸ Day arithmetic (pure)
    clock.js            Variable-speed time scaling + auto-pace / auto-pause (pure)
    — economy, market & the quarterly verdict —
    demand.js           Hybrid demand curve: quarterly step + daily noise (pure)
    dispatch.js         The one surviving dispatch dial — commit (v5.3 Phase 1 gutted the throttle dials)
    market.js           Spot wholesale price driven by reserve margin (pure)
    finance.js          Term contracts, credit/debt, bankruptcy — "The Book" (pure)
    forecast.js         Spot-forecast accuracy/fog model: earned, sharpened, blurred by volatility (pure)
    capacity.js         Capacity market: firm-capacity obligation, availability pay, breach fines (pure)
    offers.js           Special offers ("Rolodex"): named buyers bring standout contracts (pure)
    verdict.js          The overlord's quarterly board review — settleQuarter grades floor + swing (pure)
    scorecard.js        Quarterly KPI → ⚡ faucet: 7 metrics / 2 channels minted to the profile (pure)
    — fleet health & growth —
    kpi.js              The four axis-aligned health metrics + style-driven degradation (pure)
    maint.js            Rolling, cash-funded KPI-repair queue worked by the crew pool
    crews.js            The levelling maintenance crew pool (hire / promote / assign)
    contractor.js       Rolling UPGRADE queue — the fast capacity channel, on its own labor
    construct.js        New plants as multi-quarter lead-time capital projects
    progression.js      Growth lanes: per-axis specialization caps + ⚡ perks (pure)
    stability.js        The grid-stability reservoir and the fail-state it drives (pure)
    — crisis, events & the daily beat —
    crisis.js           Mid-quarter escape hatch: load-shed tiers + demand response
    events.js           The seasonal event regime (weighted deck → mmods), grown from mutators.js
    brief.js            The blocking-but-skippable daily planning beat feeding the rolling queues
    — research, meta, persistence & flavour —
    research.js         In-run tech tree: nodes, gating, the per-run modifiers (rmods) (pure)
    mutators.js         The mutator-modifier machinery (mmods) now driven by events.js regimes (pure)
    meta.js             Roguelike meta: milestones, scoring, skills & research-branch unlocks (pure)
    persist.js          Cross-run profile in localStorage (currency, skills, unlocks, records) + migration
    rng.js              Seeded, dependency-free RNG — replayable economic randomness (pure)
    world.js            Identity arc, C.A.S.S. dispatch-AI barks & the overlord's voice — pure copy from CFG (pure)
    fleetsort.js        Pure comparators for the fleet lanes (urgency, output, etc.)
    readouts.js         Derived operator readouts for the Control Room status cluster (pure)
  game.js               Batch game state & rules (build, sell, advance, events, scoring)
  render.js             Batch view layer
  main.js               Batch glue
batch/index.html        Turn-based reference build (loads the shared engine + src/*.js)
tests/                  Node test suites (no dependencies), auto-discovered by the runner — one per
                        module + the economy-integrity & harness suites. Run with `npm test`;
                        a GitHub Action runs the same suites on every push & PR (see DEPLOY.md).
tools/
  run-tests.mjs         Test runner — spawns each tests/*.test.mjs in its own process
  balance.mjs           Headless balance harness — plays canned + hill-climbed strategies and
                        ASSERTS the economic incentives (serve-to-win, conservation, scarce mint)
docs/
  README.md             Documentation map — every doc with its shipped/planned/superseded status
  ROADMAP-v2…v5.md      Design roadmaps per version
  PLAN-*.md / plan-v5*/ Per-version build plans (v3, v4, v4.2, v4.2.1, and the v5 / v5.1 / v5.2 / v5.3 phase specs)
  STORYLINE-v5-*.md     New Veridia / C.A.S.S. narrative bibles (later flavour layer)
  DEPLOY.md             GitHub Pages hosting notes + the release checklist
CHANGELOG.md            Running version history
archive/                The original single-file MVP, preserved
```

Both games share one tested dispatch primitive: `dispatchHour()` in `src/engine.js` clears a single hour of the merit-order market. The live loop calls it each tick; the batch `simulateDay()` sums it over a representative day. The layers don't import circularly — `render.js` never mutates state, `sim.js`/`game.js` never touch the DOM, and `main.js` is the only module that knows about both. The pure modules (`research.js`, `mutators.js`, `meta.js`) hold no state and touch no DOM — they turn owned research / rolled mutators / meta progress into the modifier objects the sim reads.

```bash
npm test     # runs every tests/*.test.mjs suite (engine, sim, economy-integrity, harness, … — Node, no dependencies)
```

## Roadmap

In version order (all shipped):

- **v2** — the real-time roguelike core (live dispatch loop, wear/trips, meta-currency).
- **v3** — the research tech tree, mutator deck, and meta-gating. *(Deferred: a "juice" pass — screen-shake, breakthrough feedback, sound.)*
- **v4 "The Book"** — contracts + a reserve-margin-driven spot market, financing & bankruptcy, an earned forecast, multi-track scoring, capacity market & buyer offers.
- **v4.1 / v4.2** — gameplay-feel and economy tuning; the **"Control Room"** UI redesign; a reworked reliability/volatility model; the fleet table; and proper plant names.
- **v5 "The Persistent Grid"** — the genre pivot from survival roguelike to a persistent management / ops sim: a Year ▸ Quarter ▸ Day calendar, dial-able dispatch, four KPI axes, rolling maintenance, lead-time construction, a hybrid floor+swing economy graded by a quarterly board verdict, and the New Veridia / C.A.S.S. narrative layer. See [docs/ROADMAP-v5.md](docs/ROADMAP-v5.md).
- **v5.1** — rebalance & rework: the grid-stability fail-state returns, a hybrid demand curve, 4×9 per-plant upgrade ladders via a rolling contractor queue, the daily brief, and the quarterly KPI → ⚡ scorecard.
- **v5.2** — playability: the intraday-peak fix, a shorter day with auto-pacing, and the strain-bar relabel.
- **v5.3 "Integrity"** — an economy-correctness milestone under a feature freeze: a continuous `priceServed` clearing price (killing the go-dark exploit), honest PnL reconciliation, a CI-gated test + balance-assert suite, deletion of inert/lying mechanics down to one trouble-meter, and this version stamp. *(Deferred: the balance-number lock and the in-game copy pass — the final tuning gate.)*

Full version history is in [CHANGELOG.md](CHANGELOG.md); a status-tagged map of every design/plan/narrative doc is in [docs/README.md](docs/README.md).
