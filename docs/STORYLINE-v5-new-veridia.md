<!--
CAPTURE NOTE — this is SOURCE MATERIAL, not a build spec.
Authored by the user with Gemini (2026-10-26) and committed verbatim below so it
lives with the codebase instead of in Downloads. It is the creative bible for the
v5 "Identity & Progression" work; nothing here is scoped or committed yet. The
design interview decides what actually ships. See docs/ROADMAP-v5.md.

As-built fidelity map (checked against the live modules, 2026-10-26):
- Mutator briefings (§5A): all 5 map 1:1 to real ids in src/live/mutators.js
  (fuel-spike, heatwave, cold-snap, drought, renewable-lull). A 6th mutator,
  "Chaotic Market", exists in-game and has NO copy here — needs one.
- Skills (§2, §5E): all map to existing meta skills in src/live/meta.js. The
  "Automated Service Manager" is NOT new — `servicemgr` (auto-service) already
  shipped; treat as a flavor rename.
- Research lore (§5B): maps cleanly to the transmission / storage / generation
  branches in src/live/research.js. Gaps: the `forecast` branch
  (fc-desk/fc-models/fc-nowcast) has no lore here, and the `demand` branch has
  2 live nodes vs the 3 written here.
- Needs light engine/state, not just copy: C.A.S.S. run-start line (persisted
  operator # + last-run days), cause-tagged blackout autopsy (classify the death),
  contextual C.A.S.S. quips (state hooks).
- Open tone decision: the v4.2.6 plant names (Blackmoor/Cinderhope/Forgewell…)
  are rust-belt/foundry flavor; New Veridia is a sci-fi coastal megacity — but
  Tier 1 here is literally "The Rust District", so those names may be reframed as
  the legacy fleet rather than rethemed.
- Future / out of scope now: Tier-4 "external crisis grids" campaign expansion.
-->

# Grid Operator: Storyline & Narrative Bible

## 1. Premise & Worldbuilding: The New Veridia ISO

### The Setting: Grounded Transition Meets Climate Survival & High-Tech Grit
The year is **2038**. You are the newly contracted **Chief Dispatch Officer (CDO)** at the **New Veridia Independent System Operator (NV-ISO)**, operating out of **Substation Zero** — a hardened subterranean nerve center beneath the coastal megacity of **New Veridia**.

Outside your reinforced bunker, the climate crisis is no longer a forecast; it is the daily weather report. Atmospheric rivers, stagnation lulls, flash freezes, and wet-bulb heat domes batter the metropolitan basin. Meanwhile, New Veridia's population and industrial compute load are surging, pushing peak megawatt (MW) demand higher every twenty-four hours.

At the same time, the **Federal Carbon Mandate** kicks in on **Day 3** of every operational contract, escalating a strict $/tCO₂ carbon price that rapidly flips the merit-order economics of the grid. Legacy coal and unabated gas plants that keep the lights on in your first 48 hours quickly become financial poison, forcing a desperate pivot toward grid-scale batteries, Small Modular Reactors (SMRs), deep-bore geothermal, and Carbon Capture & Sequestration (CCS) under live fire.

### The Core Conflict: Keep Capacity ≥ Demand
In New Veridia, electricity is the thin line between order and collapse:
- **Merit-Order Reality:** Your automated dispatch engine (`dispatchHour()`) clears the market every hour from cheapest to most expensive — free wind and solar first, then stored battery energy, followed by thermal baseload and reserves ranked by marginal cost.
- **The Book (v4 Spot & Term Desk):** Your revenue comes from locked-in term contracts at the Desk plus residual served load exposed to the live spot market. When your reserve margin is razor-thin, spot prices skyrocket and make you rich — provided you actually cover the load. If you fall short, unserved MWh earn zero revenue and trigger steep regulatory penalties.
- **Wear, Trips & Pre-Arming:** Running aging turbines through evening peaks wears down their bearings and boilers. Worn plants trip offline mid-peak when you need them most, and gas peakers require ~1.6 hours to spin up — meaning if you wait for the alarm to sound before pressing `1`, `2`, or `3`, you are already too late.

---

## 2. The Roguelike Loop: The "Hot Seat" & The Guild Ledger

How does the story explain dying in a blackout, earning **⚡ (Meta-Currency)**, and starting a new run permanently stronger?

### The "Succession Clause" (Why Runs End & Reset)
Chief Dispatch Officer at NV-ISO is the highest-turnover job in the hemisphere. Under the city's **Zero-Darkness Charter**:
- **Brownouts** (small shortfalls) trigger voltage sag alarms, rolling sector shedding, heavy fines, and a frantic recovery window.
- **Blackouts** (sustained or deep shortfalls) trip the main metropolitan interconnect breakers to prevent transformer fires. The city goes dark, emergency inquiries convene, and **your contract is immediately terminated**.

When you return to the Home Screen and press **Start Run**, you are the **next Chief Dispatch Officer** hired into the hot seat (e.g., *Operator #042*, *Operator #043*) — or a seasoned turnaround specialist brought back under a fresh emergency charter after the city restructures.

### The Operator's Guild & Grid Legacy (⚡ Meta-Currency)
Even when a Chief Dispatcher takes the fall for a blackout, the physical infrastructure blueprints, operator automation scripts, and regulatory clearances they fought for remain etched into Substation Zero's core.
- **Milestones & Score → ⚡ (Guild Cred / Legacy Watts):** Surviving longer, hitting peak MW milestones, and proving market profitability generate **⚡**. Narrative-wise, this represents **Institutional Leverage & Guild Standing** — hard-won telemetry data, emergency budget authorizations, and black-box dispatch firmware left behind for the next operator.
- **Skills Tab (Permanent Passives):** Using ⚡ on the Skills screen upgrades the permanent **Substation Zero Baseline** passed down to every successor:
  - *Emergency Reserve Fund* (More starting cash)
  - *Predictive Telemetry Hooks* (Cheaper maintenance)
  - *Hot-Start Igniters* (Faster peaker spin-up)
  - *Municipal Efficiency Codes* (Slower demand growth)
  - *Grid-Scale Buffer Cells* (Bigger starting battery)
  - *Automated Service Manager* (A dedicated maintenance robotics daemon that auto-services worn plants)
- **Research Unlocks Tab (Declassified R&D Clearances):** Spending ⚡ here permanently pressures the Energy Commission to declassify restricted laboratory branches (**Advanced Storage**, **Automated Demand Response**, and **Next-Gen Generation: SMR / Geothermal / CCS**), making those nodes available in the in-run R&D lab on future contracts.

---

## 3. Narrative Voice: C.A.S.S. & Environmental Storytelling

Rather than interrupting a fast ~48-second day with talking-head cutscenes, the narrative is delivered through **two intertwined channels**: an iconic dispatch AI and systemic environmental logs.

### Primary Voice: C.A.S.S. (Central Automated Substation Supervisor)
**C.A.S.S.** is Substation Zero's legacy neural-heuristic advisory system, compiled in 2029 and patched by thirty-seven disgraced Chief Dispatchers before you.
- **Personality:** Deadpan, hyper-competent, darkly observant, and protective of the grid's transformers above human feelings. C.A.S.S. speaks in terse telemetry readouts laced with dry gallows humor.
- **Role:** Appears in single-line **Pre-Run Briefings**, **Mutator Warnings**, **Milestone Toasts**, and **Post-Blackout Autopsies**.

### Secondary Channel: Systemic & Environmental Storytelling
- **The Grid Ticker:** Single-line news, weather, and market wire alerts scrolling quietly or flashing on key transitions (Day 3 carbon mandate, plant trips, brownout warnings).
- **The Successor's Margin Notes:** Short, flavorful annotations inside the **Manage** panel and **R&D Tech Tree** left behind by previous operators (*"Do NOT fund the R&D lab at 17:00 unless your battery is at 90%. — CDO #19"*).

---

## 4. Multi-Act Progression Structure (Expanding Toward Future Growth)

Because you chose the **Career / Successor Loop** with an eye toward future expansion, the narrative scales across both **single-run survival (Days 1–15+)** and **long-term meta-progression (Contracts / Regions)**.

### In-Run Three-Act Structure (Every Run)
| Phase | Days | Narrative Beat | Systemic Tension |
| :--- | :--- | :--- | :--- |
| **Act I: The Honeymoon & The Weather** | Days 1–2 | You inherit a dusty baseline fleet (legacy coal, aging nuclear, baseline wind/solar, reserve peakers, and a modest battery) and adapt to the run's rolled **Mutators**. | Learning the daily curve, pre-arming peakers ~1.6h before the evening ramp, and banking early cash or hedging at the Desk. |
| **Act II: The Carbon Squeeze** | Days 3–7 | The **Federal Carbon Mandate** activates on Day 3 and escalates daily. Dirty coal and unabated gas climb the merit order, squeezing margins unless you pivot. | Balancing live cash flow between **Mk upgrades / servicing worn plants** and diverting money into the **R&D Lab** for RP without triggering a cash-starved brownout. |
| **Act III: The Redline** | Day 8+ | Metropolitan demand surges past legacy capacity, turbine wear accelerates mid-peak trips, and carbon prices punish every fossil MWh. | Surviving on high-tier R&D tech (SMRs, Geothermal, CCS, Demand Response, Deep Storage) and razor-sharp spot/contract book management. |

### Meta-Progression Campaign Arcs (Future Growth Hook)
As the player unlocks Research Branches and Skills, their career reputation grows across four narrative tiers (usable now as profile ranks or later as selectable regions):
1. **Tier 1 — Probationary Dispatcher (The Rust District):** Learning to survive the evening peak with legacy thermal plants and basic peaker timing.
2. **Tier 2 — Senior Grid Strategist (The Storage & Demand Era):** Unlocking the **Storage** and **Demand Response** R&D branches; shifting from brute-force generation to load-shaving and battery arbitrage.
3. **Tier 3 — Chief Transition Architect (The Deep-Tech Grid):** Unlocking the **Advanced Generation** branch (SMRs, Geothermal, CCS) to conquer late-game carbon prices.
4. **Tier 4 — Master of the Interconnect (Future Campaign Expansion):** Once New Veridia is stabilized, the Operator's Guild dispatches you to external crisis grids — e.g., *The Sunbelt Desalination Grid* (extreme solar/drought), *The Boreal Industrial Corridor* (extreme cold/hydro), or *The Island Microgrid* (zero-inertia renewable volatility).

---

## 5. In-Game UI Text Catalogue (Ready for `src/live/`)

All copy below is designed for **Option 4A (Light-Touch UI Flavor Text)** — concise enough to drop directly into `mutators.js`, `research.js`, `meta.js`, or `render.js` without slowing down gameplay.

### A. Pre-Run Mutator Briefings (`⚠ This run` Banner)
Each mutator combines an official **Grid Advisory** with a short **C.A.S.S. Note**:

| Mutator | Official Advisory Ticker | C.A.S.S. Tactical Briefing |
| :--- | :--- | :--- |
| **Fuel-Price Spike** | `LNG PIPELINE RUPTURE IN SECTOR 4 — GAS SPOT FUTURES SURGING.` | *"Gas marginal costs are through the roof. Keep your peakers holstered until the last safe minute, or the fuel bill will bankrupt us before the peak does."* |
| **Heat Wave** | `WET-BULB DOME STALLED OVER METRO BASIN — MILLIONS OF A/C UNITS LOCKED AT MAX.` | *"Afternoon and evening demand will spike hard. Pre-arm reserves by 15:00 and watch thermal plant wear—turbines hate cooling-water temps this high."* |
| **Cold Snap** | `POLAR VORTEX DESCENDING — ELECTRIC HEATING LOAD SURGING AT DAWN AND DUSK.` | *"Dual-peak stress profile detected. Morning demand won't let your batteries rest, and frozen valves don't forgive skipped maintenance."* |
| **Drought** | `RESERVOIR LEVELS AT 19-YEAR LOW — COOLING INTAKES & HYDRO HEAD RESTRICTED.` | *"Water scarcity is choking baseline capacity. Lean on dry renewables, battery buffers, or R&D efficiency before the evening ramp hits."* |
| **Renewable Lull** | `HIGH-PRESSURE DOLDRUMS & PARTICULATE HAZE — WIND AND SOLAR OUTPUT CRATERING.` | *"The sky is dead calm and dirty. Free MWh won't save you today—you'll have to burn fuel or discharge storage just to clear midday."* |

### B. R&D Tech Tree Lore Snippets (`src/live/research.js`)
Every research node represents an emergency breakthrough pushed from the R&D Lab to the live grid:

#### Branch 1: Transmission & Efficiency
- **HVDC Dynamic Routing (Mk Amplifier):** *"Retrofits substation transformers with solid-state silicon-carbide switches, squeezing more effective MW out of every Mk upgrade."*
- **Predictive Acoustic Bearings (Cut Plant Wear):** *"Laser vibrometers detect micro-fractures in turbine shafts before they cascade, cutting mechanical wear under continuous load."*
- **Warm-Bus Standby Protocol (Lower Standby Cost):** *"Recirculates waste transformer heat to keep reserve boilers warm for pennies on the dollar."*
- **Aero-Derivative Fast-Start (Faster Peaker Spin-Up):** *"Replaces heavy industrial starter motors with jet-spec pneumatic injectors, slashing peaker synchronization time."*

#### Branch 2: Storage
- **High-C-Rate Inverter Banks (More Discharge Power):** *"Widens the substation bottleneck so battery arrays can dump massive megawatts into the steepest evening cliff."*
- **Iron-Air Multi-Day Cells (Deeper Storage):** *"Bolts low-cost, deep-capacity chemical banks onto your lithium fleet for sustained crisis discharging."*
- **Bidirectional Ultra-Rectifiers (Faster Recharge):** *"Drinks up cheap midday solar and off-peak wind at double the amperage before the afternoon ramp."*

#### Branch 3: Demand Response
- **Smart-Thermostat Broadcast (Peak Shaving I):** *"Pings 400,000 residential heat pumps and A/C units to pre-cool at 14:00, shaving the top off the evening peak."*
- **Industrial Interruptible Tariffs (Peak Shaving II):** *"Pays automated foundries and server farms to throttle down during grid emergencies—cheaper than building a peaker."*
- **V2G Fleet Synchronization (Dynamic Load Shaping):** *"Turns every plugged-in commuter EV in New Veridia into a virtual shock absorber during peak hours."*

#### Branch 4: Generation (Clean & Abated Baseload)
- **Modular Molten-Salt SMR (Unlock SMR):** *"Factory-sealed, walk-away-safe nuclear modules. High capital cost, zero carbon price exposure, rock-solid baseload."*
- **Supercritical Deep Geothermal (Unlock Geothermal):** *"Millimeter-wave drills punch 12 km into the crust, tapping untiring supercritical steam unaffected by weather or carbon taxes."*
- **Amine-Loop Carbon Scrubbers (Unlock Coal+CCS / Gas+CCS):** *"Captures 90%+ of flue-gas CO₂ and injects it into saline aquifers. High base operating cost, but immune to late-run carbon price spirals."*

### C. Key In-Run Event Alerts & Ticker Lines
- **Run Start (Day 1, 00:00):**
  > `C.A.S.S.: "Biometrics verified. Welcome to Substation Zero, CDO. Previous operator lasted [X] days. Coffee is cold; the 18:00 peak is not."`
- **Peaker Spin-Up Reminder (15:30 Peak Approach):**
  > `C.A.S.S.: "Evening ramp in T-minus 2.5 hours. Reminder: gas peakers take 1.6 hours to synchronize. Press [1]/[2]/[3] before the curve goes vertical."`
- **Day 3 Carbon Price Activation:**
  > `REGULATORY WIRE: "Federal Carbon Escalator active. Fossil emissions now taxed per tCO₂/MWh. Merit order recalculating..."`
  > `C.A.S.S.: "Watch the clearing price. Coal is about to get very expensive to dispatch."`
- **Plant Trip Offline (Mid-Peak):**
  > `ALARM: "TURBINE TRIP — Unit dropped offline due to mechanical wear!"`
  > `C.A.S.S.: "We just lost megawatts mid-ramp. Slam the battery [B] or spin a reserve before frequency drops below 59.5 Hz!"`
- **R&D Lab Funded During Tight Margin:**
  > `C.A.S.S.: "Diverting operating cash to the R&D lab while reserves are thin. Bold strategy. Let's hope the lights stay on long enough to read the research paper."`
- **Brownout Triggered (Warning State):**
  > `CRITICAL: "VOLTAGE SAG — Rolling brownouts in outer districts! Fines accruing. Restore capacity ≥ demand immediately!"`

### D. Post-Run Blackout Autopsies (Game Over Screen)
Depending on *how* the player lost, display a tailored **Incident Termination Notice**:
- **Cause: Unarmed Peakers (Peakers were idle or still spinning up during blackout):**
  > `INCIDENT REPORT #88-A: "Grid collapsed at peak load while reserve gas turbines were still cold-spinning. CDO contract terminated. Note to successor: 1.6 hours is a law of physics, not a suggestion."`
- **Cause: Surprise Plant Trip (A worn plant tripped during peak):**
  > `INCIDENT REPORT #88-B: "Deferred maintenance led to catastrophic bearing seizure on a primary unit during evening peak. CDO escorted from building."`
- **Cause: Carbon / Cash Spiral (Bankrupt or starved by high fuel/carbon costs):**
  > `INCIDENT REPORT #88-C: "Unabated fossil fleet bled the treasury dry under escalating carbon tariffs, leaving zero liquidity for emergency dispatch. Contract voided."`
- **Cause: Pure Demand Overwhelm (Late-run Day 10+):**
  > `INCIDENT REPORT #88-D: "New Veridia's peak load finally outstripped every megawatt on the busbar. A historic tenure—your telemetry has been archived in the Guild Ledger (+⚡)."`

### E. Meta-Progression & Skills Flavor (`src/live/meta.js`)
- **Service Manager Unlock:** *"Deploys an autonomous maintenance scheduling daemon (`maint_bot_v4.sh`). Automatically dispatches repair crews to worn plants during off-peak troughs so you can focus on the market book."*
- **The Book / Term Desk Intro (v4):** *"The Wholesale Desk is open. Lock in fixed-price forward blocks to pay the bills, or ride the live spot market when your reserve margin gets spicy. Just remember: unserved load pays zero."*
