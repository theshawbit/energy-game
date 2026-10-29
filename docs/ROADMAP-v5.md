# Grid Operator v5 — "The Persistent Grid" — Program Spec

> **Status: SCOPED via design grill. Not yet built.**
> First grilled 2026-10-27 (the genre pivot); **refined in a full design grill 2026-10-28**
> that set the time base, the economy, the operating surface, and the tone. This doc is the
> parent program spec. It **supersedes** the roguelike framing in
> [PLAN-v5.1-progression.md](PLAN-v5.1-progression.md) (legacy — may be removed). The storyline
> bibles ([STORYLINE-v5-new-veridia.md](STORYLINE-v5-new-veridia.md),
> [STORYLINE-v5-script.md](STORYLINE-v5-script.md)) remain a **later flavour layer**; their
> roguelike *succession-loop* framing is dead (no resets now), but the **setting** survives and
> fits better than ever (a persistent city is a stronger narrative home than a throwaway run).
> `engine.js` stays **sacred** throughout — `dispatchHour()` + `marginalCost()` untouched.

---

## Why the pivot

The v4.2.x interface pass is done and the game is legible. Two forces converged pushing into v5:

1. **Playtester feedback (2026-10-27)** asked, top to bottom, for management-sim mechanics: a
   slower clock, operate-then-manage rhythm, construction lead times, dial-able output, deep
   maintenance, and condition split into multiple KPIs.
2. **Owner's genre doubt** — "not sure I'm still in love with the roguelike genre."

Both pointed the same way: the game had outgrown the survival-roguelike frame. v5 embraces that —
**you own and grow one grid over a long horizon and keep a growing city powered** — while keeping
the roguelike's *texture* (spice, progression, consequence) and dropping its *structure* (runs,
resets, permadeath).

---

## 1. Identity, seat, stakes

- **Genre: ops sim with roguelike *texture*, not structure.** One persistent grid, never reset.
  It keeps the *feel* — a procedural/forecastable event deck for variety, the ⚡ meta-layer as a
  progression spine, a repeating operational beat — but there are **no runs, no reset, no
  permadeath.**
- **Seat: owner-operator / market participant.** You have **total authority inside your fence**
  (build, dispatch, R&D, crews, capital, which contracts you sign) and **near-zero authority
  outside it** — you do **not** set demand, the price mechanism, or policy. The mastery is running
  a great operation against conditions you can only forecast and adapt to.
- **Goal: keep a growing city powered.** Demand keeps rising (reuses the daily-growth curve) and
  *is* the scoreboard. **No hard win** — thriving is the reward; a bigger, harder grid is the ramp.
- **Stakes: cut-throat, but no permadeath.** Failure = **stagnation + escalating pain, never
  removed** — chronic blackouts or insolvency stall the city's growth, draw fines, tighten credit,
  dry up favourable terms. You can wreck a *quarter*, never the *save*; the only way out of a hole
  is to earn it.

## 2. The core loop & the calendar

