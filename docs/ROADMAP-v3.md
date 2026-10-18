# Grid Operator v3 — Design & Roadmap

**Theme:** The real-time grid-balancing roguelike grows a brain. v2 proved the core
loop is tense and fun; v3 adds **strategic depth and run-to-run variety** on top of
it. The headline is a live **research tech tree** — you decide, mid-run, how to bend
your grid's future — backed by **per-run mutators** so every run throws a different
problem at you. Still entertainment-first. Still zero-backend, web-only.

Scoped from a planning interview (2026-10-17). This is the *what* and *why*;
implementation details come later.

---

## 1. Where v3 starts (what v2 already shipped)

v2 is a complete real-time roguelike and the foundation v3 builds on — **not**
something v3 replaces:

- Live 24h clock, continuous merit-order dispatch, retail-priced live cash flow.
- Reserve-margin gauge, strain meter (earned deaths), satisfaction erosion.
- Deep maintenance: wear, random trips, service vs. gamble, salvage/decommission.
- In-run cash sinks: **build** catalogue + **Mk I–III upgrades**.
- Roguelike meta: end-of-run score → meta-currency → a **6-node passive skill tree**;
  milestones; `localStorage` persistence.
- Juice + a demand-vs-capacity chart.

**The keepers:** the verified dispatch engine, the two existing economies (in-run
cash, cross-run meta-currency), the fail-state tension. v3 adds a **third in-run
resource** and a **variety engine** without touching those foundations.

---

## 2. Design pillars (inherited + new)

1. **Entertainment over everything.** (unchanged from v2)
2. **Tension is the product.** (unchanged) — v3's job is to keep the peak scary
   *while* giving the player more meaningful things to do between peaks.
3. **Depth without clutter.** New systems must read at a glance under pressure. If
   the research tree or mutators make the HUD noisier, they've failed. Hence the
   **full HUD redesign** is part of the same release, not a follow-on.
4. **Every run is a different problem.** Repetition is the enemy. Per-run mutators +
   branching research paths mean no two runs play the same.
5. **Roguelike mastery compounds.** Meta-progression now gates *what you can
   research*, so the game visibly opens up the more you play.

---

## 3. The marquee — the Research Tech Tree

A live, in-run tech tree. Its three jobs, in the player's words:

> **Research makes upgrades more powerful, unlocks new tech, and improves current tech.**

So research is **orthogonal to** — not a replacement for — the existing Mk I–III
upgrades and the meta skill tree. It's a third lever that *multiplies* the other two.

### 3.1 Research Points (RP) — the fuel

- **A new in-run resource**, separate from cash and meta-currency. Resets each run.
- **Earned by funding an R&D lab**: the player diverts in-run **cash into R&D**, which
  converts to RP over time. A deliberate, continuous tradeoff — *money to keep the
  lights on now, vs. tech that pays off later.* The player sets/tunes the funding
  rate; RP accrues on the clock.
- Tension hook: funding R&D during a calm overnight window is smart; funding it
  into the teeth of the evening peak is how you brown out. The lever itself is a
  risk decision.

### 3.2 What research does (three effect types)

| Effect | Example |
|---|---|
| **Amplify upgrades** | A node that makes every Mk tier give +35% capacity instead of +25%, or halves upgrade cost. |
| **Unlock new tech** | Research SMR / CCS / grid storage / demand response before you can build them (see §4). |
| **Improve current tech** | Flat buffs to what you already run — lower spin cost, slower wear, higher battery round-trip efficiency, faster peaker starts. |

### 3.3 Meta-currency gates the tree (persistence model)

- Research **fully resets each run** — you re-research from scratch every time (keeps
  the in-run tech race tense and clean).
- **But meta-currency permanently unlocks which tech is *on* the tree.** Early runs
  show a small research tree; as you spend meta-currency between runs, deeper and
  more exotic branches become *researchable*. The game visibly expands run over run.
- This replaces/absorbs nothing in the current 6-node skill tree. The meta "unlock
  the tree" nodes live in **their own tab** on the Skills screen, kept visually and
  conceptually distinct from the 6 passive skills (decided).

### 3.4 Tree shape

