# Phase 4 — The live deck

> Rebuild the operating screen as instruments + tiles under the `deck` material. The big visual slice.
> Opens with the Phase-2-decided look already settled. The fleet stops being a spreadsheet.

## Owns

- `src/live/render.js` — the operating-screen view: the chart, the fleet, the flow pulse, the KPI chips,
  the stability strip.
- The fleet idiom: **retires** the v4.2/v5.1 flat lane *tables* (`buildUnits` row idiom, render.js:333) in
  favour of dispatchable **tiles** — information preserved, idiom changed.
- `CFG.v5_4.ui` — display thresholds + token wiring (flow thresholds, which material token each region
  consumes). No economy. **`flowThresholds` is display-only** — it recolours the pulse and nothing else; the
  moment a flow threshold feeds interruption logic (a pierce, the brief, a tint trigger) it has become a
  model change and is out of scope.
- `flowRate(S) → {perHour, driver}` — a pure read-only selector that **recomputes** the true net rate. It
  must **not** return `S.flowRate`: v5.3 sets that field *before* subtracting VOLL (sim.js:540-574 vs.
  :623-624), so reusing it would read healthy during a forced-unserved blackout. `perHour` = revenue −
  varCost − effSurcharge − spin − fixedOM − interest + capacityPay **− the VOLL rate** (and ideally −
  recharge − R&D − capacity-call fines); `driver` names the dominant term, surfacing `"VOLL"` when unserved
  > 0 so the pulse craters *and says why*. No engine field, no state — a projection, not a new number.

## Approach

1. **The chart is the master instrument.** The supply-vs-demand canvas becomes the centrepiece the eye
   returns to — the stack climbing toward demand is the game's core causal picture. Treat it as an
   instrument, not a card.
2. **The fleet as tiles (L3 — kill the spreadsheet).** Each dispatchable plant (gas / battery) is an
   operable **tile** you commit (keys `1/2/3/B` preserved), with its state legible at a glance; firm and
   renewable auto-plant read as status, not rows. The exact tile look is the Phase-2 decision; this phase
   builds it. **Tiles are plain `render()` functions, not `<unit-tile>` custom elements** (Web Components
   decision, README Tech row) — no hidden architecture inside a no-build repo. Full fleet-at-scale behaviour
   (promotion-by-exception) is Phase 6 — this phase establishes the tile and the lane.
3. **Flow-only (the keystone) — with a temporary cash stopgap.** The deck carries the earn/burn pulse
   (`flowRate`) + its driver + the spot "why" line (from Phase 1). **Cash-on-hand is not on the deck** — it
   lives in the Book (Phase 5). But cash lives today in the *frame* top bar (`s-cash`), not the modal Desk,
   so removing it here would leave solvency with no surface until Phase 5 lands the Book. **Leave a
   temporary, explicitly-marked cash readout** in the frame (a `<!-- TEMP: deleted when the Book lands -->`
   sub-line) that Phase 5 removes in the same commit the Book takes over. This is the keystone coupling
   (README): 4 and 5 ship as a pair, and this stopgap is what keeps Phase 4 independently shippable.
4. **KPI chips as instruments in the frame.** The command-bar readouts (Research, Wholesale, CO₂, Carbon)
   read as instruments set into the `frame` material — a dashboard fascia with gauges mounted in it, two
   materials (frame + deck), not eight.
5. **Stability strip** stays the whole-grid annunciator in the top strip (renderStabilityBar,
   render.js:88), now under the skin's grid-state bleed.
6. **Materials: three, by role.** frame (chrome/top bar/buttons) · deck (chart, fleet tiles, KPI chips, flow)
   · [Book lands Phase 5]. Nothing on the deck gets its own extra material.

## Done when

- The operating screen is instruments + tiles under the decided `deck` material, over the Phase-3 skin.
- The fleet reads as *operable iron*, not a table; commit controls unchanged.
- Flow is on the deck; the spot "why" line is present; a *temporary* marked cash readout keeps solvency
  visible until Phase 5.
- `flowRate` is a pure selector that recomputes net incl. VOLL — no new state, no engine change; the pulse
  craters on forced-unserved; suites + v5.3 harness green.
- `main` is shippable: the still-old Book (modal Desk) behind the new deck is a tolerable interim, and cash
  is still readable via the stopgap.

## Risks & open questions

- **Keystone coupling (README):** cash cannot simply vanish from the deck — it has no other surface until
  Phase 5. The temporary frame readout is the agreed stopgap; it must be visibly marked and deleted in the
  Phase-5 commit, not left to rot.
- The interim — new deck, old Book until Phase 5 — must not read as broken. They are different
  rhythms/surfaces, so the mismatch is tolerable; the real risk was solvency legibility, handled above.
- Tile-at-scale is deferred to Phase 6 on purpose; resist building promotion-by-exception here.
- Container queries (`@container`) should carry tile restyling by available space so the fleet scales
  without a second layout — but keep the heavy at-scale logic for Phase 6.
