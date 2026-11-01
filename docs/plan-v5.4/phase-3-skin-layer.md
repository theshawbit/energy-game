# Phase 3 — The skin layer

> One dynamic lens over everything. Promotes machinery that already exists (`body[data-era]` recolour, the
> stability vignette) into a first-class global layer, and scaffolds the three material tokens. Lands over
> the *current* regions so the deck rebuild (Phase 4) has a finish to land into.

## Why this before the deck

The skin is defined independent of region materials — it is a global finish applied over whatever is on
screen. So it can land over today's UI, unify it immediately, and persist unchanged through the region
rebuild. It is also the single highest-leverage, cheapest surface in the milestone: one lens, tuned once,
does more to make the screen read as one device than fussing over any individual region. (See README open
question O2 — the risk is double-tuning over regions about to be replaced; the bet is the skin's
independence from region materials makes that a non-issue.)

## Owns

- A new skin layer (one overlay element / `::after` stack over the app root) carrying: subtle grain/matte
  grade, a restrained glow, and the two dynamic drivers below.
- `CFG.v5_4.skin` — cosmetic params (grain opacity, glow, bleed ramp). No economy, no gameplay.
- The three **material tokens** scaffolded as CSS custom properties (`--mat-frame-*`, `--mat-deck-*`,
  `--mat-book-*`), set to the Phase-2-decided look. Regions adopt them in Phase 4/5; defining them here
  keeps the system in one place.

## Approach

1. **Promote era.** `body[data-era]` (v5 Phase 9 — Rust → Transition → New Veridia) already recolours; route
   it through the skin layer as the slow, narrative driver (the device visibly ages across eras). Semantics
   unchanged — `world.js` still selects the era.
2. **Promote grid-state.** The stability vignette (render.js:210-212, driven by `stabFrac`) becomes the
   fast, status driver — strain bleeds across the *whole* screen, calm is steady. Keep the existing
   `stabFrac` source; the skin just owns the presentation. **It must render over the Book too** (Phase 5),
   not just the deck: because the Book keeps the clock running and tolerates drift, the bleed is the only
   ambient cue that the reservoir is filling while the player reads — and it is what lets the two materials
   read as *one device* rather than a second app. A Book without the strain tint breaks the whole
   one-lens-over-everything claim.
3. **Discipline:** the skin does exactly two jobs — **era** (slow) and **grid-state** (fast). It is never
   decoration for its own sake. Everything beyond those two drivers is static finish.

## Done when

- One skin layer sits over all current regions; the screen reads as a single device without any region
  having changed.
- Era recolour and stability bleed both run through the skin, visibly, with no change to their triggers.
- The three material tokens exist and carry the Phase-2 look (not yet consumed by regions).
- Suites green; no gameplay or economy affected (cosmetic-only, like v5 Phase 9).

## Risks & open questions

- **O2 (README):** double-tuning. If the skin and the deck end up fighting during Phase 4, the fallback is
  to merge this into the deck phase.
- `prefers-reduced-motion` must gate any animated grain/glow; grid-state bleed intensity must stay within
  the current vignette's accessibility bounds (it is a status signal, not a jump-scare).
