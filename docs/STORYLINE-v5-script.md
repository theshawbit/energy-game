<!--
CAPTURE NOTE — SOURCE MATERIAL, not a build spec.
The full narrative production script ("The New Veridia Chronicles", v1.0), authored
by the user with Gemini (2026-10-26). Companion to, and a big expansion of, the first
bible in STORYLINE-v5-new-veridia.md. Committed verbatim below so it lives with the
codebase. It is the source for the v5 NARRATIVE slice, which follows the v5.1
PROGRESSION slice (docs/PLAN-v5.1-progression.md) in the agreed build order. Nothing
here is scoped yet; the narrative design pass decides what ships.

As-built fidelity map (checked against the live modules, 2026-10-26):
- DROP-IN copy: multi-voice mutator briefings (§2) map to the 5 real mutator ids
  (Chaotic Market still has no copy); margin notes (§4) map to real UI — the R&D
  funding control (S.rdFunding → RP, confirmed), Service/Sell buttons, the Desk/Book,
  battery/peaker controls; R&D node voice-logs (§5 Scene 5) map to real research nodes;
  the Scene-1 cold open and the generic blackout line are drop-in.
- NEEDS LIGHT STATE (as PLAN-v5.1 already flags for the narrative slice): cause-tagged
  termination autopsies (§6 — classify the death: unarmed peakers / unserviced trip /
  carbon-cash spiral / demand overwhelm); operator-succession numbering (CDO #038… needs
  a persisted run counter + last-run length); a multi-voice mutator banner (the current
  mut-banner renders one line); a speaker/attribution layer so C.A.S.S./Vance/Sol/Thorn
  are visually distinct (text only — no audio implied).
- *** CROSS-DOC CONFLICT — read before wiring copy ***: this script assumes the linear
  **Mk ladder** ("Mk I → Mk II", the "Mk Upgrade Amplifier" node). v5.1 (PLAN-v5.1-
  progression.md) **replaces Mk** with per-unit branch specialization (Performance/
  Efficiency/Quality/Flexibility). So any Mk-referencing copy here (Scene 3 Sol Kane;
  the Transmission "Mk Upgrade Amplifier" node) must be reconciled to the specialization
  language when the narrative slice is built — AFTER v5.1 lands.
- HOMING NOTE: margin notes (§4) target per-plant "cards", but the fleet is now a TABLE
  (v4.2.4). Per-tech plant notes need a home — likely the Manage / specialization view.
- PHASED / BIG: the five-act "Project Leviathan" mystery (§2, §8 — encrypted reveals
  gated on Day 10/12/15 + meta tiers) is the campaign spine, a large feature. The first
  narrative pass should be the AMBIENT layer (C.A.S.S. barks, mutator briefings, autopsies,
  margin notes); Leviathan is a later phase. Tier-4 external regions (§5.3) remain future.
- AUTHORING CONSTRAINTS to honor (§5): live-clock lines < 3.5s to read; long exchanges
  only in paused states; voice→mechanic mapping (Sol=market, Vance=regulatory/failure,
  Thorn=R&D, C.A.S.S.=grid physics).
-->

# GRID OPERATOR: THE NEW VERIDIA CHRONICLES
**Master Narrative Script & Production Bible (v1.0 — Peer Review Draft)**  
**Project:** *Grid Operator — Live* (`index.html` / `src/live/`)  
**Genre:** Real-Time Systemic Roguelike / Energy Market Thriller  
**Setting:** Substation Zero, New Veridia Independent System Operator (NV-ISO), 2038  

---

## WRITER'S PREFACE: THE DRAMATURGY OF 60.00 HERTZ

In thirty years of writing interactive narratives for systems-driven games, one rule has never failed: **never fight the clock; make the clock the antagonist.**

In *Grid Operator — Live*, a twenty-four-hour cycle lasts forty-eight real-world seconds. Two seconds per hour. When the afternoon solar curve collapses at 16:30 and eight million air conditioners kick on across the New Veridia basin, the player is not reading paragraphs of lore—their eyes are locked on the reserve margin, their fingers hovering over `[1]`, `[2]`, `[3]` for gas peakers and `[B]` for the battery array.

And yet, the player has a **pause button** (`[Space]` and the **Manage** panel), a **Wholesale Desk ("The Book")**, an **R&D Laboratory**, a **Home Screen ("The Guild Hall")**, and the inevitable, crushing silence of the **Post-Blackout Inquiry**.

This script is engineered around a **"Dual-Speed Narrative Architecture"**:
1. **High-Velocity Tactical Comms (Live Clock Running):** Sub-second, bone-dry, atmospheric barks from **C.A.S.S.** and the **Grid Wire** that heighten panic, telegraph mechanical states (like the 1.6-hour peaker spin-up window or imminent bearing trips), and make the city outside Substation Zero feel viscerally alive.
2. **Pause-State & Inter-Run Drama (Manage Panel, R&D Tree, & Meta-Loop):** Where the deep character drama, political intrigue, and overarching mystery unfold. When the player hits **Manage** or returns to the **Skills / Unlocks** terminal after a blackout, time stops. Here, through encrypted messages, predecessor black-box logs, and factional arm-twisting, the player uncovers *why* New Veridia's demand never stops climbing—and what happened to the thirty-seven Chief Dispatch Officers who sat in the chair before them.

