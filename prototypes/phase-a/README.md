# Phase A prototype — Grid Operator: Live

A playable vertical slice to test the single most important v2 question: **does real-time grid balancing feel tense and fun?** Everything else (upgrades, meta-skills, trading) is deliberately left out so the core loop can be judged on its own.

## Run it

From the repo root, serve over HTTP and open the prototype:

```bash
python -m http.server 8000
# then open http://localhost:8000/prototypes/phase-a/
```

## What it implements

- **Live 24-hour clock** (~48s per day). Demand follows the daily curve and climbs each day you survive.
- **Demand vs. Capacity in real time** with a color-coded **reserve-margin gauge** and a scrolling demand/capacity chart that shades the deficit red.
- **A fleet you dispatch live:** always-on baseload (nuclear, coal), variable renewables (solar/wind track the clock and weather), three gas **peakers** held in reserve with a spin-up delay, and a **battery** for instant emergency power.
- **Deep outages:** plants randomly trip offline — more often as the days climb — yanking capacity mid-peak so you scramble to cover.
- **Brownout → blackout fail path:** dip below demand and the grid browns out (red vignette, screen shake, cash + satisfaction penalty) with a short window to recover. Let the shortfall run deep or long and it's a **blackout** — instant run over, with a scorecard.

## Controls

- Click a reserve plant, or press <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> to toggle peakers and <kbd>B</kbd> to fire the battery.
- <kbd>Space</kbd> or the Pause button to pause.

## What to feel for

Is the evening peak genuinely stressful? Does pre-arming reserves vs. reacting to outages create a real decision? Is the brownout window "stressful but fair," or too brutal / too forgiving? Those answers drive the next tuning pass.

## Tuning

All the knobs live in the `CFG` object at the top of `live.js` (day length, demand growth, strain rates, costs, blackout threshold). They're meant to be played with.

> Prototype only — not wired into the main module build. Good parts fold back into `src/` once the feel is dialed in.
