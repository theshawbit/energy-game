# Grid Operator v3 — Implementation Plan (Phases A–F)

Companion to [ROADMAP-v3.md](ROADMAP-v3.md). This was the build plan:
file-by-file changes, new state/config, tests, acceptance criteria, and a PR map.

> **Status: shipped** (2026-10-18). Phases A–F are all implemented and merged
> (PRs #14–#29). This document is kept as the historical build record; the PR
> breakdown below is what actually landed, give or take the deviations noted inline
> (e.g. the `ORDER` decision in Phase B, and `createGame` rolling mutators moving to
> the run-start call site). The only unbuilt item is the optional juice pass.

## Guiding constraints (hold across every phase)

- **Engine is sacred.** `src/engine.js` (`dispatchHour` / `simulateDay`) stays the
  single source of dispatch truth and stays verified. New tech enters through its
  existing seams (the `TECH` table, the `fuelMult` arg), not by forking the clearing.
- **Module boundaries hold.** `render.js` never mutates state; `sim.js`/`actions.js`
  never touch the DOM; `main.js` is the only module wiring both. New pure modules
  (`research.js`, `mutators.js`) mirror `meta.js`.
- **No build step.** Split ES modules served over HTTP. No deps, no bundler.
- **Degrade gracefully.** All new persistence goes through the existing
  try/catch'd `persist.js`; a blocked/empty `localStorage` must still start a run.
- **Each PR ships green.** `npm test` passes at every merge; the game is playable at
  every merge even if a later phase's UI isn't built yet.

## Two engine seams we exploit (already present)

1. **`fuelMult` (4th arg of `dispatchHour`/`marginalCost`)** multiplies gas marginal
   cost and re-sorts the merit order. Currently hardcoded `1` at [sim.js:143](../src/live/sim.js). Fuel-spike mutators just pass a value.
2. **`avail[tech]` aggregation by tech key** ([sim.js:141-142](../src/live/sim.js)) means any new
   thermal tech added to `TECH`/`THERMAL` in `constants.js` is dispatched and priced
   automatically — no clearing-logic changes needed for SMR / CCS / geothermal.

## Known constraints to design around

- **Single-battery assumption — being lifted in v3.** `sim.js` and `actions.js`
  today find *the* battery by `id === "bat"` ([sim.js:162](../src/live/sim.js),
  [actions.js:78](../src/live/actions.js)). v3 supports **multiple storage units**
  (player decision), so Phase B replaces every single-battery lookup with a loop over
  all `kind === "battery"` units and distributes the dispatched storage MW across
  them. See Phase B "Multi-storage" for the specifics.
- **Demand is supply-only today.** Demand-response is the first mechanic that
  *reduces* `S.demand`. It applies as a shave on the computed demand *before*
  `dispatchHour`, so the engine still clears a single consistent number.

---

## New architecture (what gets added, once)

### New state on the game object (`createGame` in `sim.js`)

```
rp: 0,                 // Research Points banked this run
rdFunding: 0,          // $/game-hour diverted into R&D (player-set, 0 = off)
research: {},          // { nodeId: true } techs researched THIS run
rmods: {},             // derived research modifiers (computed from `research`)
mutators: [],          // active per-run mutator ids
mmods: {},             // derived mutator modifiers (demandMult, fuelMult, cfMult…)
```

### New profile fields (`persist.js` `defaultProfile`)

```
researchUnlocked: {},  // { nodeId: true } tech branches meta-currency has unlocked
```

Bump the storage KEY to `grid-operator-live-v2` **with a migration** that maps the
old key's `{currency, skills, best}` forward (so existing players keep progress).

### New pure modules

- **`src/live/research.js`** — mirrors `meta.js`. Exports `RESEARCH` (node
  definitions: id, branch, label, rpCost, prereq, effect-spec, meta-unlock flag),
  `canResearch(S, id)`, `doResearch(S, id)` (spends RP, sets `S.research[id]`,
  recomputes `S.rmods`), and `computeResearchMods(research)` → the `rmods` the sim
  reads. No DOM, no storage.
- **`src/live/mutators.js`** — exports `MUTATORS` (deck), `rollMutators(profile)`
  (choose this run's set), and `computeMutatorMods(ids)` → `{demandMult, fuelMult,
  cfMult:{sun,wind}, …}`. No DOM.

### How modifiers compose in `step()`

A single, explicit order so effects never silently stack wrong:

```
demand  = peak × shape × mmods.demandMult × (1 − rmods.demandShave)
fuelMult = mmods.fuelMult                       // → dispatchHour 4th arg
renewOut = baseCF × weather × mmods.cfMult      // drought / lull
wear/spin/startTime/battery = base × rmods.*    // research buffs
upgrade effects = base × rmods.upgradeAmp       // research amplifies Mk tiers
```

---

## Phase A — Research core

**Goal:** RP exists, the R&D-lab cash→RP lever works, and a *minimal* in-run tree
(one node per effect type) measurably changes the sim. Prove the money-now-vs-tech-
later decision is fun before building content.

**Files**
- `src/live/config.js` — add `rpPerDollar` (conversion), `rdFundingMax` ($/h cap),
  and base `RESEARCH` node costs block in a new `research.js` (not config) — config
  holds only tuning scalars.
- `src/live/research.js` *(new)* — 3 starter nodes: `amp-upgrades` (upgradeAmp +10%),
  `unlock-smr` (gates a new build — payload lands in B), `buff-wear` (−15% wear).
  `computeResearchMods`, `canResearch`, `doResearch`.
- `src/live/sim.js` — in `createGame`: init `rp/rdFunding/research/rmods`. In `step`:
  after economics, convert `rdFunding × dtH` cash → `rp` (clamped to cash on hand);
  apply `rmods.wearMult` into the wear line ([sim.js:131](../src/live/sim.js)) and
  `rmods` into spin/startTime where relevant.
- `src/live/actions.js` — `setRdFunding(S, $perH)` (guarded like other actions);
  `researchNode(S, id)` delegating to `research.js`, returns `{ok,msg}`.
- `src/live/render.js` + `index.html` — a temporary RP readout + funding control in
  the Manage panel (full redesign is Phase E; this is functional scaffolding).
- `src/live/main.js` — wire `setRdFunding` / `researchNode` into the `menu` object.

**Tests** — `tests/research.test.mjs`: node cost/prereq gating, `computeResearchMods`
math, `doResearch` spends RP and is idempotent. Extend `sim.test.mjs`: RP accrues at
the configured rate, never exceeds cash, `rmods.wearMult` reduces wear.

**Acceptance** — You can fund R&D, watch RP climb (and cash fall), research the wear
node, and measure slower condition loss. `npm test` green.

**PR map** — PR A1: `research.js` + sim/actions state + tests (headless, no UI). PR
A2: minimal Manage-panel RP UI + wiring.

---

## Phase B — Tech content (the four families)

**Goal:** The four tech families exist as researchable + buildable options, with the
tree's branches and a couple of capstones.

**Files**
- `src/constants.js` — add `TECH` entries and extend **`THERMAL` only** (see the
  decision note below): **DONE in PR B1.**
  - `smr` (small modular reactor): firm, low `ef`, `mc` between nuclear and coal.
  - `ccs_coal` / `ccs_gas`: coal/ccgt variants, higher `mc`, much lower `ef` (beat
    the carbon price). Color tokens added in `styles/main.css` (the shared token
    block), not `styles/live.css`.
  - `geo` (geothermal): firm, `ef:0`, baseload. All get `avail`, `block`, `note`.
  - Because dispatch keys off `avail[tech]`, these clear automatically.

  > **Decision (PR B1): do NOT add the v3 techs to `ORDER`.** `ORDER` drives the
  > *batch* reference game's stack chart, legend, and build palette, and that game's
  > `START.fleet` (`src/game.js`) has only the original seven tech keys — adding the
  > new techs to `ORDER` would surface build buttons that do `G.fleet[t] += block`
  > on an `undefined`, yielding `NaN`. The **live** game never reads `ORDER` (it has
  > no per-tech stack chart), so the techs live in `THERMAL` (the merit-order
  > dispatch set) and are surfaced to the player through the live **build catalogue**
  > (`config.js` `BUILD`, Phase B below), never `ORDER`. Engine hardening shipped
  > alongside: `dispatchHour` seeds its stack from `ORDER∪THERMAL` so every tech key
  > is present, and `simulateDay` guards `fleet[t] || 0` against `NaN`.
- `src/live/config.js` — `BUILD` entries (cost/mw) for the new buildables, gated so
  they only appear once their research node is owned; `BUILD_ORDER` updated.
- `src/live/config.js` `makeUnit` — handle new techs' `kind`/`spin`/`fail`/`recover`
  (SMR/geothermal = firm; CCS = firm). Keep the single-battery rule for storage.
- **Multi-storage (lifts the single-battery assumption):**
  - `src/live/config.js` — add `battery` to the `BUILD` catalogue (cost/mw + a
    default `maxEnergy`/duration); teach `makeUnit` to build `kind === "battery"`
    units (set `energy`/`maxEnergy`/`status:"off"`/`ctrl:true`, a numbered key or
    click-only). Keep `makeFleet`'s starting `bat` as unit #1.
  - `src/live/sim.js` — replace the single `S.fleet.find(u => u.id === "bat")` block
    ([sim.js:162-170](../src/live/sim.js)) with a loop over all battery units. The
    engine returns one aggregate `hr.stack.battery`; **distribute it across
    discharging batteries** proportional to each unit's available energy (so no unit
    drains below zero), and recharge idle batteries from surplus up to each unit's
    `maxEnergy`. `unitOutput` already handles per-battery output.
  - `src/live/actions.js` — `toggleUnit` already keys off unit id (works for N
    batteries); allow `decommissionUnit` to retire batteries (drop the hard block at
    [actions.js:78](../src/live/actions.js)) while refusing to retire the *last* one,
    so a run always has storage telemetry.
  - `src/live/render.js` — render each battery card with its own energy bar + key.
  - **Tests** — `sim.test.mjs`: two batteries discharge without either going
    negative; aggregate drained equals `hr.stack.battery`; building/decommissioning a
    battery keeps the energy accounting consistent.
- `src/live/research.js` — flesh out 4 branches:
  - **Storage** nodes buff *all* storage units (`battCapMult`, `battDurationMult`,
    `rteMult`) — applied in the per-battery loop in `sim.js`.
  - **Demand response** nodes set `rmods.demandShave` (e.g. 3%/6%/10% peak shave),
    optionally time-gated to peak hours.
  - **Advanced gen** nodes flip `researchUnlocked`/build-gates for SMR/CCS/geothermal.
  - **Transmission/efficiency** nodes: `spinMult`, `startTimeMult`, `lineLossMult`
    (a small demand-side efficiency), `reserveEffMult`.
- `src/live/sim.js` — apply storage buffs to battery cap/energy/recharge; apply
  `demandShave` to `S.demand` before `dispatchHour`; apply efficiency mults.
- `src/live/actions.js` — `buildCapacity` respects research build-gates.

**Tests** — `engine.test.mjs`: new thermal techs clear in correct merit order; CCS
emits less and survives carbon switching. `research.test.mjs`: build-gates,
storage/demand-shave math. `sim.test.mjs`: demand-shave reduces served demand and
never produces negative demand.

**Acceptance** — A run can research + build SMR/CCS/geothermal, shave its own peak
via demand response, and super-size the battery. Merit order stays economically sane.

**PR map** — PR B1: engine/constants new techs + engine tests. PR B2: **multi-storage
refactor** (lift the single-battery assumption) + tests. PR B3: storage +
demand-response research + sim wiring. PR B4: advanced-gen + transmission research +
build gates.

---

## Phase C — Meta gating (tree grows across runs)

**Goal:** Meta-currency permanently unlocks *which* research is available; the tree
visibly expands run over run. In-run research still resets each run.

**Files**
- `src/live/meta.js` — add meta "unlock research" entries as a **separate
  `RESEARCH_UNLOCKS` array** (decided: its own tab, kept distinct from the 6 passive
  skills) + `buyUnlock(profile, id)` mirroring `buySkill`.
- `src/live/persist.js` — `researchUnlocked` in `defaultProfile`; KEY bump + migration.
- `src/live/research.js` — `canResearch` also checks `profile.researchUnlocked` (pass
  the unlock set into `createGame`/`computeResearchMods`). Locked nodes are visible
  but greyed with a "Unlock in Skills" hint.
- `src/live/main.js` — pass `profile.researchUnlocked` into `createGame`; wire buy-
  unlock into the `meta` screen actions; `saveProfile` after purchase.
- `src/live/render.js` — `renderMeta` gains a **tab switch** (Skills | Research
  Unlocks); the Research-Unlocks tab lists unlock nodes + costs; the in-run research
  panel greys nodes not yet meta-unlocked.

**Tests** — `meta.test.mjs` *(new, or extend)*: `buyUnlock` spends currency, is
capped, persists; `research.test.mjs`: a node locked by meta cannot be researched
even with enough RP. Migration test: old-key profile loads into new shape.

**Acceptance** — A fresh profile shows a small tree; spending meta-currency unlocks
deeper branches that then become researchable in-run. Old saves migrate cleanly.

**PR map** — PR C1: persist migration + `RESEARCH_UNLOCKS` + gating (+tests). PR C2:
meta-screen unlock UI.

---

## Phase D — Variety engine (per-run mutators)

**Goal:** Every run rolls conditions that each point toward a different research path.

**Files**
- `src/live/mutators.js` *(new)* — deck: `fuel-spike` (→ `fuelMult`), `drought`
  (→ `cfMult.wind`/hydro + storage derate), `heatwave` (→ `demandMult` + shifts the
  peak), `cold-snap`, `renewable-lull` (→ sustained low `cfMult`). Each: id, label,
  weight, blurb, and a `mods` contribution. `rollMutators(profile)` picks 1–2 at run
  start (weighted; expandable to mid-run escalation later).
- `src/live/config.js` — mutator magnitudes (so balance lives in one place).
- `src/live/sim.js` — `createGame` calls `rollMutators` and `computeMutatorMods`;
  `step` folds `mmods` into the compose order (demand × demandMult, `fuelMult` into
  the `dispatchHour` call at [sim.js:143](../src/live/sim.js), `cfMult` into
  `unitOutput` renewables at [sim.js:85](../src/live/sim.js)). Heatwave may also
  perturb `DEMAND_SHAPE` interpolation via a peak-hour bump factor.
- `src/live/render.js` + `index.html` — a mutator banner (final styling in E).

**Fairness rule (encode as a test/invariant):** every mutator must have a reachable
research/build answer; magnitudes capped so day-1 is survivable with the starting
fleet. No mutator may push day-1 peak demand above starting firm+renew capacity by
more than the reserve a player can realistically dispatch.

**Tests** — `mutators.test.mjs`: roll is deterministic under a seeded RNG, weights
respected, `computeMutatorMods` composes; `sim.test.mjs`: `fuelMult` from a mutator
re-sorts the merit order; `demandMult` raises demand; a drought lowers renewable
output. Fairness invariant test: day-1 survivability under each single mutator.

**Acceptance** — Starting a run announces its mutator(s); the sim visibly behaves
differently (merit order, demand, renewables) and the "right" research branch for
that mutator pays off.

**PR map** — PR D1: `mutators.js` + sim wiring + tests (headless). PR D2: banner UI.

---

## Phase E — Full HUD redesign & juice

**Goal:** Re-architect the live view so demand-vs-capacity stays the hero while RP,
research, and mutators read at a glance. Absorbs the "readability" pain point.

**Files**
- `index.html` — restructure the live HUD markup: hero demand/capacity + reserve
  gauge; subordinate rows for cash, RP + funding, satisfaction/strain; persistent
  mutator banner; a dedicated **Research panel** (opens pause-to-plan like Manage).
- `styles/live.css` — redesign tokens/layout; fix chart axes/legend/units/building
  counts (carried-forward v1/v2 pain point); color tokens for new techs.
- `src/live/render.js` — the bulk of the work: render the new HUD, research panel
  (tree with RP balance, funding slider, plain-language node effects, greyed locks),
  mutator banner, improved chart. Keep it a pure painter.
- `src/live/main.js` — wire the Research panel open/close (pauses the clock like
  `openMenu`/`closeMenu`), funding slider → `setRdFunding`, node click → `researchNode`.
- **Juice:** research-breakthrough celebration (flash + ticker), funding-vs-peak
  warning cue, reuse existing screen-shake/vignette hooks.

**Tests** — render is DOM-side (not unit-tested here); add a tiny smoke check that
`render(S)` throws on no required element missing, if feasible. Manual QA checklist in
the PR description.

**Acceptance** — A new player can read demand/capacity, RP, and the active mutator
without squinting; the research panel is self-explanatory; chart axes are labeled.

**PR map** — PR E1: HUD + chart redesign. PR E2: research panel. PR E3: juice.

---

## Phase F — Balance pass

**Goal:** Tune the new systems with data, not vibes.

**Files**
- `tools/balance.mjs` — extend the headless harness to drive RP funding and a
  research policy; roll mutators; report survival curve, typical RP/day, research-
  completion rates, and win-path diversity across many runs.
- `src/live/config.js` + `research.js`/`mutators.js` — tune `rpPerDollar`, node RP
  costs, mutator magnitudes, meta-unlock pace from harness output.

**Acceptance (the v3 "stressful but fair" bar)** — across N headless runs: median
run length lands in the target band; no single research path dominates; each mutator
is survivable from day 1 with the starting fleet; R&D funding is neither a trap nor a
no-brainer (both "fund hard" and "fund light" strategies viable in different mutators).

**PR map** — PR F1: harness extension. PR F2: the tuning commit (data-driven, like the
existing `4d97388`/`10b3a2c` balance commits).

---

## Cut line (if scope must shrink)

- **Must ship (the spine):** A, B, C — research is pointless without content and the
  meta gate.
- **Can slip to v3.1:** D (mutators), E's juice (keep the HUD redesign), F can be a
  lighter pass. The HUD redesign (E core) should not slip — it's half the point.

## Risk register (carried from roadmap §9, with mitigations)

| Risk | Mitigation |
|---|---|
| RP conversion rate breaks pacing | Headless harness in F; expose `rpPerDollar` as a single knob; A2 ships with a deliberately conservative rate. |
| Three progression systems overload the player | E's HUD redesign + plain-language node text; keep meta skills (6) vs. research (tree) visually distinct. |
| A mutator is unwinnable | Fairness invariant test in D; day-1 survivability per mutator. |
| Demand-response breaks clearing | Shave applied to demand *before* `dispatchHour`; clamp demand ≥ 0; engine test. |
| Multi-storage refactor breaks battery accounting | Isolated in its own PR (B2) with tests before any storage research builds on it; distribute `hr.stack.battery` proportionally so no unit drains negative; always keep ≥1 battery. |
| Save migration loses player progress | KEY bump with explicit forward-migration + a migration test before C merges. |

## Full PR sequence (review order)

A1 → A2 → B1 → B2 → B3 → B4 → C1 → C2 → D1 → D2 → E1 → E2 → E3 → F1 → F2.
Each is independently reviewable, test-green, and leaves the game playable.