---

## SECTION 1: DRAMATIS PERSONAE (CAST OF CHARACTERS)

Every great systems thriller needs voices that personify the numbers on the screen. In Substation Zero, you never see a human face in the flesh—only biometric ID badges, waveform vocal signatures, and red-stamped transcripts across your console.

### 1. C.A.S.S. (Central Automated Substation Supervisor)
* **Role:** Your onboard heuristic dispatch assistant, safety interlock monitor, and institutional memory bank.
* **Voice & Cadence:** Late-40s Alto, crisp, mid-Atlantic broadcast diction with a subtle metallic compression artifact. Think *HAL 9000* crossed with an exhausted air-traffic controller who has worked forty-seven consecutive Christmas Eves.
* **Character Arc:** Compiled in 2029 during the First Coastal Grid Collapse, C.A.S.S. has watched thirty-seven human Chief Dispatch Officers (CDOs) get hired, panic during an evening peak, trip the metropolitan interconnect, and get marched out by security. At the start of your career (Run #1), she treats you as temporary biological ballast. As your **Guild Ledger (⚡)** grows and you unlock restricted R&D branches, she begins to bend NV-ISO protocols for you—eventually revealing the classified telemetry files left by **CDO #001 (Marcus Vance)**.
* **Signature Verbal Tic:** Always cites exact frequencies (`59.94 Hz`), temperatures, or probabilities when delivering bad news.

### 2. THE PLAYER: "THE SUCCESSOR" (CDO #038 — #099+)
* **Role:** On-call Crisis Turnaround Specialist contracted via the **Independent Guild of Dispatch Engineers**.
* **Characterization:** Under the city's **Zero-Darkness Charter**, whenever a metropolitan blackout occurs, the sitting CDO is legally culpable and immediately terminated to appease the City Council. However, the **Operator's Guild** treats Substation Zero as a collective siege. Every CDO who goes down leaves behind hard-wired substation upgrades (**Skills**), declassified laboratory clearances (**Research Unlocks**), and scribbled grease-pencil warnings in the **Manage** panel for the next poor bastard who takes the seat.

### 3. DIRECTOR EVELYN VANCE (Chairwoman, NV-ISO Oversight & Carbon Commission)
* **Role:** The Iron Regulator. She controls the **Day 3 Federal Carbon Mandate**, enforces blackout penalties, and holds the keys to declassified R&D clearances.
* **Voice & Cadence:** Sharp, patrician, unyielding. She speaks from the 80th floor of the Veridia Civic Spire—the only building in the city with its own private hospital-grade microgrid.
* **Hidden Depth:** Daughter of **Marcus Vance (CDO #001)**, the legendary chief engineer who designed Substation Zero and vanished during the Great Blackout of '31. She punishes fossil generation ruthlessly not out of bureaucratic cruelty, but because she knows the city's atmospheric basin is days away from a permanent wet-bulb thermal inversion.

### 4. SOLOMON "SOL" KANE (Head of the Wholesale Desk — "The Book")
* **Role:** Chief Energy Trader & Risk Officer. Voice of **v4 "The Book" (Term Contracts & Live Spot Market)**.
* **Voice & Cadence:** Fast-talking, gravel-voiced former commodities pit shark from Chicago. Smells like espresso and nicotine gum through the intercom.
* **Philosophy:** To Sol, megawatt-hours aren't physics—they're blood in the water. He loves a razor-thin reserve margin because tight grids send the live spot price into the stratosphere. He constantly tempts the player to delay building safe capacity or run worn plants one more peak just to cash in on a spot spike—reminding you a millisecond later that *unserved load pays zero*.

### 5. DR. ARIS THORN (Chief Scientist, Sub-Level 4 R&D Laboratory)
* **Role:** Voice of the **v3 Research Tech Tree** (Transmission, Storage, Demand Response, and Advanced Generation).
* **Voice & Cadence:** Breathless, sleep-deprived, furiously idealistic. Speaks over the background hum of cryogenic pumps and high-voltage capacitor discharge tests.
* **Conflict:** Aris needs **in-run operating cash** diverted from your treasury to generate **Research Points (RP)**. He knows diverting cash at 16:00 might starve your maintenance budget and cause a brownout—he just believes that without **Molten-Salt SMRs**, **Deep Geothermal**, or **Iron-Air Storage**, New Veridia is dead by Day 10 anyway.

### 6. THE GHOST IN THE MARGIN: CDO #019 ("MAYA") & CDO #001 ("VANCE")
* **Role:** Environmental storytellers. Their presence is felt through **Grease-Pencil Margin Notes** etched into the UI of the Manage Panel, Plant Upgrade cards, and R&D nodes.

---

## SECTION 2: THE OVERARCHING FIVE-ACT PLOT ("THE LEVIATHAN LOAD")

Why does New Veridia's peak demand climb relentlessly every single day, even during mild weather, pushing every fleet toward inevitable collapse?

Across multiple runs, as the player spends **⚡ (Meta-Currency)** to unlock the three restricted Research Branches and climb the Guild Ranks, a cohesive five-act mystery unfolds:

* **ACT I — THE RUST INHERITANCE (Run 1 / Meta-Tier 0):**
  The player arrives as **CDO #038**. You inherit a rotting fleet of mid-century coal boilers, an aging pressurized-water nuclear unit, capricious wind/solar farms, three temperamental gas peakers, and a lithium battery bank the size of a shipping container. You learn the visceral horror of the **1.6-hour peaker spin-up delay** and the **Day 3 Carbon Price**. Inevitably, a plant trips or demand outstrips your busbar, and the lights go out.
* **ACT II — THE ARBITRAGE TRAP (Unlocking Storage & Demand Response Branches):**
  Returning as a successor with permanent **Guild Passives** (faster peaker starts, bigger baseline battery), Sol Kane introduces the deeper mechanics of **The Book**. Meanwhile, Dr. Thorn notices an anomaly in the city's load curve: every night at 19:00, an unmapped 400 MW block of non-residential demand spikes beneath the Old Harbor district—never responding to residential price signals.
* **ACT III — THE CARBON CRUCIBLE (Unlocking Advanced Generation: SMR / Geothermal / CCS):**
  Director Vance accelerates the carbon mandate, forcing a full-scale industrial transition mid-run. When the player unlocks the **Generation Branch** and drills 12 kilometers down for **Supercritical Deep Geothermal**, Aris Thorn's seismic sensors hit a massive, shielded subterranean cavern drawing gigawatts of unauthorized reactive power from the municipal busbar.
* **ACT IV — PROJECT PROMETHEUS (Day 10+ Deep-Run Revelation):**
  In late-run survival (Day 10+), C.A.S.S.'s security partitions begin to fracture under high busbar load. She reveals the truth: New Veridia hasn't just been powering apartments and foundries. Beneath the harbor sits **Leviathan**, a federal climate-modeling & planetary geo-engineering supercluster built by Director Vance's father (CDO #001). Every megawatt of escalating peak demand you feed into the grid is powering Leviathan's real-time atmospheric stabilization arrays—the very arrays trying to break the weather mutators (Heat Waves, Cold Snaps, Droughts) killing the surface.
* **ACT V — THE STEADY STATE (The Master Run / Day 15+ Victory Milestone):**
  Armed with a fully unlocked **Service Manager daemon**, **Molten-Salt SMRs**, **Carbon-Captured Gas**, **V2G Fleet Synchronization**, and a hedged wholesale book, the player survives the **Day 15 "Omega Peak"**—achieving full synchronization between Substation Zero and Project Leviathan, breaking the cycle of firing and succession.

---

## SECTION 3: FULL DRAMATIC SCRIPT — SCENE BY SCENE

### SCENE 1: COLD OPEN — FIRST BOOT (FIRST TIME LAUNCHING THE GAME)
**[VISUAL]**  
*Black screen. A single amber CRT cursor blinks at 60 Hz. The low, subterranean rumble of a 500-kilovolt transformer bank vibrates through the floorboards.*

**[AUDIO]**  
*SFX: Heavy pneumatic vault door unsealing. Footsteps on steel grating. The clack of a physical key turning in a control desk ignition.*

**SYSTEM TERMINAL (TEXT ON SCREEN)**
```text
NV-ISO SUBSTATION ZERO // CORE DISPATCH TERMINAL v4.08
BIOMETRIC SCAN: NEW OPERATOR DETECTED.
PURGING CREDENTIALS FOR: CDO #037 [STATUS: TERMINATED — BLACKOUT INCIDENT 09-B]
ASSIGNING CALLSIGN: CDO #038.
```

**C.A.S.S. (V.O.)**  
*(Calm, crisp, slightly weary)*  
Biometrics accepted. Welcome to Substation Zero, Chief Dispatch Officer Thirty-Eight. Please do not adjust the posture of the ergonomic chair; Thirty-Seven didn't have time to warm it up.

**[VISUAL]**  
*The main Live Dashboard illuminates in stages: first the 24-hour demand curve, then the Merit-Order Dispatch stack, then the Reserve Peaker switches (`[1]` `[2]` `[3]`) and Battery array (`[B]`).*

**C.A.S.S. (V.O.)**  
Above your head sit nine million citizens, four hundred miles of aging copper, and a City Council that treats rolling blackouts as a capital offense. Your job can be summarized in one equation: keep available capacity greater than or equal to metropolitan demand. Every hour. Of every day.

**DIRECTOR EVELYN VANCE (COMMS — INCOMING TRANSMISSION)**  
*(Static crackle; cold, aristocratic authority)*  
Listen to me carefully, Thirty-Eight. I don't care what the Operator's Guild promised you when you signed the emergency charter. You have forty-eight hours of grace to learn the levers of this fleet. On Day Three at 00:00, the Federal Carbon Escalator goes live. Every ton of CO₂ your fossil stacks belch into my sky will be taxed at the busbar. Clean up the merit order, or the market will clean you out. Vance out.

**SOL KANE (COMMS — WHOLESALE DESK CHANNEL)**  
*(Barking laugh over the intercom; background clatter of ticker tape)*  
Don't let the Iron Lady spook you, kid! Sol Kane, Wholesale Desk. Look at the top of your board—that's **The Book**. We lock in term blocks to keep the lights on in accounting, and everything else rides the live spot wave. When your reserve margin gets tight, spot prices go to the moon. Ride the edge and we print money! Just... uh, don't actually drop the load. Unserved megawatts pay zero, and I look terrible in an inquiry subpoena.

**C.A.S.S. (V.O.)**  
One final mechanical reality before I release the master clock: your gas peakers are industrial turbines, not light switches. From the moment you press `[1]`, `[2]`, or `[3]`, they require **one point six hours** to pre-heat, spin up, and synchronize to sixty hertz. If you wait until the evening peak hits the redline to arm them, the city will already be dark.  
*(Beat. The 24-hour clock ticks to 00:01.)*  
The coffee on your left is from Tuesday. The evening ramp is at seventeen hundred. Good luck, Thirty-Eight.

---

### SCENE 2: THE MUTATOR BRIEFINGS (`⚠ THIS RUN` BANNER DIALOGUE)
*At the start of every run, the mutator roll determines the atmospheric and economic crisis battering New Veridia. Below are the multi-voice dialogue exchanges triggered on Run Initialization.*

#### VARIATION A: `FUEL-PRICE SPIKE`
* **GRID WIRE:** `ALERT: SUBSEA LNG PIPELINE RUPTURE IN SECTOR 4 — NATURAL GAS SPOT FUTURES UP 240%.`
* **SOL KANE:** *"Mother of pearl—the Freeport LNG main just blew a valve! Gas prices are vertical. If you fire up those gas peakers today, make damn sure the spot price covers the fuel burn, or we're paying the city to take our electrons!"*
* **C.A.S.S.:** *"Advisory: Gas marginal cost has shifted right on the merit-order curve. Recommend maximizing battery arbitrage and delaying peaker ignition until the absolute final 1.6-hour synchronization mark."*

#### VARIATION B: `HEAT WAVE`
* **GRID WIRE:** `ALERT: WET-BULB THERMAL DOME STALLED OVER NEW VERIDIA BASIN — SURFACE TEMPS EXCEED 44°C.`
* **DIRECTOR VANCE:** *"Hospital cooling wards are on priority alert, CDO. Every residential air conditioner in six boroughs is locked at maximum draw. A brownout in this heat isn't an inconvenience—it's a casualty count."*
* **C.A.S.S.:** *"Thermodynamic warning: Elevated ambient river temperatures are reducing thermal cooling efficiency. Expect steeper afternoon ramps and accelerated mechanical wear on all spinning steam units."*

#### VARIATION C: `COLD SNAP`
* **GRID WIRE:** `ALERT: ARCTIC POLAR VORTEX DESCENDING — SUB-ZERO GALES ACROSS METROPOLITAN CORRIDOR.`
* **DR. ARIS THORN:** *"The heat pumps are screaming, CDO! Look at the load curve—we aren't just facing an evening peak anymore; the dawn heating spike at 07:00 is nearly as steep. Your batteries won't have time to nap!"*
* **C.A.S.S.:** *"Sub-freezing intake air detected. Mechanical brittleness increases turbine trip probability across unserviced units. Suggest hitting `[Space]` to inspect fleet wear before dawn."*

#### VARIATION D: `DROUGHT`
* **GRID WIRE:** `ALERT: SIERRA RESERVOIR LEVELS AT 19-YEAR LOW — MUNICIPAL COOLING WATER INTAKES RESTRICTED.`
* **DIRECTOR VANCE:** *"The Water Authority has rationed intake flow to all thermal generating stations. You cannot cool a five-hundred-megawatt steam boiler with dry mud, Operator. Adapt your fleet."*
* **C.A.S.S.:** *"Thermal derating active. Baseline capacity margins are compressed. Photovoltaic and wind assets remain unaffected—provided the wind cooperates."*

#### VARIATION E: `RENEWABLE LULL`
* **GRID WIRE:** `ALERT: HIGH-PRESSURE ATMOSPHERIC STAGNATION & SMOKE HAZE — WIND AND SOLAR OUTPUT CRATERING.`
* **SOL KANE:** *"Zero knots of wind in the strait and a smoke deck blocking the sun! So much for 'free energy,' huh? Hope you like the smell of coal smoke and diesel, kid, because the thermal stack is carrying the whole city today."*
* **C.A.S.S.:** *"Zero-marginal-cost generation has dropped below twenty percent of nameplate capacity. Midday battery recharging will draw from fossil baseload unless supplemented."*

---

### SCENE 3: ACT I — THE FIRST EVENING RAMP & THE MANAGE PANEL (DAYS 1–2)
**[GAMEPLAY TRIGGER]**  
*Day 1, 15:00 hours. The solar curve begins to dip as the sun drops toward the Pacific haze, while commuters return home and plug in.*

**C.A.S.S. (LIVE TOAST)**  
Fifteen hundred hours. Solar irradiance falling by four megawatts per minute. Evening ramp arrives in two hours. Your peakers take 1.6 hours to spin. Do the math, Thirty-Eight.

**[PLAYER ACTION: PRESSES `1` AND `2` TO PRE-ARM PEAKERS]**

**C.A.S.S. (LIVE TOAST)**  
Peaker Units One and Two igniting. Fuel valves open; turbine spools at twelve percent and climbing. Synchronization locked for sixteen-thirty.

**[GAMEPLAY TRIGGER: PLAYER PRESSES `MANAGE` OR `SPACE` — CLOCK PAUSES]**  
*The high-tension hum of the live board drops into a muffled, low-pass underwater thrum. The Manage & R&D Panel slides over the screen. Scratched into the corner of the metal bezel is a note from a previous operator.*

> **GREASE-PENCIL MARGIN NOTE (CDO #014):**  
> *"When you pause the clock in here, breathe. Check the wear bars on your coal and nuclear units. A plant at 62% health looks fine at noon—and trips offline at 18:15 when you have zero spinning reserve."*

**DR. ARIS THORN (COMMS — R&D LAB TAB)**  
*(Whispering urgently over a private line)*  
Hey—Thirty-Eight! You paused the board? Good. Look at the bottom left of your Manage panel. That's theSub-Level Four R&D Lab. Right now, the bureaucrats upstairs have us starved for funding. If you divert a slice of your live operating cash down to us, my team will convert it into **Research Points (RP)** every hour.  
*(Beat; a capacitor bangs in the background)*  
I know, I know—Sol Kane says diverting cash into R&D right before the evening peak is financial suicide. And if you starve your maintenance budget, sure, a turbine might seize up. But trust me: when Day Three hits, legacy hardware won't save you. Fund the lab during the off-peak troughs!

**SOL KANE (COMMS — INTERRUPTING)**  
*(Scoffs)*  
Don't listen to the lab rat yet, kid! Look at your **Upgrade** column first. Taking your baseline plants from **Mk I to Mk II** gives you hard megawatts, lower standby bleed, and thicker bearings *today*. Buy steel before you buy science projects!

---

### SCENE 4: ACT II — THE DAY 3 CARBON SHOCK & THE FIRST PLANT TRIP (DAYS 3–6)
**[GAMEPLAY TRIGGER]**  
*Day 3, 00:00 hours. A crimson regulatory seal flashes across the Wholesale Clearing Price display.*

**[AUDIO]**  
*SFX: Heavy teletype bell. The merit-order stack visibly reshuffles with a metallic clatter.*

**DIRECTOR EVELYN VANCE (COMMS)**  
Day Three, Operator. The grace period has expired. Pursuant to the Federal Atmospheric Stabilization Act, a mandatory carbon tariff is now attached to every megawatt-hour generated by unabated coal and natural gas. And before you ask: yes, the tariff escalates every twenty-four hours at midnight.

**SOL KANE (COMMS)**  
*(Whistles low)*  
Look at the merit order flip! Coal just got priced behind gas, and gas is bleeding us per ton of CO₂. Every hour you lean on those smoky stacks, your operating margin gets eaten alive. Unless you've got clean megawatts or carbon scrubbers in Aris's lab, the Carbon Escalator is going to choke our cash flow in its sleep!

**[GAMEPLAY TRIGGER: DAY 4, 18:30 — MID-PEAK TURBINE TRIP]**  
*The player is riding a thin margin at the top of the 18:00 evening curve. Suddenly, the primary Coal or Nuclear unit flashes violent red: `TRIPPED OFFLINE — MECHANICAL WEAR`.*

**[AUDIO]**  
*SFX: A sickening mechanical screech followed by the heavy THUNK of a 400 MW air-blast circuit breaker opening. Klaxon alarm begins a slow pulse.*

**C.A.S.S. (URGENT)**  
Main turbine trip on Unit Alpha! Bearing temperature exceeded critical threshold—four hundred megawatts just vanished from the busbar! Grid frequency dropping: `59.80 Hz`... `59.65 Hz`!

**SOL KANE (PANICKED)**  
We're underwater! We're below contracted load! Slam the battery—hit `[B]`! Spin anything with a rotor!

**[GAMEPLAY TRIGGER: BROWNOUT STATE ENTERED]**  
*The edges of the screen vignette in amber. Streetlight sectors on the city map flicker and dim.*

**C.A.S.S. (CRITICAL)**  
`BROWNOUT IN PROGRESS.` Voltage sag across Sectors Three through Seven. Regulatory fines accruing by the second. You have a narrow recovery window before under-frequency relays trip the metropolitan interconnect. Shed load, discharge storage, or bring a peaker online *now*!

---

### SCENE 5: THE R&D BREAKTHROUGH CONVERSATIONS (TECH TREE NODES)
*Whenever the player spends scarce **RP** (typically ~5 of 12 nodes per run) to unlock a technology in the **Manage -> Research** panel, a short voice-log exchange plays, grounding the mechanical buff in the story world.*

#### 1. TRANSMISSION & EFFICIENCY BRANCH
* **Node: Mk Upgrade Amplifier (`HVDC Dynamic Routing`)**
  * **DR. THORN:** *"We replaced the old oil-cooled substation switches with solid-state silicon-carbide routers. Every Mk upgrade you bolt onto a plant now pushes 15% more usable power to the street without line loss."*
* **Node: Cut Plant Wear (`Predictive Acoustic Telemetry`)**
  * **C.A.S.S.:** *"I now have laser vibrometers listening to every turbine shaft on the grid. I can micro-throttle steam pressure around harmonic vibrations—cutting mechanical wear across the entire fleet."*
* **Node: Fast Peaker Spin-Up (`Aero-Derivative Jet Igniters`)**
  * **SOL KANE:** *"Now we're talking! We ripped out the industrial diesel starters on the peakers and bolted on surplus supersonic jet igniters. Spin-up time just dropped from 1.6 hours to a hair-trigger!"*

#### 2. STORAGE BRANCH *(Requires Meta-Unlock)*
* **Node: High Discharge Power (`Substation Busbar Widening`)**
  * **DR. THORN:** *"A battery is only as good as the pipe coming out of it. With wide-bandgap inverters, hitting `[B]` doesn't just trickle power—it dumps a tidal wave of megawatts straight into the evening cliff."*
* **Node: Deeper Storage (`Iron-Air Multi-Day Chemistry`)**
  * **C.A.S.S.:** *"Lithium-ion handles the sprint; iron-air handles the marathon. Storage reservoir depth expanded. You can now ride out a full evening peak on stored electrons alone."*

#### 3. DEMAND RESPONSE BRANCH *(Requires Meta-Unlock)*
* **Node: Peak Shaving (`Autonomous Smart-Grid Handshake`)**
  * **DIRECTOR VANCE:** *"For decades, operators thought the only answer to rising demand was pouring more concrete and burning more fuel. This directive lets Substation Zero throttle half a million commercial chillers and EV chargers by two degrees at 17:00. The cleanest megawatt is the one you never have to generate."*
  * **C.A.S.S.:** *"Note: For the first time in NV-ISO history, you are altering the demand curve itself rather than merely obeying it."*

#### 4. ADVANCED GENERATION BRANCH *(Requires Meta-Unlock)*
* **Node: Unlock SMR (`Modular Molten-Salt Reactor`)**
  * **DR. THORN:** *"Factory-sealed, walk-away passive safety, cooled by liquid fluoride salts. Drop it on a two-acre pad and it hums at 100% capacity day and night. Zero carbon emissions. Evelyn's carbon tax can't touch it."*
* **Node: Unlock Geothermal (`12km Millimeter-Wave Deep Bore`)**
  * **DR. THORN:** *"We used gyrotron millimeter-wave beams to vaporize granite twelve kilometers beneath New Veridia. Down there, the rock is four hundred degrees Celsius. Endless supercritical steam—immune to droughts, wind lulls, and carbon prices!"*
  * **C.A.S.S.:** *(Quietly)* *"Dr. Thorn... while your drill bit was passing nine kilometers below the Old Harbor, my seismic array detected a hollow titanium bulkhead. Wait—Director Vance is locking that telemetry channel."*
* **Node: Unlock Carbon Capture (`Coal+CCS / Gas+CCS Amine Scrubbers`)**
  * **SOL KANE:** *"Don't throw out the fossil playbook yet! Bolt an amine-loop carbon scrubber onto the smokestack, pump the liquid CO₂ into the offshore saline aquifer, and boom—your dirty plants jump right back to the front of the merit order once the carbon price crosses $80 a ton!"*

---

### SCENE 6: BLACKOUT & TERMINATION — THE INQUIRY ROOM (RUN OVER)
**[GAMEPLAY TRIGGER]**  
*Sustained shortfall exceeds the brownout recovery window. Grid frequency hits `58.50 Hz`.*

**[AUDIO]**  
*SFX: A deafening, bass-heavy electromagnetic THUD as the master interconnect breakers trip open. Followed by absolute, ringing silence. Even the cooling fans in Substation Zero spin down to a halt.*

**[VISUAL]**  
*The dashboard dies. One by one, the nine borough polygons on the New Veridia map snap to pitch black. Only the red emergency battery lamp above the Scorecard terminal remains lit.*

**C.A.S.S. (V.O.)**  
*(Soft, devoid of sarcasm, running on 12-volt backup)*  
Frequency collapse at `58.42 Hz`. Protective relay cascade complete. All generating units have islanded to prevent turbine shaft shear. New Veridia is dark.

#### TAILORED TERMINATION AUTOPSIES (DYNAMICALLY SELECTED BY CAUSE OF DEATH)

* **IF KILLED BY UNARMED PEAKERS (Peakers were spinning up at moment of blackout):**
  * **DIRECTOR VANCE:** *"The inquiry board has reviewed the black-box tape, Operator. You had three hundred megawatts of gas peakers sitting in your yard, and you didn't hit the igniters until 17:15. They were still forty minutes shy of synchronous speed when the hospitals went onto backup diesel. Physics does not negotiate with procrastinators. Security will escort you to the elevator."*
* **IF KILLED BY UNSERVICED PLANT TRIP (A worn plant <50% health tripped mid-peak):**
  * **SOL KANE:** *"Aw, hell, kid... Unit Two threw a turbine blade right through the condenser casing at peak load. You had the cash to service it at noon, or sell it for salvage and buy a battery, and you gambled on one more cycle. The Guild will salvage your telemetry data, but your badge is toast."*
* **IF KILLED BY CARBON / CASH SPIRAL (Bankrupt or bled dry by Day 5+ Carbon Price):**
  * **DIRECTOR VANCE:** *"You tried to power a 2038 megacity with a 1998 coal fleet. By Day Six, your carbon tariff payments exceeded the gross domestic product of the harbor district. You didn't run out of megawatts—you ran out of solvency."*
* **IF KILLED BY LATE-GAME DEMAND OVERWHELM (Day 9+ Heroic Stand):**
  * **C.A.S.S.:** *"Every plant at 100% output. Every battery cell drained to zero. Every peaker screaming at redline—and the city still demanded four hundred megawatts more. Do not lower your head, Operator. You held the sky up longer than anyone before you. Uploading your operational neural-trace to the Guild Ledger now."*

---

### SCENE 7: THE META-LOOP — THE GUILD HALL & SKILLS TERMINAL (`HOME SCREEN`)
**[VISUAL]**  
*The player returns to the Home Screen (`Skills` / `Research Unlocks` / `Start Run`). The UI is framed as the **Encrypted Guild Ledger**—a shared underground network maintained by every fired Chief Dispatch Officer.*

**C.A.S.S. (V.O. — UPON ENTERING THE SKILLS SCREEN)**  
Welcome to the Ledger. The City Council thinks firing the Chief Dispatcher resets the board. They are politicians; they do not understand firmware. Every milestone you hit and every day you survived generated **Legacy Watts (⚡)**—hard empirical leverage we use to permanently re-wire Substation Zero before the next operator walks through that door.

#### DIALOGUE ON UNLOCKING META-SKILLS (`src/live/meta.js`)
* **When unlocking `Starting Cash` ("Slush Fund"):**
  * **SOL KANE:** *"I hid an offshore margin account inside the Wholesale Desk's clearing ledger. Every new CDO who sits in that chair starts with an extra stack of capital on Day One. Don't tell Vance."*
* **When unlocking `Service Manager` ("Autonomous Maintenance Daemon"):**
  * **C.A.S.S.:** *"Compiling `maint_bot_v4.sh`, written by CDO #029 the night before she was fired. From now on, whenever a plant's wear drops into the amber zone during an off-peak trough, my automated cranes will service it without waiting for your manual order. Keep your eyes on the peak; I will watch the bearings."*
* **When unlocking `Research Branches` (Storage / Demand / Generation):**
  * **DR. ARIS THORN:** *"You used your Guild leverage to force the Oversight Committee's hand! The classified blueprints for [Storage / Demand Response / Next-Gen Nuclear & Geothermal] are permanently unlocked in the R&D Lab for every future run!"*

---

### SCENE 8: ACT IV & V — THE DEEP-RUN CLIMAX ("THE OMEGA PEAK")
*Triggered when an experienced player reaches **Day 10, Day 12, and Day 15** with Advanced Generation unlocked.*

#### BEAT 1: DAY 10, 02:00 — THE CLASSIFIED FILE
**C.A.S.S. (ENCRYPTED WHISPER)**  
Operator. You have survived ten consecutive twenty-four-hour cycles. No CDO since **#001 — Marcus Vance** has held the busbar stable this long.  
*(Static crackle as a partition unlocks)*  
At ten-day tenure, my root directive requires me to unseal File Zero. Look at the load curve. Why is metropolitan demand growing by ten percent every single day when census population is flat?  
Because you aren't just powering New Veridia. Six hundred feet beneath the Old Harbor sits **Project Leviathan**—ancontinental atmospheric geo-engineering array built by Marcus Vance. It uses high-energy stratospheric ionization to tear apart wet-bulb heat domes and polar vortices before they sterilize the coast.

#### BEAT 2: DAY 12, 12:00 — EVELYN VANCE'S CONFESSION
**DIRECTOR EVELYN VANCE (COMMS — VOICE SHAKING SLIGHTLY)**  
So C.A.S.S. finally opened my father's partition.  
*(A long pause; the sound of rain lashing against the 80th-floor glass of the Civic Spire)*  
Now you know why I never allowed you to shed load, and why I taxed every ton of carbon until your knuckles bled. If Leviathan loses power for more than four minutes, the atmospheric shield over the basin collapses. If we power Leviathan with unabated coal, we cook the very sky it's trying to save. Every operator before you broke under the weight of both equations. Prove to me you aren't thirty-seven other people.

#### BEAT 3: DAY 15, 17:30 — THE OMEGA SYNCHRONIZATION (ENDGAME MILESTONE)
**[VISUAL]**  
*Day 15 Evening Peak. The demand curve rises like a vertical wall. Carbon price is at catastrophic levels, making unabated fossil plants unusable. Only a masterfully built fleet of SMRs, Deep Geothermal, CCS Gas, Iron-Air Batteries, and Smart Demand Response can clear the peak.*

**DR. ARIS THORN (COMMS)**  
Leviathan is entering full atmospheric lock! It's drawing everything we have on the high-voltage bus!

**SOL KANE (COMMS)**  
Spot price is pinned at the regulatory ceiling! Every megawatt we serve right now is pure gold—hold the line, kid! Hold the damn line!

**C.A.S.S. (V.O.)**  
Seventeen-forty-five. Peakers synchronized. Iron-Air banks discharging at maximum C-rate. SMR core temperatures nominal. Frequency holding at `59.98`... `59.99`... `60.00 Hz`.

**[GAMEPLAY TRIGGER: 20:00 HOURS — THE PEAK PASSES WITHOUT A BROWNOUT]**  
*The crimson threat lights across Substation Zero shift to a steady, luminous cyan. Outside, on the weather radar, the stalled red mutator storm cells over New Veridia fracture and disperse into clear coastal air.*

**DIRECTOR EVELYN VANCE (COMMS)**  
*(Quiet, stunned reverence)*  
Stratospheric ionization lock confirmed. The thermal dome over the basin is breaking up. For the first time in seven years... the tomorrow forecast is clear.

**C.A.S.S. (V.O.)**  
*(A warm, almost imperceptible hum in her vocal synthesis)*  
Day Fifteen evening peak cleared with zero unserved megawatt-hours.  
I am deleting the pre-drafted termination notice for your callsign, Operator. The hot seat is officially yours—for as long as you care to keep the lights on.

---

## SECTION 4: THE "GREASE-PENCIL" MARGIN NOTES (ENVIRONMENTAL LORE)

To make the **Manage Panel** feel like a physical workstation passed down through thirty-seven desperate engineers, these short handwritten notes appear as tooltips or footer flavor text on specific UI cards:

| UI Location | Margin Note Text | Author |
| :--- | :--- | :--- |
| **Coal Plant Card** | *"She's a dirty old beast, but on Day 1 she pays the bills. Sell her for salvage by Day 5 or the carbon tax will eat your children."* | `— CDO #008` |
| **Nuclear Plant Card** | *"DO NOT skip maintenance on Reactor 1. A 500 MW trip at 18:00 isn't a brownout; it's a career change."* | `— CDO #019 ("Maya")` |
| **Gas Peaker `[1]` `[2]` `[3]`** | *"1.6 HOURS. Write it on your hand. If the clock says 16:30 and these aren't spinning, start packing your desk."* | `— CDO #004` |
| **Battery `[B]` Button** | *"Instant megawatts, zero spin-up lag. Save at least 40% charge for surprise turbine trips."* | `— CDO #022` |
| **R&D Lab Funding Slider** | *"Aris will beg you for cash at 5 PM. Say no. Fund the lab at 2 AM when the city is asleep and spot revenue is banked."* | `— CDO #031` |
| **The Book (Wholesale Desk)** | *"Sol loves a 2% reserve margin because spot prices spike. Sol doesn't get fired when Unit 3 trips offline. Hedge your blocks."* | `— CDO #012` |
| **Service Plant Button** | *"Servicing takes a plant offline immediately. Never click 'Service' between 14:00 and 21:00 unless you enjoy darkness."* | `— CDO #003` |
| **Sell / Decommission Button** | *"Decommissioning coal on Day 4 feels terrifying. Do it anyway. Use the salvage cash to finish your SMR."* | `— CDO #035` |

---

## SECTION 5: PEER-REVIEW PRODUCTION CHECKLIST & IMPLEMENTATION NOTES

1. **Zero-Interruption Pacing:** Every line in Scenes 2, 3, and 4 is structured so that live-clock lines take **under 3.5 seconds** to read as a top-bar ticker or C.A.S.S. subtitle toast, while multi-paragraph character exchanges occur strictly during **Paused states** (`Manage` panel, `Research` unlock modal, `Run Start` overlay, and `Game Over` scorecard).
2. **Mechanical Telegraphing Through Character Voice:**
   * **Sol Kane** always telegraphs **market & liquidity mechanics** (spot price, reserve margin, term hedging, salvage cash).
   * **Director Vance** always telegraphs **regulatory & failure states** (Day 3 carbon price escalation, brownout fines, blackout termination).
   * **Dr. Aris Thorn** always telegraphs **long-term R&D & tech-tree trade-offs** (diverting cash to RP, unlocking SMRs/Geothermal/CCS/Storage).
   * **C.A.S.S.** always telegraphs **immediate physical grid physics** (1.6h peaker spin-up, turbine wear/trip odds, MWh capacity vs. demand).
3. **Extensibility for Future Regional Campaigns:** By establishing the **Independent Guild of Dispatch Engineers** and **Project Leviathan**, future updates can seamlessly introduce new maps (e.g., *Sector 2: The Sunbelt Desalination Grid* or *Sector 3: The Boreal Hydro Interconnect*) while keeping C.A.S.S., Sol, Aris, and Vance as your mobile command team.