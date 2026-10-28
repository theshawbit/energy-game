# Grid Operator v5 — "The Persistent Grid" — Program Spec

> **Status: SCOPED via design grill, 2026-10-27. Not yet built.**
> This is a **major genre pivot**, driven by a one-question-at-a-time design grill plus
> real playtester feedback. v5 moves Grid Operator from a **survival roguelike** to a
> **persistent management / operations sim**. This doc is the parent program spec; it
> **supersedes** the roguelike framing in [PLAN-v5.1-progression.md](PLAN-v5.1-progression.md)
> (now legacy — may be removed). The storyline bibles
> ([STORYLINE-v5-new-veridia.md](STORYLINE-v5-new-veridia.md),
> [STORYLINE-v5-script.md](STORYLINE-v5-script.md)) still apply as a **later** flavour layer
> and fit *better* now (a persistent city is a stronger narrative home than a throwaway run),
> but their `Mk`-ladder references must be reconciled to the KPI/axis model below.

---

## Why the pivot

The v4.2.x interface pass is done and the game is legible. Pushing into v5 "Identity &
Progression," two things converged:

1. **Playtester feedback (2026-10-27)** — top to bottom, it asked for management-sim
   mechanics: a slower clock, operate-a-week-then-manage, construction lead times,
   dial-able plant output (peakers dissolving into tunable gas), greatly expanded
   maintenance, and condition broken into multiple KPIs.
2. **Owner's genre doubt** — "not sure I'm still in love with the roguelike genre."

Both pointed the same way. The feedback is management-sim vocabulary; none of it is
roguelike. The game was outgrowing its frame. v5 embraces that: **you own and grow one
grid over a long horizon, and keep a growing city powered.**

`engine.js` remains **sacred** — `dispatchHour()` + `marginalCost()` untouched. All v5
systems flow through state, config knobs, and the pure-module pattern, exactly as before.

---

## 1. Identity, goal, stakes

- **Genre:** persistent management / ops sim. One grid, owned and grown. **No run reset.**
- **Goal:** **keep a growing city powered.** Demand keeps rising (reuses the existing
  daily-growth curve) and *is* the scoreboard. There is **no hard win** — thriving is the
  reward, and the grid growing bigger/harder is the natural difficulty ramp.
- **Stakes:** failure = **stagnation + escalating pain, never removed.** Chronic blackouts
  or insolvency make the city stop growing (demand stalls/shrinks), draw regulator fines,
  tighten credit, and dry up favourable terms. **No permadeath, no game-over** — the only
  way out of a hole is to earn your way out.

## 2. The core loop & the clock

- **Hard-phase loop:** a live **5–7 day operating week** → time **pauses** → a **planning
  window**. During the week you dispatch and react live; you **cannot restructure the
  fleet** (build, specialize, schedule maintenance, spend) until the week closes and the
  planning window opens. This cleanly separates *operate* from *manage* — and means deep
  management no longer has to happen at speed.
- **The clock (live week):** variable speed — **pause / 1× / fast-forward**. The clock
  **auto-pauses on critical events** (a trip, imminent blackout, a notable offer) so the
  player can fast-forward dull hours with confidence they'll never miss the moment that
  matters. **Pause is read-only:** you can freeze to study the board, but dispatch orders
  must be issued with the clock running — the live week stays a genuine shift. 1× tuned so
  a game-day reads comfortably (~60–90s/day; a 7-day week ≈ 7–10 min at 1×, less floored).

## 3. The fleet

- **Dispatch model:** the player sets **unit commitment** (online/offline) and each unit's
  **output band** (min/max via a dial). The engine's merit order economically **clears
  within those constraints**. The player is the operator setting the board, not computing
  every MW — so `engine.js` stays sacred, the dial feels real, and it scales as the fleet
  grows. **The dedicated peaker unit dissolves** into dial-able gas (fast, tunable gas is
  just a plant you run up and down).
