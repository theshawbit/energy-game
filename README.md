# Grid Operator

A single-file browser game about **energy economics**. You run a city's power grid year by year — build and retire power plants, then watch them dispatch into a real wholesale electricity market. Keep the lights on, stay solvent, and decarbonize before the carbon price eats your margins.

No build step, no dependencies. Because the code is split into ES modules, serve the folder over HTTP rather than opening the file directly:

```bash
python -m http.server 8000   # then open http://localhost:8000
```

(Opening `index.html` as a `file://` URL won't work — browsers block module loading over `file://`.)

## How to play

1. **Each year is simulated over a representative 24-hour day** and scaled to 365 days.
2. **Build capacity** from the fleet panel. Each technology has its own capital cost, fixed operating cost, marginal (fuel) cost, and CO₂ emissions.
3. **Advance the year** to bank the result. Demand grows ~2.5%/year, weather varies, random events hit (heat waves, fuel-price spikes, tech-cost breakthroughs), and from 2029 the carbon price escalates.
4. **Win** by running the grid to 2050 solvent — graded A–E on profit, reliability, and emissions.
5. **Lose** if cash falls below −$150M or a year's reliability drops under 85%.

## The economics

The simulation is a genuine **merit-order electricity market**, not a cosmetic score:

- **Dispatch order (cheapest first):** free wind & solar → stored battery energy → thermal plants ranked by marginal cost.
- **Price** each hour is the marginal cost of the *last* plant dispatched (uniform-price auction). You earn that clearing price on every MWh you serve, so cheap plants collect "inframarginal rent."
- **Carbon price** adds `$/t × tCO₂/MWh` to every fossil plant's running cost. Enough of it re-sorts the merit order — flipping coal behind gas, then behind clean energy (the real "gas-for-coal switching" effect, which kicks in around $34/t in this model).
- **Batteries** charge from midday renewable surplus and discharge into the evening demand peak.
- **Blackouts** (unserved load) are penalized at the value of lost load and never earn revenue — you can't profit by letting the lights go out.

### Units

| Quantity | Unit |
|---|---|
| Power / capacity | MW |
| Energy | MWh (= MW × h) |
| Price / marginal cost | $/MWh |
| Emissions factor | tCO₂/MWh |

The dispatch engine was verified independently before the UI was built: energy is conserved (dispatched supply never exceeds demand in any hour), and the merit order and carbon-switching behavior match expected results.

## Technologies

| Tech | Marginal cost | CO₂ | Role |
|---|---|---|---|
| Solar PV | $0/MWh | 0 | Daytime, free fuel, variable |
| Wind | $0/MWh | 0 | Free fuel, variable |
| Battery (4h) | ~$1/MWh | 0 | Shifts energy from surplus to peak |
| Nuclear | $10/MWh | 0 | Baseload, 92% availability |
| Coal | $35/MWh | 0.95 tCO₂/MWh | Cheap but dirty |
| Gas CCGT | $55/MWh | 0.37 tCO₂/MWh | Flexible mid-merit |
| Gas Peaker | $120/MWh | 0.55 tCO₂/MWh | Expensive last resort |

Capital costs, fuel costs, and emission factors are order-of-magnitude industry values tuned for balanced gameplay, not a forecast of any specific market.

## Project layout

```
index.html              Entry point (markup + font/style links + module bootstrap)
styles/main.css         All styling and the color/type design tokens
src/
  constants.js          Static config & data tables (tech economics, load shapes)
  engine.js             Verified merit-order dispatch model — a pure function
  game.js               Game state & rules (build, sell, advance, events, scoring)
  render.js             View layer — paints the DOM & canvas chart from state
  main.js               Glue: owns the game object, wires UI actions to rules
tests/engine.test.mjs   Engine unit tests (energy balance, pricing, carbon switching)
docs/ROADMAP-v2.md      v2 design & roadmap
archive/                The original single-file MVP, preserved
```

The layers don't import each other circularly: `render.js` never mutates state and `game.js` never touches the DOM — `main.js` is the only module that knows about both. The economic engine is isolated as a pure function so it can be tested without a browser.

```bash
npm test     # runs the engine tests (Node, no dependencies)
```

## Roadmap

See [docs/ROADMAP-v2.md](docs/ROADMAP-v2.md) — v2 turns this into a real-time grid-balancing roguelike.

## Modeling notes

Simplifications in the current model: one representative day per year (no seasonality or sub-hourly ramping), heuristic battery dispatch rather than a full optimizer, and a single demand profile. Natural next steps are seasonal simulation, transmission constraints, and the real-time refactor described in the roadmap.