- **Daily heartbeat.** Each day: a **light auto-brief** (today's forecast peak, the active event
  regime, your reserve margin) → a **~3-minute live shift** (you tune the grid against the volatile
  net-load curve and events) → a **one-line flash** (load met? today's cash). Fast and tactical.
- **The calendar: Year ▸ Quarter ▸ Day.**
  - **Quarter = season = fiscal period** (~22 game-days — a ×4 compression of a real 90-day
    quarter). It carries the weather/event regime (Q1 winter peak, Q3 summer peak) **and** the
    earnings cadence. It **ends in the heavy, scored board review**: the overlord's KPI verdict,
    PnL, capital/build decisions, and maintenance scheduling.
  - **Year** = the long arc. **Demand steepens year-over-year** — this is the difficulty ramp and
    the "chapter" progression. (KISS: no separate demand-tier system.)
- **Two-tier rhythm.** Days are **light & tactical**; **deep planning is batched to quarter-ends.**
  ~22 quick days + one heavy review per quarter (~35–40 min/quarter, ~2.5 hr/year, resumable via
  saves). Automation unlocks trim the per-day effort as the fleet grows, keeping the load humane.
- **The clock.** 1× is tuned to a **~3-minute engaged day (~180s, ≈4× slower than today's 48s)** so
  stressors *breathe* — a trip warning becomes ~12 real-seconds, a peaker spin-up ~12s, enough to
  read-decide-act with intent instead of twitching. Variable speed (pause / 1× / fast-forward) with
  **auto-pause on crisis** lets you skip calm hours and never miss the moment that matters. **Pause
  is read-only.** *Re-tune caveat:* some constants are written in real-seconds (`strainRate`,
  `strainRecover`, `bankruptcyGrace`) and won't auto-scale when `secondsPerDay` changes — a
  balance-harness pass is required.

## 3. The fleet — dispatch, dials, KPIs

- **Dispatch = set the board, engine clears within it.** You set each unit's **commitment**
  (on/off) and **output band** (min/max), and the merit order economically clears inside those
  constraints — so `engine.js` stays sacred, the dials feel real, and it scales. **The dedicated
  peaker dissolves** into dial-able gas (fast, tunable gas is just a plant you run up and down).
- **Core+ live dials (4 per asset)** — each plugs into a locked system, no fiddle-for-fiddle:
  1. **Commitment** — online / offline.
  2. **Output band** — the moveable min/max range (from playtester feedback).
  3. **Reserve hold** — how much headroom you keep *available* (earns the **capacity floor**) vs.
     push into the **market swing** (PnL). → works the hybrid economy.
  4. **Push / intensity** — run *hard* (more output & PnL now, faster wear) vs. *easy* (gentle,
     preserves KPIs). → feeds the degradation keystone.
  *Design rule: layered, opt-in, automatable* — sane defaults, experts dig, ⚡ automates late-game.
  (Richer dials — ramp/cycling posture, mode presets, multi-fuel — are a deliberate *later* tier.)
- **Four axis-aligned KPIs per asset** (replacing the single condition %):

  | Axis (upgrade) | KPI | Governs |
  | :--- | :--- | :--- |
  | Quality | **Reliability** | trip risk / mechanical health (≈ today's condition) |
  | Efficiency | **Efficiency** | heat rate → $/MWh & fuel burn |
  | Performance | **Output** | effective max MW / derate |
  | Flexibility | **Flexibility** | ramp speed + min stable load |

  Assets *have* these four; you *maintain*, *upgrade*, *research*, and *earn* along the same four.
- **Degradation keystone.** **How you run a plant drives which KPIs degrade.** Sustained high load
  (Push) wears Reliability & Output; part-load erodes Efficiency; frequent ramps/starts beat up
  Flexibility & Reliability. **Your live-day dispatch writes the maintenance bill** you open at the
  quarter-end review — operate and maintain are one feedback loop.

## 4. Maintenance & crews

- **Quarter-end only — cut-throat.** All maintenance is scheduled at the quarterly board review:
  you triage a whole quarter's accumulated wear, assign crews, tasks resolve over the next quarter
  (downtime). A plant that degrades or trips **mid-quarter you must operate around** for up to ~22
  days — **no emergency buy-out.** The triage is the game, and the Push dial now has real teeth.
- **Per-KPI tasks** (overhaul → Reliability, retune → Efficiency, uprate → Output, recalibrate →
  Flexibility) — not one "service" button.
- **Crews = a soft-specialized, fungible, levelling pool.**
  - **Soft-specialized:** each crew has a *trade* it's best at (mapped to a KPI task); it can take
    *any* task (fungible — never hard-blocked at triage) but works **off-trade at a penalty**.
  - **Levelling:** crews improve **passively through use**, deepening their edge; **⚡** promotes
    standouts and raises the roster ceiling. No new economy — it routes through the existing ⚡ lane.
  - Grown with **cash** (ongoing wage = standing cost) and **⚡** (ceiling + promotions).

## 5. Construction

- **Lead-time projects.** New plants are multi-quarter capital projects (gas fast, nuclear slow);
  you commit capital at a quarter-end and the plant produces **nothing until it comes online**. You
  must **build ahead** of the steepening demand curve or the growing city browns you out — which
  makes demand **forecasting** a real planning skill.
- **Overextension soft-cap.** No hard limit on concurrent builds, but push past a comfortable count
  and projects **slip** — higher overrun cost + delay risk. And **under a rising demand curve a
  delayed plant is a brownout**, so overreach bites back, cut-throat style, with no arbitrary cap
  and no new resource.

## 6. Economy & progression

- **Hybrid revenue — a regulated floor + a market swing.** You earn a regulated **capacity floor**
  (paid to keep capacity *ready*, so the city is never left uncovered) **plus** a live **market
  swing** you work for PnL. This **revives** shipped modules rather than deleting them:
  `market.js` (the scarcity-driven spot swing), `finance.js` (term contracts/hedging), and
  `capacity.js` (already models availability pay + breach fines ≈ the regulator's floor).
- **KPI → money mapping (clean, axis-aligned — one vocabulary end to end):**

  | KPI | Revenue surface it drives |
  | :--- | :--- |
  | **Reliability** | the **capacity floor** — counted-on availability earns the payment, dodges breach fines |
  | **Efficiency** | **market-swing margin** — lower $/MWh = fatter margin on everything sold |
  | **Output** | **sellable volume** — the MW ceiling scales both the floor commitment and swing push |
  | **Flexibility** | **swing capture** — a nimble fleet rides volatility (ramp into spikes, back off in troughs) |
  | *(Emissions)* | the overlord's **"clean standing"** — folded into the quarterly verdict + carbon pressure |

  So the dial you Push degrades a specific KPI that maps to a specific income stream — you *feel*
  exactly what you traded away.
- **Three money-surfaces** settle the loop: the **capacity floor** (availability), the **market
  swing** (spot PnL), and the **overlord's quarterly verdict** (KPI assessment → adjusts your rate,
  hands bonuses/fines).
- **Mid-quarter crisis toolkit** (your only recourse until repairs — earned & penalised, nothing
  free): **deliberate load-shedding** (a *controlled* brownout — cut pre-prioritised non-critical
  load to dodge a cascading blackout; reuses the shipped brownout/blackout mechanic) and **demand
  response** (shave the peak — *only if you built/contracted it ahead*; plugs into the demand-response
  research branch).
- **Three currency lanes:**

  | Currency | Lane | Earned by | Spent on |
  | :--- | :--- | :--- | :--- |
  | **Cash** | *Act now* | Floor + swing | Build, maintain, crew wages, per-asset upgrades |
  | **RP** | *Unlock what's possible* | Divert cash → R&D | Research tree: raise axis ceilings + new tech |
  | **⚡** | *Expand your reach* | Growth tiers + achievements | Crew slots & promotions, control-room perks, **automation**, unlock research branches |

- **Automation-as-progression.** Because the fleet grows to dozens of plants, ⚡ perks include
  **automation** (auto-maintenance, dispatch assists) — *deliberately gated to late-mid/end game*.
  The player feels the scaling burden first, then **earns the relief**. ⚡ is less "power-ups" and
  more "**progressively hiring your operations staff**." (This is the mechanical answer to the
  genre's churn risk: a growing fleet + contract book must never become clerical.)
- **Specialization (per-asset, cash).** Upgrades run along the four axes with **free development
  but steepening per-axis cost**, so plants **emergently specialize** rather than hard-committing.
  RP raises ceilings; ⚡ unlocks branches. *(Reverses the legacy PLAN-v5.1 "strict one-branch /
  named-archetype-at-commit" locks, which assumed resets.)*

## 7. World & tone

- **Corporate-dystopian, under an uncaring energy-monopoly overlord.** The "regulator" has a face:
  a shadowy monopoly that ratchets quotas and squeezes budgets. The dread, the compromises
  (**"brown out the slums to keep the corporate server farms lit"**), the never-a-thank-you
  pressure *are* the flavour — and they map 1:1 onto the cut-throat mechanics we built. The
  quarter-end verdict is the overlord grading you.
- **Grit → megacity, across the growth arc.** You **start in the Rust District** (the shipped
  moor/foundry fleet names — Blackmoor, Cinderhope, Forgewell, Kilnbrook) and **grow into gleaming
  New Veridia** as demand steepens year over year. You build the future out of the rust — for an
  overlord that always wants more. This preserves every shipped name and reaches the New Veridia
  destination; the aesthetic *is* the progression.
- **Narrative stays a later layer.** This sets *direction* for the thin named-city built first.
  **C.A.S.S.** (deadpan dispatch AI in a brutalist bunker) fits this tone perfectly and ⚡ slots
  into the bible's "Guild Cred"; both land once the loop is proven.
- *Market-research note:* the Gemini SEO pass (2026-10-28) is useful for its **archetype map and
  comparables** (Frostpunk / Papers Please / Lethal Company / Hardspace / Into the Breach) — its
  "Dystopian Megacorp Quota" archetype basically describes this game minus the permadeath — but its
  **quantitative "search demand" claims are not real data** (an LLM can't measure search volume).
  Validate any keyword via Steam tags/wishlists or a real SEO tool before betting on it.

## 8. UI architecture — two modes

Matching the two-tier rhythm:
- **Operating Room** (live day) — the dispatch board: fleet with the four dials, the net-load
  curve, KPI lamps, alerts + auto-pause surfacing, the light daily brief/flash. Extends the shipped
  v4.2 Control Room.
- **Planning Office** (quarter-end) — the scored board review + overlord verdict, build queue,
  maintenance triage (crews), per-asset upgrades/specialization, research, ⚡ perks.

Keeping them separate honours the paramount principle — *the UI must never frustrate* — by keeping
each screen focused.

---

## What v5 retires, revives, or rebuilds (teardown log)

- **Roguelike *structure*:** run resets, "days survived" scoring, bankruptcy = game-over, ⚡-from-
  ending-runs, the storyline succession loop. *(⚡ survives, re-earned by growth/achievements;
  roguelike *texture* — events, progression, consequence — is kept.)*
- **Merchant economy is REVIVED, not retired.** The earlier respec planned to tear out the spot
  market / contracts / capacity market; the hybrid model **keeps all three** as the swing + floor,
  re-framed and re-balanced (`market.js`, `finance.js`, `capacity.js` live on). **Net de-risk.**
- **Peaker unit type** → dial-able gas.
- **Single condition %** → four axis-aligned KPIs (mapped 1:1 to revenue surfaces).
- **Single "service"** → per-KPI tasks, quarter-end only, crew-gated.
- **Weekly operate/plan loop** → **daily** tactical loop inside a **quarterly** planning beat.
- **Linear Mk tier** → per-asset axis upgrades (emergent specialization).
- **The 6 ⚡ meta-skills** → designed fresh (old set is reference only).
- **Storyline docs' `Mk` + succession-loop references** → reconcile to the KPI/axis language and the
  persistent frame when the narrative layer is built.

## Deferred / open (detail & tuning — not foundational, settle at build)

- **⚡ automation specifics** — exactly what auto-runs late-game and at what ⚡ cost.
- **Daily-brief / C.A.S.S. surface** — the later flavour layer.
- **Specialized vs. levelling crew depth** beyond the agreed soft-specialized + passive + ⚡ model.
- **All numerics** — day length (~180s start), ~22 days/quarter, tariff/floor/verdict formulas, KPI
  decay rates, crew counts & wages, per-axis cost curves, event odds & seasonality. Central in
  `config.js`, harness-checkable; the real-second constants need the re-tune pass noted in §2.

## Build sequencing (tentative — each slice its own PR, reviewed before merge)

Effectively a new game on the sacred engine; multi-week is expected.

1. **Time & calendar skeleton** — the daily loop inside Year ▸ Quarter ▸ Day, the ~3-min clock +
   auto-pause, the two-mode shell, the quarter-end review beat.
2. **Dial-able dispatch** — Core+ dials (commitment, band, reserve-hold, push); retire the peaker.
3. **KPIs & degradation** — four KPIs + operating-style-driven decay.
4. **Maintenance & crews** — quarter-end per-KPI tasks, the soft-specialized levelling crew pool.
5. **Construction** — lead-time build queue + overextension soft-cap + demand forecasting.
6. **Hybrid economy** — capacity floor + market swing (re-balance the revived modules) + the
   KPI→revenue mapping + the overlord verdict.
7. **Progression** — per-asset specialization (cash), research (RP), ⚡ perks + automation.
8. **Crisis toolkit & events** — load-shedding + demand response; dynamic weather/market by season.
9. **World & narrative** — named Rust District → New Veridia identity + C.A.S.S. (reconcile bibles).

Balance-harness passes interleave throughout; `engine.js` stays untouched.

---

*Authored from the v5 design grill — pivot 2026-10-27, full refinement 2026-10-28. Supersedes the
roguelike framing of PLAN-v5.1. Playtester feedback is living input and will keep evolving — treat
this spec as the current best shared understanding, not frozen.*