- **Four axis-aligned KPIs per asset** (replacing the single condition %):

  | Axis (upgrade) | KPI it governs |
  | :--- | :--- |
  | Quality | **Reliability** — trip risk / mechanical health (≈ today's condition) |
  | Efficiency | **Efficiency** — heat rate → $/MWh & fuel burn |
  | Performance | **Output** — effective max MW / derate |
  | Flexibility | **Flexibility** — ramp speed + min stable load |

  Assets *have* these four; you *maintain*, *upgrade*, and *research* along the same four.
  One vocabulary end to end.
- **Degradation keystone:** **how you run a plant drives which KPIs degrade.** Sustained
  high load wears Reliability & Output; running at part-load / min-load erodes Efficiency;
  frequent ramps and starts beat up Flexibility & Reliability. Your live-week dispatch
  **writes the maintenance bill** you open in the planning window — operate and maintain
  become one feedback loop.
- **Construction = lead-time projects.** New plants are multi-week capital projects (gas
  fast, nuclear slow); you commit capital in the planning window and the plant produces
  **nothing until it comes online**. You must **build ahead** of the rising demand curve or
  the growing city browns you out. This makes demand **forecasting** a real planning skill.
  (No concurrent-build cap for now — cash is the throttle.)

## 4. Maintenance

- **Per-KPI standalone tasks** (overhaul → Reliability, retune → Efficiency, uprate →
  Output, recalibrate → Flexibility), not one "service" button.
- **Limited by crews + downtime.** You have finite **crew capacity** per planning window
  and each task takes the unit **offline** for a time — so you can't keep everything
  pristine; you **triage** which plants and which KPIs get attention. The scheduling *is*
  the game, and there's real tension: you can't maintain the plant you need running.
- **Crews** are **fungible capacity** (N tasks/window). Hire more with **cash** (an ongoing
  wage = standing cost); **⚡** raises the crew ceiling. (Specialized or leveling crews are a
  possible later layer, deliberately deferred.)

## 5. Progression & economy — three clean lanes

| Currency | Lane | Earned by | Spent on |
| :--- | :--- | :--- | :--- |
| **Cash** | *Act now* | Regulated tariff + performance | Build, maintain, hire crews, per-asset upgrades |
| **RP** | *Unlock what's possible* | R&D funding (divert cash → RP; carries over) | Research tree: raise axis ceilings + unlock new tech |
| **⚡** | *Expand your reach* | Growth tiers + achievements | Permanent capacity: crew slots, control-room perks, **automation**, unlock research branches |

- **Economy = regulated utility, not merchant.** You earn a **tariff per MWh served** to the
  city; your four KPIs *are* your margin — Reliability earns performance bonuses, Efficiency
  (cost) and Emissions set your affordability/clean standing, which adjust your rate and
  trigger fines. Revenue scales with the growing city, so keeping up **pays**. This
  **retires the merchant spot market, term contracts, and the Desk**, and folds carbon
  pricing into the emissions-performance incentive.
- **Specialization (per-asset, cash):** upgrades run along the four axes with **free
  development but steepening per-axis cost**, so plants **emergently specialize** (1–2 axes)
  rather than hard-committing. RP raises their ceilings; ⚡ unlocks branches. *(This reverses
  the legacy PLAN-v5.1 "strict one-branch-per-run + named-archetype-at-commit" locks, which
  assumed resets.)*
- **Automation-as-progression:** because the fleet grows to dozens of plants, ⚡ perks
  include **automation** (auto-maintenance à la the old Service Manager, dispatch assists) —
  growing earns you the leverage to keep running what you've grown.
- **RP tree shape:** **per-family axis ladders + capability unlocks.** Capability unlocks add
  new buildable tech (SMR, geothermal, CCS, advanced storage); per-family axis ladders
  ("Coal · Reliability II") raise that family's ceiling on an axis plus a small fleet-wide
  baseline. Each fuel keeps a **curated subset** of the four axes (its character).

## 6. World & events

- **Challenge = ongoing dynamic weather + market systems.** No run-start mutator roll;
  instead heatwaves, cold snaps, droughts, wind lulls, and fuel-price shocks occur
  dynamically across the weeks, **forecastable with lead time**, with **season** modulating
  the odds. The old mutators live on as recurring **event types** (their magnitudes reused),
  and this extends the existing forecast system into event lead-time — which dovetails with
  "build ahead."
- **Named city now, rich identity later.** The city is load-bearing (it's the goal + the
  scoreboard), so it gets a **name and a growth-tier structure** in the first v5 build —
  enough for ⚡/achievements to hang on. The full **New Veridia** world (districts, lore) and
  the **C.A.S.S.** narrator (full surface, **toggleable**, default **minimal** so it never
  nags) land as a **later flavour layer**, once the loop is proven.

## 7. UI architecture

**Two distinct modes**, matching the hard-phase loop:
- **Operating Room** (live) — the dispatch board: fleet with dials/bands, the net-load
  curve, KPI lamps, alerts and auto-pause surfacing. Extends the shipped v4.2 Control Room.
- **Planning Office** (paused) — build queue, maintenance scheduling (crews), per-asset
  upgrades/specialization, research, ⚡ perks, and the weekly performance review.

Keeping them separate honors the owner's paramount principle — *the UI must never frustrate*
— by keeping each screen focused and uncluttered.

---

## What v5 retires or rebuilds (teardown log)

- **Roguelike scaffolding:** run resets, "days survived" scoring, bankruptcy = game-over,
  the per-run mutator roll, ⚡-earned-by-ending-runs. *(⚡ itself survives, re-earned by
  growth/achievements.)*
- **Merchant economy:** spot market, term contracts, the Desk, buyer offers, hedging →
  replaced by the regulated tariff + performance model. `finance.js` reworked accordingly.
- **Peaker unit type** → dial-able gas.
- **Single condition %** → four KPIs.
- **Single "service"** → per-KPI maintenance tasks + crews.
- **Linear Mk tier** → per-asset axis upgrades (emergent specialization).
- **The 6 ⚡ meta-skills** → designed fresh (old set is reference only).
- **Storyline docs' `Mk` references** → reconcile to the KPI/axis language when the
  narrative layer is built.

## Deferred / open (not blockers — settle at build)

- Specialized / leveling crews (if fungible capacity proves too flat).
- Concurrent-build cap (if unlimited-but-cash-gated expansion feels off).
- World-tone decision (moor/rust-belt names vs. New Veridia megacity — **parked**).
- Exact tuning: day length, tariff/performance formula, KPI degradation rates, crew counts,
  per-axis cost curves, research ceilings, event odds & seasonality. All central in
  `config.js`, harness-checkable.

## Build sequencing (tentative — each slice its own PR, reviewed before merge)

This is effectively a new game on the sacred engine; multi-week is expected.

1. **Time & loop skeleton** — hard-phase operate/plan loop + the variable/auto-pause clock
   (the two-mode shell).
2. **Dial-able dispatch** — commitment + output bands feeding the merit order; retire the
   peaker type.
3. **KPIs & degradation** — four KPIs + operating-style-driven decay.
4. **Maintenance & crews** — per-KPI tasks, crew capacity, downtime.
5. **Construction lead times** — the build queue + demand forecasting.
6. **Regulated economy** — tariff + performance; retire the merchant layer.
7. **Progression** — per-asset specialization (cash), research tree (RP), ⚡ perks +
   automation.
8. **Events & world** — dynamic weather/market + seasons; named city + growth tiers.
9. **Narrative layer** — New Veridia identity + C.A.S.S. (reconciling the storyline docs).

Balance-harness passes interleave throughout; `engine.js` stays untouched.

---

*Authored from the v5 design grill, 2026-10-27. Supersedes the roguelike framing of
PLAN-v5.1. Playtester feedback is living input and will keep evolving — treat this spec as
the current best shared understanding, not frozen.*
