# Grid Operator

A browser game about **energy economics**. The main game (`index.html`) is **Grid Operator — Live**: you keep a growing city powered in real time, dispatching reserves and riding the evening peak while a live wholesale market pays you the merit-order clearing price. Dip below demand and the grid browns out; let it run deep and it's a blackout. Survive each day and demand climbs — and a rising carbon price makes dirty plants cost more.

The original turn-based sim (build a fleet year by year to 2050) is preserved as a reference build at [`batch/index.html`](batch/index.html).

No build step, no dependencies. Because the code is split into ES modules, serve the folder over HTTP rather than opening the file directly:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

(Opening `index.html` as a `file://` URL won't work — browsers block module loading over `file://`.)

## How to play (Live)

1. **From the home screen, press Start run** (Skills and a How-to/FAQ live here too; you return here after each run). A live 24-hour clock runs (~48 real seconds per day); demand follows the daily curve toward the evening peak.
2. **Keep capacity ≥ demand.** Baseload (nuclear, coal) and renewables (solar, wind — variable with time of day and weather) run automatically. Three gas **peakers** and a **battery** are yours to dispatch:
   - Click a reserve plant, or press <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> for peakers and <kbd>B</kbd> for the battery. <kbd>Space</kbd> pauses.
   - Peakers take ~1.6 h to spin up, so pre-arm them before the peak.
3. **Survive.** Plants **wear down** as they run and **trip offline** — worn plants and later days both raise the odds — yanking capacity mid-peak. A small shortfall **browns out** (penalties + a short recovery window); a large or sustained one is a **blackout** — run over, with a scorecard.
4. **Invest & maintain.** Press **Manage** to open the planning panel — this **pauses the clock**. Spend earned cash to **build** new capacity, **upgrade** plants through Mk tiers (more capacity, fewer trips, lower standby cost), **service** a worn plant (pay cash and lose it to downtime, returning it to 100%), or **sell/decommission** a plant for salvage to transition your fleet mix. Choose when to pull a plant for service vs. gamble it holds through the peak. Resume when ready.
5. Each day survived raises the demand peak, and from day 3 a **carbon price** escalates, lifting fossil plants' running cost and re-sorting the merit order.
6. **Chase milestones, then come back stronger.** Hitting peak/cash **milestones** and surviving longer raise your end-of-run **score**, which converts to **meta-currency**. Spend it in the **Skills** tree on permanent passives (more starting cash, cheaper maintenance, faster peaker starts, slower demand growth, bigger battery, and a **Service Manager** that auto-services worn plants). Currency, skills, and your best run are saved in your browser, so each run starts a little stronger.

## The economics

Both games clear the market through the same verified **merit-order dispatch engine**:

- **Dispatch order (cheapest first):** free wind & solar → stored battery energy → thermal plants ranked by marginal cost.
- **Price** each hour is the marginal cost of the *last* plant dispatched (uniform-price auction). You earn that clearing price on every MWh you serve, so cheap plants collect "inframarginal rent."
- **Carbon price** adds `$/t × tCO₂/MWh` to every fossil plant's running cost. Enough of it re-sorts the merit order — flipping coal behind gas, then behind clean energy (real "gas-for-coal switching," around $34/t in this model).
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
styles/main.css         Batch game styling
src/
  constants.js          Shared static config & data tables (tech economics, load shapes)
  engine.js             Verified merit-order dispatch — dispatchHour() (pure) + simulateDay()
  live/
    config.js           Live tuning (CFG) & the starting fleet
    sim.js              Live state machine & per-tick step() — no DOM
    actions.js          Player actions (dispatch toggles) — no DOM
    render.js           Live view — paints DOM/canvas from state
    main.js             Live glue: owns state, runs the loop, wires input
  game.js               Batch game state & rules (build, sell, advance, events, scoring)
  render.js             Batch view layer
  main.js               Batch glue
batch/index.html        Turn-based reference build (loads the shared engine + src/*.js)
tests/
  engine.test.mjs       Engine unit tests (dispatchHour, energy balance, carbon switching)
  sim.test.mjs          Live sim unit tests (state machine, clock, carbon escalation)
tools/
  balance.mjs           Headless balance harness — plays the sim many times, reports the survival curve
docs/ROADMAP-v2.md      v2 design & roadmap
archive/                The original single-file MVP, preserved
```

Both games share one tested dispatch primitive: `dispatchHour()` in `src/engine.js` clears a single hour of the merit-order market. The live loop calls it each tick; the batch `simulateDay()` sums it over a representative day. The layers don't import circularly — `render.js` never mutates state, `sim.js`/`game.js` never touch the DOM, and `main.js` is the only module that knows about both.

```bash
npm test     # runs the engine + live-sim tests (Node, no dependencies)
```

## Roadmap

See [docs/ROADMAP-v2.md](docs/ROADMAP-v2.md) — the real-time roguelike direction, with in-run upgrades, deep maintenance, and roguelike meta-progression layering on top of this core.
