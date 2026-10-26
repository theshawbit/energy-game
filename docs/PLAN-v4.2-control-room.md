# Grid Operator v4.2 — "The Control Room" — UI/UX Redesign Spec

> **Status: SHIPPED** (all four slices merged to `main`, 2026-10-26; Pages
> auto-redeployed). Spec PR #44; build CR-1 #45, CR-2 #46, CR-3 #47, CR-4 #48.
> Written from a two-round grill-me session (2026-10-25) that converged on a
> design direction the user confirmed. This is the *what, why, and how* for the
> live-screen redesign; the phased build landed in reviewable PRs (§8). It was a
> **UI/UX release only** — **zero game-mechanics changes** (§7). All v4.1
> gameplay/contract/layout work (PRs #41/#42/#43) was already merged and live;
> this **supersedes the v4.1 layout/landing pass** — specifically the "Desk ·
> live" aside panel bolted in during #43, folded into the status cluster here.
>
> *Versioning note:* labeled **v4.2** because v4.1 (layout) already shipped and
> this redesigns that surface. Fold it under 4.1 if you'd rather — it's a name.

**Theme:** The live screen stops being a page of boxes and becomes a **control
room**. Grid operation is a real-time, high-stakes, instrument-driven job, and
the UI should *feel* like sitting the desk: backlit annunciator tiles, gauges
that sweep, readouts that tick, alarms that flash — glanceable at a distance,
dense up close. The Book (v4's economy) gets the same instrument treatment the
grid already has, so cash, spot, and hedge exposure read like live telemetry
instead of a side panel you forget to open.

This absorbs the standing UI complaint that v4.1 made the surface **worse**: a
Desk panel got crammed into "open real estate," which pushed the primary action
below the fold and *raised* density without adding clarity. The lesson, and the
rule for this release: **don't fill space — fix hierarchy, then let real
telemetry fill the space because it earns it.**

---

## 1. Where this starts (the problem)

The live screen today (`index.html` + `render.js`) is a two-column grid:

- **Left card:** two big numbers (Demand / Capacity), a reserve-margin gauge, the
  demand-vs-capacity canvas chart, and the event ticker.
- **Right aside:** the fleet as a stack of **cards**, a "Desk · live" readout
  panel (#43), and a "Shift" card whose **Pause / Manage buttons sit at the
  bottom of the page**.

The playtested verdict — *"the UI/UX is genuinely worse now"* — unpacked (grill
session) into five concrete faults, none of them a JS limitation:

1. **The primary controls are below the fold.** Pause/Manage — the two things you
   reach for most, under time pressure — are the last thing on the page.
2. **The cards are static and undynamic.** A unit card shows a state string. It
   doesn't *move*: no trend, no reaction, no sense of a live machine. You read it;
   it never tells you.
3. **Two visual languages for one fleet.** The live screen shows **cards**; the
   Manage screen shows a **sortable table**. Same units, two mental models.
4. **The operator is flying with half the instruments.** No cash-flow *rate* (only
   a balance), no sense of armed-vs-online-vs-demand headroom, no time-to-peak, no
   live spot P&L. A real operator watches rates and margins, not just levels.
5. **It looks like a web form, not a desk.** Even stuffed, the surface reads
   amateur: boxes of text, inert, no instrument identity.

The keepers: the real-time engine, the determinism, the economy, the chart data,
the pause-to-plan loop, the whole Manage screen. This release **re-skins and
re-lays-out the live surface and adds derived readouts** — it touches no sim
logic. (`engine.js` and `sim.js`'s dispatch path are untouched save for one
optional derived-rate line, §6.)

---

## 2. The feel (aesthetic north star)

The user's words: *"a mix of a power-grid control room (like those Chernobyl
control-room videos — first place my mind goes) with some mission control and
terminal list sprinkles."* Three reference registers, blended:

- **Power-grid control room (primary).** Backlit **annunciator tiles** — the
  legended lamp panels that glow green/amber/red by state and *pulse* on alarm.
  Analog-style **gauges and dials** with sweeping needles. Heavy bezels, inset
  panels, the sense of a physical board.
- **Mission control (glanceability).** A **master status wall** you can read in
  one sweep from across the room: the handful of numbers that decide the run,
  big, lit, with their *rates* and *trends*, not buried.
- **Terminal / ops-log (density).** The Book and the event feed as a **monospace,
  dense, scrolling annunciator log** — timestamped, color-coded, high
  information-per-pixel, the way a dispatch desk logs events.

**What we are NOT doing:** we are not overhauling the type system or the color
palette wholesale — the user was explicit that fonts/colors are *not* the problem.
The display face (Chakra Petch), the mono (IBM Plex Mono), and the existing
accent/good/warn/bad tokens stay. We refine **spacing, bezels, gauges, motion,
and layout** — the instrument *grammar* — on top of the palette we have.

**Principles (the rules this redesign obeys):**

- **One surface, no scroll.** Everything the operator needs mid-run fits the live
  viewport at the target sizes. New readouts earn their place by replacing scroll
  with density, not by adding a scrollbar.
- **Rate and trend, not just state.** Every primary readout shows where it *is*
  **and where it's going** (▲▼ delta, sparkline, or sweep), because operation is
  about catching the turn, not reading a snapshot.
- **Reacts, and reorders by urgency.** Instruments change appearance with state
  (glow / pulse / dim) and the fleet floats whatever needs attention to the top.
- **One fleet, one language.** The live instrument and the Manage table are the
  same data in two views (operate vs. plan), visibly related, same color grammar.
- **Derived-only.** Every new number is computed from existing state. No new game
  mechanic, no new persisted field, no change to how the sim resolves an hour.

---

## 3. Screen architecture — five regions

One live surface, top to bottom, no scroll. Regions by priority of the operator's
eye, not by old DOM order:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ① COMMAND BAR   DAY 3 · 18:42  [⏸ PAUSE]  [▣ MANAGE]   ⚡RP  CO₂  Sat  │  ← controls up top
├──────────────────────────────────────────────────────────────────────┤
│ ② MASTER STATUS CLUSTER — backlit instrument tiles                     │
│  ┌ DEMAND ┐ ┌ ONLINE ┐ ┌ ARMABLE ┐ ┌ RESERVE ┐ ┌ CASH ┐ ┌ SPOT P&L ┐  │
│  │ 842 MW │ │ 910 MW │ │ +260 MW │ │  (dial) │ │ +$/h │ │  hedged%  │  │
│  └ head ──┘ └ margin ┘ └ to-peak ┘ └  8.1% ──┘ └ /day ┘ └ exposure ─┘  │
├────────────────────────────────────────────┬───────────────────────────┤
│ ④ STRIP-CHART (demand vs capacity, restyled)│ ③ FLEET INSTRUMENT BANK   │
│    rolling trace, peak marker, deficit band │   per-unit live tiles,    │
│                                             │   sparkline + state +      │
│                                             │   $/MWh, auto-reordered    │
├────────────────────────────────────────────┴───────────────────────────┤
│ ⑤ ANNUNCIATOR LOG — timestamped, color-coded event/alarm feed           │
└──────────────────────────────────────────────────────────────────────┘
```

### ① Command bar (top)
The clock, the career context (Day), and the **two prominent, redesigned primary
controls**. Pause and Manage move from page-bottom to here — the first thing in
the reading order, sized and styled as deliberate console controls (not form
buttons): a big **PAUSE/RESUME** toggle that visibly changes the whole board's
state (a "HOLD" tint when paused), and **MANAGE** as the armored "open the
planning board" control. Secondary header stats (RP, CO₂, carbon $, satisfaction)
demote to a compact strip on the right — present, glanceable, not competing.
*Mechanics unchanged:* pause still freezes the clock, Manage still opens the same
modal. We move and dress the controls; we do not change what they do.

### ② Master status cluster
The mission-control wall: the ~6 instrument tiles that decide the run, each a
backlit tile with a big primary value, a secondary rate/trend, and a state lamp.
This is where the new operator intel lives (§5). It **replaces** the old two "big
number" blocks and the #43 "Desk · live" panel — same information plus the
derived readouts, as instruments instead of a list.

### ③ Fleet instrument bank
The fleet as a bank of **live instrument tiles** — not static cards. Each reacts,
carries a trend, and the bank **auto-reorders by urgency** so the unit that needs
you floats up. This is the live, operate-time view; the Manage table is the
sortable, plan-time view of the same units (§5, reconciliation).

### ④ Strip-chart
The existing demand-vs-capacity canvas, restyled as a control-room **strip-chart
trace**: phosphor-style rolling line, a peak-of-day marker, the deficit/brownout
region called out as a hazard band. Same data and scales as today; a visual
restyle, kept because it's the one real time-series and it's loved.

### ⑤ Annunciator log
The ticker, upgraded to a **terminal-style event/alarm log**: timestamped
(`18:42`), color-coded by severity (nominal/advisory/alarm), newest on top,
monospace. Strain warnings and trips land here as **alarms** (amber/red, brief
flash) so the telegraph (§ v4.1 strained state) reads like a real annunciator.

---

## 4. Component specs

### 4.1 Command bar
- Left: `DAY n · HH:MM` in the display face, clock ticking.
- Center/left-of-center: **PAUSE/RESUME** and **MANAGE**, the two biggest
  controls on the bar. Pause is a toggle with an unmistakable state change (label
  + board HOLD tint + the `Space` affordance shown). Manage is the primary accent
  button.
- Right: compact secondary strip — RP (+Δ), CO₂ kg/MWh, carbon $/t, satisfaction —
  each a small lit readout, dimmer than the cluster.
- Keyboard: `Space` pauses (unchanged); the bar reflects, never replaces, the keys.

### 4.2 Status cluster tile (the instrument primitive)
A reusable backlit tile: `label` (small caps) · `value` (large) · `sub`
(rate/trend/secondary) · `lamp` (state color). Tiles share one bezel/inset style.
The six tiles (each readout defined in §5):

| Tile | Primary | Secondary (sub) | Lamp drives on |
|---|---|---|---|
| **Demand** | current MW | ▲▼ vs last tick | — |
| **Online** | capacity online MW | headroom vs demand (±MW) | green ≥ margin band; amber thin; red deficit |
| **Armable** | potential MW if all reserves armed | **time-to-peak** countdown | amber if peak is near and reserves still cold |
| **Reserve margin** | **dial** (needle), % value | band label (tight/ok/flush) | green/amber/red by `rmRef`/deficit |
| **Cash** | balance | **flow rate** +/−$ per hr **and** per day | red when flow negative |
| **Spot / P&L** | spot now | **hedged %** + exposed-MW P&L at spot | amber when exposure high into a tight grid |

### 4.3 Fleet instrument tile
Anatomy (built once, patched per frame — same perf pattern as today's
`buildUnits`/`updateUnits`, no teardown):

- **Name + kind** (nuclear / coal / gas peaker / solar / wind / battery).
- **Output readout:** current MW + a **sparkline** of recent output (small ring
  buffer in the render layer; §6).
- **Running cost:** live **$/MWh** for that unit right now (merit-order marginal
  cost incl. carbon — the per-unit version of the header "wholesale" signal).
- **Condition:** wear/health bar; for reserves, **spin-up ETA** when starting.
- **State reaction (the "dynamic" the user wants):**
  - *earning / online* — lit, steady.
  - *idle reserve (armable)* — dim, a "ready" outline.
  - *starting* — pulsing, ETA ticking down.
  - *strained* — **amber, pulsing** (the v4.1 telegraph), strain timer visible.
  - *worn* — condition bar red, "service" hint.
  - *tripped / service* — dark/red, countdown to return.
- **Auto-reorder:** the bank sorts by **urgency**, reusing the Manage table's
  existing `attentionRank` (`src/live/fleetsort.js`) so a straining/worn/tripped
  unit floats to the top. Same comparator the table already uses → the two views
  agree on "what needs attention."

### 4.4 Strip-chart
Restyle only: phosphor trace for capacity, bright line for demand, hazard band on
deficit, a peak-of-day tick. Same canvas, same `width/height`, same series and
scales as `render.js` draws today.

### 4.5 Annunciator log
- Monospace rows: `HH:MM  MESSAGE`, newest on top, capped list.
- Severity color: nominal (dim), advisory (accent), **alarm (amber/red, brief
  flash on arrival)**. Strain warnings and trips are alarms.
- Same event source as today's ticker — a presentational upgrade, not new events.

---

## 5. Derived readouts (the new operator intel)

Everything here is **computed from existing state** — the proof that this release
adds no mechanic. Formulas reference the live state `S` and the pure helpers that
already exist (`unitOutput`, the demand curve, the contract book).

- **Cash flow rate ($/hr and $/day).** The net of the cash line this tick,
  expressed as a rate: `flow = (contract+residual revenue − varCost − spin −
  fixedOM − interest + capacityNet) ÷ dtH`. Surfaced either as a 1-line derived
  field off the existing cash math in `step()` (preferred — it's the same numbers
  already summed, just exposed as a rate) **or** a render-layer rolling
  `Δcash/Δt`. `/day = /hr × 24`. Lamp red when negative.
- **Potential ("Armable") capacity.** `Σ` over the fleet of the MW each unit would
  supply if armed: firm/peaker → rated cap; renewables → current `unitOutput`
  (weather-limited, can't "arm" more); battery → cap if it still has energy. The
  tile shows this total; **headroom-if-armed** = potential − demand.
- **Online headroom.** `capacity_online − demand` (today's two big numbers become
  one tile + a signed headroom sub).
- **Time-to-peak.** From the fixed daily shape (`DEMAND_SHAPE`, peak at **hour
  18**), a countdown from the current clock to the next peak — so "arm reserves
  before the evening peak" has a number. Shown on the Armable tile.
- **Reserve-margin dial.** The existing margin %, rendered as a swept dial instead
  of a bar (same value, `rmRef`/deficit thresholds for the color bands).
- **Spot P&L / exposure.** Spot now (have it); **hedged %** = contracted MW ÷
  demand; **exposed MW** = served − contracted, i.e. the load clearing at spot;
  **blended $/MWh** = (contract revenue + residual×spot) ÷ served. Tells the
  operator how much of the next hour is locked vs. riding the market.
- **Per-unit $/MWh.** The unit's marginal running cost (fuel + O&M + carbon),
  the per-plant version of the merit-order signal already computed for wholesale.

**Card ↔ table reconciliation.** The live bank and the Manage table render the
**same unit model** through **one color/state grammar** and the **same
`attentionRank` sort**. Live = instruments (operate); Manage = sortable table
(plan). Explicitly resolves grill-session fault #3 ("table on the menu tab but
cards on the main tab — needs re-evaluating").

---

## 6. Implementation notes & architecture fit

- **Layering stays pure.** `render.js` reads `S` and patches the DOM; `sim.js`
  owns state. The only candidate sim touch is exposing `S.flowRate` as a derived
  convenience in `step()` (surfacing existing cash math as a rate) — not a
  mechanic, fully optional if we instead roll `Δcash` in render.
- **Per-frame cost.** Sparklines use a small per-unit ring buffer held in the
  render layer (last ~N outputs), pushed each frame, drawn as a cheap inline
  `<svg>`/`<canvas>`. No new state in `S`, no determinism impact. Keep the
  build-once/patch pattern (`buildUnits`/`updateUnits`) — never teardown per frame.
- **Determinism untouched.** No new RNG draws; readouts are pure functions of
  current state. The guards suite (shortfall-never-windfall, determinism,
  conservation) stays green unchanged.
- **Gauges/dials:** inline SVG (needle = rotate transform), themeable via the
  existing CSS tokens. Annunciator glow/pulse: CSS animations keyed off the state
  class (the `.st-strained` pulse from v4.1 is the template).
- **No framework.** Vanilla JS + CSS + SVG/canvas, no build step, served over
  HTTP, subpath-safe for Pages — same as the whole project.
- **Landing page** (the #43 640px `renderHome`) is out of this release's live-screen
  scope; leave it as-is unless the restyle makes it feel disconnected, in which
  case align its palette in the polish pass.

---

## 7. Out of scope (explicit)

- **No game-mechanics change.** Pause-to-plan stays; hedging/building stay in
  Manage; dispatch, trips, strain, the economy, scoring — all unchanged. This is
  skin + layout + derived readouts only.
- **No new persisted/save state**, no save migration.
- **No palette/type overhaul.** Refine spacing/bezels/gauges/motion on the
  existing tokens and faces.
- **No new engine behavior.** `engine.js` / `dispatchHour` untouched.
- **Mobile/touch** stays best-effort (it works today); a dedicated touch layout is
  a later release, not this one.

---

## 8. Build plan (reviewable PRs)

Each PR was independently shippable, kept the test suite green, and got a browser
pass before merge. Logic that computes a readout got a unit test. (The suite grew
from 13 to **14** — CR-2 added `tests/readouts.test.mjs`.) All four merged:

- **CR-1 — Command bar + layout skeleton. ✅ DONE (PR #45).** New top command bar;
  relocated + redesigned **PAUSE/RESUME + MANAGE** (mechanics unchanged; pause lights
  an amber HOLD lamp and dims the play area); no-scroll region grid (§3) with old
  content re-homed; secondary header stats demoted; old bottom "Shift" card removed.
- **CR-2 — Master status cluster + derived readouts. ✅ DONE (PR #46).** Instrument-tile
  primitive; the six tiles; the reserve **dial** (SVG needle); the derived numbers (§5),
  with `tests/readouts.test.mjs` (25 checks: flow rate, potential/armable, time-to-peak,
  hedged %/exposure, blended price). `step()` surfaces read-only `S.served` /
  `S.contractRevenue` / `S.flowRate`. "Desk · live" panel retired into the cluster.
- **CR-3 — Fleet instruments + reconciliation. ✅ DONE (PR #47).** Fleet cards → live
  instrument tiles (output sparkline via a render-layer ring buffer, per-unit `$/MWh`
  from the engine's `marginalCost`, state-reaction classes, spin-up ETA + service
  countdown); `attentionRank` auto-reorder via CSS `order`. Shared-grammar fix:
  `attentionRank` now ranks `strained` just below `tripped` and the Manage table gained
  the `strained` pill — one `st-*` grammar + sort across live and Manage.
- **CR-4 — Strip-chart + annunciator + polish. ✅ DONE (PR #48).** Chart lines got a
  phosphor glow + CRT inset (same data/scales/bands); ticker → severity-colored
  annunciator event log (render-layer, from the sim's existing ticker string; no sim
  change). Landing palette left as-is (it still reads consistent).

---

## 9. Decisions locked (from the grill session)

1. Main live screen stays **instrument tiles**; the table is the **Manage/plan**
   view — reconciled under one grammar, not one of them deleted.
2. **Keep the chart**, restyled (not replaced).
3. **No game-mechanics change** — pause-to-plan stays; hedging/building are **not**
   moved to the live screen. The mechanics aren't the problem.
4. **Don't overhaul fonts/colors** — refine spacing, gauges, and motion on the
   existing palette.
5. **Pause/Manage move to the top**, redesigned, prominent, deliberate — without
   losing the aesthetic draw.
6. New readouts (cash flow rate, potential vs online vs demand, headroom +
   time-to-peak, spot P&L / exposure) are all **derived from existing state**.
7. Readouts **fill the real estate** the user keeps pointing at — but must **flow,
   not clutter**. Density is earned, never crammed (the v4.1 anti-pattern).
8. Feel = **control room × mission control × terminal**.

---

## 10. Open questions — resolved as-built

- **Flow-rate source:** *Resolved — expose from `step()`.* `S.flowRate` is assembled
  from the hour's existing revenue/varCost/spin/fixedOM/interest/capacity terms as a
  $/game-hour rate (CR-2). Exact and non-jumpy; discrete one-off hits (e.g. a capacity
  fine) are left out of the rate.
- **Sparkline window:** *Resolved — 32 samples* per unit, held in a render-layer ring
  buffer (CR-3). Reads as a clean recent-output trend without noise.
- **Dial vs. bar for reserve margin:** *Resolved — dial only.* An SVG needle sweeping
  −30%…+30% with the exact % printed beneath (CR-2); the printed value keeps it precise
  at the deciding thresholds, so no bar was needed.
- **No-scroll viewport:** *Resolved — ≥881px wide & ≥720px tall* get the one-surface
  no-scroll layout (fleet/aside scroll internally, chart capped at 30vh); narrower or
  shorter viewports fall back to normal page scroll (CR-1).
