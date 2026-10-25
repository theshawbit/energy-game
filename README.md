# Grid Operator

A browser game about **energy economics**. The main game (`index.html`) is **Grid Operator — Live**: you keep a growing city powered in real time, dispatching reserves and riding the evening peak while a live wholesale market prices your plants through merit-order dispatch. Dip below demand and the grid browns out; let it run deep and it's a blackout. Survive each day and demand climbs, a rising carbon price makes dirty plants cost more, and each run throws a different set of conditions at you. Between runs you grow permanently stronger.

The original turn-based sim (build a fleet year by year to 2050) is preserved as a reference build at [`batch/index.html`](batch/index.html).

No build step, no dependencies. Because the code is split into ES modules, serve the folder over HTTP rather than opening the file directly:

```bash
python3 -m http.server 8000   # or any static file server; then open http://localhost:8000
```

(Opening `index.html` as a `file://` URL won't work — browsers block module loading over `file://`.)

## How to play (Live)

1. **From the home screen, press Start run** (Skills and a How-to/FAQ live here too; you return here after each run). A live 24-hour clock runs (~48 real seconds per day); demand follows the daily curve toward the evening peak.
2. **Read the run's conditions.** A **⚠ This run** banner shows the **mutators** rolled for this run — a fuel-price spike, heat wave, cold snap, drought, or renewable lull — each bending demand, fuel cost, or renewable output and pointing you toward a different strategy.
3. **Keep capacity ≥ demand.** Baseload (nuclear, coal) and renewables (solar, wind — variable with time of day and weather) run automatically. Gas **peakers** and your **batteries** are yours to dispatch:
   - Click a reserve plant, or press <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> for peakers and <kbd>B</kbd> for the battery. <kbd>Space</kbd> pauses.
   - Peakers take ~1.6 h to spin up, so pre-arm them before the peak.
4. **Survive.** Plants **wear down** as they run and **trip offline** — worn plants and later days both raise the odds — yanking capacity mid-peak. A small shortfall **browns out** (penalties + a short recovery window); a large or sustained one is a **blackout** — run over, with a scorecard.
5. **Invest & maintain.** Press **Manage** to open the planning panel — this **pauses the clock**. Spend earned cash to **build** new capacity (including extra **batteries**), **upgrade** plants through Mk tiers (more capacity, fewer trips, lower standby cost), **service** a worn plant (pay cash and lose it to downtime, returning it to 100%), or **sell/decommission** a plant for salvage to reshape your fleet mix.
6. **Research (the v3 core).** Also in the Manage panel: divert in-run cash into an **R&D lab** to earn **Research Points (RP)** — a live trade-off between money now and tech later (funding it into the teeth of the peak is how you brown out). Spend RP on a **tech tree** across four branches:
   - **Transmission / efficiency** — amplify your Mk upgrades, cut plant wear, lower standby cost, faster peaker spin-up.
   - **Storage** — more battery discharge power, deeper storage, faster recharge.
   - **Demand response** — shave the peak itself (the first *demand-side* lever).
   - **Generation** — unlock building **SMR**, **geothermal**, and **carbon capture (Coal+CCS / Gas+CCS)** to beat the carbon price.

   RP is scarce — a run typically researches ~5 of 12 nodes, so you pick a *path* that suits the mutators you drew. Research resets each run.
7. Each day survived raises the demand peak, and from day 3 a **carbon price** escalates, lifting fossil plants' running cost and re-sorting the merit order.
8. **Chase milestones, then come back stronger.** Hitting peak/cash **milestones** and surviving longer raise your end-of-run **score**, which converts to **meta-currency (⚡)**. On the home screen's **Skills** screen, spend it across two tabs:
   - **Skills** — permanent passives (more starting cash, cheaper maintenance, faster peaker starts, slower demand growth, bigger battery, and a **Service Manager** that auto-services worn plants).
   - **Research Unlocks** — permanently open the storage, demand, and advanced-generation research branches, so the in-run tree grows the more you play.

   Currency, skills, unlocks, and your best run are saved in your browser, so each run starts a little stronger.

## The economics

Both games clear the market through the same verified **merit-order dispatch engine**:

- **Dispatch order (cheapest first):** free wind & solar → stored battery energy → thermal plants ranked by marginal cost (nuclear, SMR, geothermal, coal, gas, CCS variants, peakers).
- **Price** each hour is the marginal cost of the *last* plant dispatched (uniform-price auction).
- **Revenue** in the live game (v4 "The Book") is **contracted blocks at a locked price + residual served load at a live spot price**. Spot rises when your grid is tight and crashes when you're flush, driven by your *own* reserve margin — so thin-but-covered is lucrative while a shortfall is never a windfall (both paths read *served* load only; unserved earns nothing). Hedge the swings with term contracts at the Desk. The wholesale clearing price shown up top is a signal of what your plants cost to run right now. (The batch reference game earns the wholesale clearing price directly.)
- **Carbon price** adds `$/t × tCO₂/MWh` to every fossil plant's running cost. Enough of it re-sorts the merit order — flipping coal behind gas, then behind clean energy. **Carbon capture** plants have a high base cost but very low emissions, so they overtake unabated plants once carbon climbs.
- **Blackouts** (unserved load) are penalized and never earn revenue — you can't profit by letting the lights go out.

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
  engine.js             Verified merit-order dispatch — dispatchHour() (pure) + simulateDay()
  live/
    config.js           Live tuning (CFG), build catalogue, upgrade tiers & the starting fleet
    sim.js              Live state machine & per-tick step() — no DOM
    actions.js          Player actions (dispatch, build, upgrade, service, R&D, research) — no DOM
    research.js         In-run research tree: nodes, gating, and the per-run modifiers (rmods)
    mutators.js         Per-run mutator deck, weighted roll, and the per-run modifiers (mmods)
    meta.js             Roguelike meta: milestones, scoring, skills & research-branch unlocks
    persist.js          Cross-run profile in localStorage (currency, skills, unlocks, best) + migration
    render.js           Live view — paints DOM/canvas from state
    main.js             Live glue: owns state, runs the loop, wires input
  game.js               Batch game state & rules (build, sell, advance, events, scoring)
  render.js             Batch view layer
  main.js               Batch glue
batch/index.html        Turn-based reference build (loads the shared engine + src/*.js)
tests/
  engine.test.mjs       Engine: dispatchHour, energy balance, carbon switching, v3 techs
  sim.test.mjs          Live sim: state machine, clock, carbon, research/mutator/storage wiring
  research.test.mjs     Research tree: node effects, RP gating, meta gating, prereqs
  mutators.test.mjs     Mutators: deck composition, weighted roll, day-1 fairness invariant
  persist.test.mjs      Profile persistence & v1→v2 migration
tools/
  balance.mjs           Headless balance harness — plays many runs; reports survival,
                        the research economy, and per-mutator fairness
docs/
  ROADMAP-v3.md         v3 design & roadmap (research tree, mutators, meta-gating)
  PLAN-v3.md            v3 implementation plan (phases A–F, PR map)
  ROADMAP-v2.md         v2 design & roadmap (the real-time roguelike core)
archive/                The original single-file MVP, preserved
```

Both games share one tested dispatch primitive: `dispatchHour()` in `src/engine.js` clears a single hour of the merit-order market. The live loop calls it each tick; the batch `simulateDay()` sums it over a representative day. The layers don't import circularly — `render.js` never mutates state, `sim.js`/`game.js` never touch the DOM, and `main.js` is the only module that knows about both. The pure modules (`research.js`, `mutators.js`, `meta.js`) hold no state and touch no DOM — they turn owned research / rolled mutators / meta progress into the modifier objects the sim reads.

```bash
npm test     # runs all suites: engine, live-sim, research, mutators, persist (Node, no dependencies)
```

## Roadmap

**v3 (the research tech tree) is shipped.** See [docs/ROADMAP-v3.md](docs/ROADMAP-v3.md) for the design and [docs/PLAN-v3.md](docs/PLAN-v3.md) for the phase-by-phase build. The one deferred item is a **juice pass** (screen-shake, celebration/breakthrough feedback, sound). The v2 real-time roguelike core that v3 builds on is documented in [docs/ROADMAP-v2.md](docs/ROADMAP-v2.md).
