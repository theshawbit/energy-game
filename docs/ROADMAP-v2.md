# Grid Operator v2 — Design & Roadmap

**Theme:** Real-time grid-balancing **roguelike**. Entertainment-first, dopamine-driven. You keep a growing city powered in real time, die the instant the lights go out, and get stronger across runs.

Scoped from a planning interview. This is the *what* and *why*; implementation details come later.

---

## 1. Design pillars

1. **Entertainment over everything.** Accuracy serves tension and theme, never the other way around. When fun and realism conflict, fun wins.
2. **Tension is the product.** The whole game is **Energy Demand vs. Energy Capacity**, live and hyper-fluid. The player should sweat the evening peak.
3. **Dopamine loop.** Fast, frequent rewards; loud success and louder failure; number-go-up everywhere.
4. **Roguelike mastery.** You lose, you learn, you come back stronger. Skill — the player's and the save file's — is the progression.

---

## 2. Core loop (the new game)

- **Live 24-hour clock.** Time runs continuously in hours; the day cycles (tunable seconds-per-hour). Demand rises toward the evening peak while the player braces.
- **Demand vs. Capacity, in real time.** The central read. Capacity must cover demand every hour.
- **Reserve-margin gauge.** A live headroom indicator ("+8% reserve") that climbs green → amber → red as the peak approaches. Makes every near-miss legible and *earned*.
- **Live cash flow.** Energy sells at the hourly merit-order clearing price; cash accrues as the clock runs (replaces the old annualized batch result).
- **Pause-to-plan.** The clock **pauses when a build/upgrade menu opens** — strategic decisions, real-time execution. Chess with a timer.

### Fail states
| State | Trigger | Consequence |
|---|---|---|
| **Brownout** | Small shortfall (capacity dips just under demand) | **Severe penalty** — flicker warning, reputation/cash hit, short window to recover |
| **Blackout** | Full shortfall | **Instant run over** — dramatic death (see Juice) |

---

## 3. The two economies

| | **Cash** (in-run) | **Meta-currency** (cross-run) |
|---|---|---|
| Earned by | Selling energy, customer-satisfaction bonuses, reliability streaks | Awarded at the **end of each run** (based on milestones reached / score) |
| Spent on | **Tech & Upgrades** — active, direct boosts | **Skills** — permanent passive boosts |
| Persists? | No (resets each run) | Yes (banked across runs) |

- **Tech & Upgrades (cash, active):** incremental tiers tied to a tech system — e.g. Coal Mk I → Mk II → Mk III — each improving **capacity, efficiency, and running cost**. Bought with in-run cash.
- **Skills (meta, passive):** bought between runs with earned currency; permanent modifiers (e.g. "+5% battery efficiency," "cheaper repairs," "slower demand growth") that make the player start stronger each run.

---

## 4. Escalation — how a run cranks up

A run is **endless**: survive the ramp, chase a high score, die to a blackout.

- **Relentless demand growth** — population and economic activity push load up continuously.
- **Event pressure** — trade conflict, war, weather/seasons, and surprise outages spike demand or cut supply.
- **Milestones** as the near-term goals: **energy-demand milestones** and **profit milestones** (kept simple for v2; expandable later).

---

## 5. Maintenance (deep, by design)

- Plants degrade and suffer **random outages** that yank capacity offline — ideally mid-peak, for maximum stress.
- **Repairs cost cash + downtime.** You choose when to pull a plant for service vs. gamble it holds.
- High stress, high reward: surviving an outage during a peak should feel like a heist pulled off.

---

## 6. Juice & feedback (dopamine delivery)

- **Failure is dramatic:** screen shake, burning cash, buildings going dark, crisis framing on brownout → blackout.
- **Success is celebrated:** streak rewards for consecutive reliable days, customer-satisfaction cash bonuses, satisfying cash-up animations.
- Legible, punchy feedback on every state change.

---

## 7. UX & visualization

- **Readable chart redesign** — fix the current unreadable axes; clear labels, units, and legend. (Direct pain point from v1.)
- **Live HUD gauges:** demand vs. capacity, reserve margin, cash, the clock.
- **Display building counts** and clear keys/legends throughout.
- More at-a-glance visualizations so the real-time state is readable without squinting.

---

## 8. What changes under the hood (from the MVP)

The MVP's verified **merit-order dispatch** economics are the keeper; the *framing* changes from batch to live.

- **Engine:** representative-day batch → **continuous per-tick (hourly) simulation**. Dispatch runs each tick; clearing price and cash update live.
- **Re-tune the money.** Costs/revenues were annualized; they move to live per-hour flow and need rebalancing for pacing.
- **Run lifecycle & state machine:** running / paused-in-menu / brownout-warning / dead.
- **Persistence:** browser `localStorage` for skills + high scores. **Web-only, local-only for now** (global leaderboard is a later, server-backed feature).

---

## 9. Recommended phasing

> Build the *feel* first — the real-time core is make-or-break. Everything else layers on once it's fun.

- **Phase A — Real-time core (the gamble).** Live clock, continuous dispatch, demand/capacity + reserve-margin gauges, brownout penalty, blackout death. If this doesn't feel tense, nothing else matters. Prove it first.
- **Phase B — In-run progression.** Tech/upgrade tiers (cash sink) + deep maintenance/outages.
- **Phase C — Roguelike meta.** End-of-run currency, skill tree, `localStorage` persistence, run milestones.
- **Phase D — Juice & polish.** Screen shake, darkening, streak/satisfaction rewards, chart & visualization redesign, optional sound.
- **Phase E — Backlog / later versions.** Sell excess energy / trading markets, global leaderboard (needs backend), challenges, more energy types, other platforms.

---

## 10. Open questions & risks

- **Pacing/accuracy tension:** real-time live cash needs a re-tune so numbers feel good at second-to-second speed without breaking the economic logic.
- **Difficulty curve:** tuning the demand ramp + event frequency so runs are "stressful but fair," and brownout is a real recovery window, not a death sentence.
- **Tick rate:** seconds-per-hour that maximizes tension while staying readable.
- **Code structure:** stay a single self-contained HTML file, or introduce light module structure / a small engine now that it's a real project?
- **Scoring formula:** what exactly converts a run into meta-currency.

---

## Appendix — decisions locked in the interview

| Topic | Decision |
|---|---|
| Primary goal | Dopamine rush; entertainment-first |
| Fun vs. accuracy | Entertainment wins conflicts |
| Session length | Variable, scales with player skill |
| Time model | Real-time running 24-hour clock (hours) |
| Decisions | Game pauses when a menu is open |
| Blackout | Instant run-over, dramatic |
| Brownout | Severe penalty + warning window |
| Progression | Roguelike |
| Skills | Permanent passive; bought with end-of-run meta-currency |
| Tech/Upgrades | Active boosts; incremental tiers; bought with in-run cash |
| Upgrade effect | Improve capacity, efficiency, cost |
| Maintenance | Deep — random outages, costs cash + downtime |
| Reserve margin | Shown live, color-coded |
| Run goals (v2) | Energy-demand + profit milestones |
| Run structure | Endless ramp, high score on death |
| Escalation | Relentless demand (population, economy), trade conflict, war, weather |
| Persistence | `localStorage`, web-only, local-only for now |
| Leaderboard | Deferred to a later, server-backed version |
| Platform | Web only for now |