- **Branching, not linear.** A run can't research everything (RP is scarce vs. a
  day's cash), forcing a path: storage-and-clean vs. advanced-baseload vs.
  efficiency-everything. Different paths = different runs (variety lever #2).
- Nodes have prerequisites; a handful of **capstone** techs sit deep enough that
  reaching one is itself a run goal.

---

## 4. New technologies (the content)

All four families are in v3 scope, unlocked via the meta gate and researched in-run:

1. **Grid-scale storage** — bigger / longer-duration batteries, pumped hydro. Shift
   midday solar into the evening peak. Leans hard into the core dispatch puzzle.
2. **Demand response / smart grid** — the first **demand-side** lever: pay to shave
   the peak itself (curtail industrial load, smart thermostats). Novel because every
   other tool in the game adds supply; this subtracts demand.
3. **Advanced generation** — SMR (small modular reactors), CCS (carbon capture on
   coal/gas), geothermal baseload. New build options and the main way to beat the
   escalating carbon price.
4. **Transmission & efficiency** — lower line losses, faster ramp/start, higher
   reserve efficiency. Compounding quality-of-life multipliers.

---

## 5. The variety engine — Per-run mutators

The main weapon against mid-game repetition, working with branching research.

- At run start (and/or escalating during a run), conditions are **rolled**:
  - **Fuel-price spike** — gas/coal marginal cost jumps, re-sorting the merit order.
  - **Drought** — hydro/pumped-storage output cut.
  - **Heat wave / cold snap** — demand curve spikes and shifts.
  - **Renewable lull** — extended low-wind or overcast stretches.
  - (and more — this is a deck that grows over versions)
- Mutators are **legible and announced** — the player sees "Heat Wave: +18% peak
  demand this run" and adapts their research/build plan around it.
- Interaction with research is the point: a drought run rewards a demand-response or
  storage path; a fuel-spike run rewards clean-generation research. The mutator tells
  you *which tech tree branch matters this run.*

---

## 6. UX & visualization — full HUD redesign

v3 re-architects the live view rather than patching it, because three new concepts
(RP, the research tree, active mutators) have to coexist with the existing demand/
capacity/reserve/cash/satisfaction read without overwhelming it.

- **Re-architected live HUD** — demand vs. capacity stays the hero read; RP, R&D
  funding, and active mutators get first-class but subordinate placement.
- **Research panel** — opens pause-to-plan like the Manage panel; shows the tree,
  RP balance, funding slider, and what each node does in plain language.
- **Mutator banner** — persistent, legible indicator of what's modifying this run.
- **Chart/legend cleanup** — carry the readability work forward; clear axes, units,
  legends, building counts (the long-standing v1/v2 pain point).
- **At-a-glance everywhere** — the player should never squint to know their state.

---

## 7. What changes under the hood

The v2 architecture (split ES modules, no build step, tested dispatch engine) holds.
v3 extends it; it does not rewrite it.

- **`sim.js`** gains RP accrual, R&D funding state, active-research state, and mutator
  state applied to the per-tick step.
- **New `research.js`** (pure, mirrors `meta.js`): the tech-tree definition, node
  effects, RP costs, and the meta-unlock gating — no DOM, no state mutation beyond
  what callers pass.
- **New `mutators.js`** (pure): the mutator deck, roll logic, and how each mutator
  modifies demand/cost/output. Testable in isolation.
- **`config.js`** gains RP tuning (cash→RP conversion rate, node costs) and mutator
  magnitudes.
- **`meta.js`** gains the "unlock research branch" meta nodes and a bigger scoring
  input (clean-energy share, tech reached) if desired.
- **`render.js` (live)** — the HUD redesign + research panel + mutator banner.
- **Tests** — `research.test.mjs`, `mutators.test.mjs`; extend `sim.test.mjs` for RP
  accrual and mutator application. The engine stays untouched and stays verified.
- **Still zero-backend, local-only.** No server, no leaderboard this version.

---

## 8. Recommended phasing

> Research is the spine; build it first, then feed it content and variety, then make
> it all read beautifully. Each phase is independently shippable/testable.

- **Phase A — Research core.** RP resource, R&D-lab funding lever, a minimal in-run
  research tree with the three effect types (§3.2) wired into the existing upgrade/
  tech stats. Prove the money-now-vs-tech-later tradeoff is a fun decision.
- **Phase B — Tech content.** The four new tech families (§4) as researchable +
  buildable options. Flesh out the tree's branches and capstones.
- **Phase C — Meta gating.** Meta-currency nodes that unlock research branches;
  persistence so the tree visibly grows across runs. Tune the unlock curve.
- **Phase D — Variety engine.** The mutator deck (§5), roll logic, escalation, and
  the interaction between mutators and research paths.
- **Phase E — Full HUD redesign & juice.** Re-architect the live view around all of
  the above; research panel, mutator banner, chart cleanup; celebrate research
  breakthroughs with juice.
- **Phase F — Balance pass.** Headless harness (extend `tools/balance.mjs`) across
  the new systems; tune RP rates, node costs, mutator magnitudes, meta-unlock pace.

---

## 9. Open questions & risks

- **RP tuning is the whole game.** Cash→RP conversion rate decides whether R&D is a
  trap or a no-brainer. Too cheap and research trivializes runs; too dear and nobody
  funds it. Needs the balance harness early.
- **Tree vs. tree confusion.** Three progression systems (Mk upgrades, meta skills,
  research) risk conceptual overload. The HUD redesign must make their *distinct
  jobs* obvious. (Resolved: meta "unlock research" nodes live in their own tab, not
  inside the 6-node skill tree.)
- **Mutator fairness.** A mutator must be a *different* problem, never an unwinnable
  one. Each needs a research/build answer the player can reach in time.
- **Demand-response modeling.** Subtracting demand is new for the engine — needs care
  so it doesn't break the merit-order clearing or let the player cheese the peak away.
- **Scope creep.** "Major expansion" across six phases is v2-sized. Guard the cut
  line: Phases A–C are the must-ship spine; D–F can slip to v3.1 if needed.

---

## Appendix — decisions locked in the interview

| Topic | Decision |
|---|---|
| Marquee feature | In-run research tech tree |
| Scope | Major, multi-phase expansion |
| Online / backend | None — stays zero-backend, local-only |
| Top pain points to fix | HUD readability; mid-game repetition |
| Research currency | New in-run Research Points (RP) |
| How RP is earned | Fund an R&D lab with in-run cash (cash sink → RP) |
| Research persistence | Resets each run; meta-currency unlocks *which* tech is researchable |
| Research's role | Amplify upgrades, unlock new tech, improve current tech (≠ the Mk upgrades) |
| New tech families | Grid storage · demand response/smart grid · advanced gen (SMR/CCS/geothermal) · transmission & efficiency |
| Anti-repetition | Per-run mutators (fuel spike, drought, heat wave, renewable lull…) |
| HUD | Full redesign around the new systems |
| Platform | Web only; no build step; split ES modules (unchanged) |
