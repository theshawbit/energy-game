// ============================================================
// LIVE CONFIG — tuning knobs, the starting fleet, and a factory for
// newly-built units. Pure data (plus factories). No state, no DOM.
// ============================================================
import { SOLAR_CF, WIND_CF, TECH } from "../constants.js";
import { defaultDials } from "./dispatch.js";

// ---- tuning (meant to be played with) ----
export const CFG = {
  // v5: a ~3-minute engaged day (was 48s). At 180s a game-hour ≈ 7.5 real-sec, so a
  // trip warning (strainWarn 1.6 gh ≈ 12s) and a peaker spin-up breathe — read-decide-act
  // with intent, not twitch. All code + tests read this constant, so the pacing is central.
  secondsPerDay: 180,         // real seconds for a 24h cycle (~3-min day; 1 game-hour ≈ 7.5s)
  startHour: 6,               // shift begins at 06:00
  startPeak: 780,             // MW peak demand, day 1
  startCash: 120000,          // $ on hand day 1, so the manage panel has an opening move
  peakGrowth: 1.06,           // demand growth per day survived
  spinCost: 11,               // $/MW/h default to keep a thermal plant synced (per-unit `spin` overrides)
  fixedOM: 10,                // $/MW/h fixed O&M on ONLINE dispatchable capacity (renewables exempt)
  fixedOMIdle: 0.3,           // v4.1: an off/reserve plant costs only this FRACTION of fixedOM to own
                              //   (idle peakers + the battery shouldn't bleed you dry — fixes the
                              //   cold-start insolvency; you only pay the full rate for what you run)
  unservedPenalty: 120,       // $/MWh extra penalty on unserved load (emergency purchases / fines)
  strainRate: 52,             // strain gained per second at 100% shortfall
  strainRecover: 45,          // strain shed per second when covered
  instantBlackout: 0.42,      // only a catastrophic shortfall kills instantly; smaller ones
                              //   fill the strain meter instead, giving a window to react
                              //   (fire the battery, start peakers) — so deaths feel earned
  satDrain: 40,               // satisfaction lost per second at 100% shortfall (chronic brownouts erode it)
  satRecover: 1.5,            // satisfaction regained per second when fully covered (slow — mistakes linger)
  outageRamp: 0.10,           // trip rate grows this much per day survived
  battRecharge: 70,           // MW recharge rate when idle
  carbonStartDay: 3,          // carbon pricing kicks in after the opening days
  carbonPerDay: 3.5,          // $/t added each day thereafter (~day 13 flips coal→gas)
  // v4.2.1 WEAR MODEL — deterioration is a function of LOAD × AGE, not a flat clock.
  //   wear/gh = wearRate × loadMult × ageMult × strainMult × (run mods)
  // loadMult ("both combined") = gridUtil (demand/online-capacity, the system stress)
  //   × assetLoad (this unit's own dispatch share of its cap). A baseload plant on a
  //   tight grid wears hard; a lightly-loaded reserve barely wears. Age accumulates
  //   only while generating and PERSISTS through service/upgrade, but each service
  //   partially relieves it (knocks it down, never to a full reset).
  wearRate: 0.5,              // base condition %/game-hour at full load, fresh plant
  wearLoadFloor: 0.35,        // gridUtil can't push loadMult below this (a slack grid still wears some)
  wearLoadMax: 1.25,          // …nor above this (an overloaded grid wears a touch harder)
  wearIdleFloor: 0.12,        // an online-but-undispatched plant still wears this share (spinning idle)
  ageRef: 180,                // game-hours of generation that adds ageWearK to the age multiplier
  ageWearK: 0.9,              // age multiplier gain per ageRef of accumulated runtime (fresh = 1.0)
  serviceAgeRelief: 0.55,     // a service multiplies accumulated ageHours by this (removes ~45%)
  upgradeAgeRelief: 0.30,     // an upgrade is deeper — keeps only this share of ageHours
  // v4.2.2: trip risk is tied to CONDITION via this lookup — [condition%, daily
  // strain probability] for a REFERENCE plant at fail = tripRefFail (coal). A
  // plant's own u.fail scales it (nuclear is more reliable; an upgrade that cuts
  // u.fail cuts trips too). HARD RULE: a plant at ≥85% NEVER trips (first point is
  // 0) — real plants rarely fail, so trips are now a rare, dramatic neglect event,
  // not a constant tax. Below 85% risk ramps; condition ≤ the last point plateaus.
  // The real moment-to-moment challenge lives in the volatile net-load curve (vol).
  tripOdds: [[85,0],[77,0.004],[70,0.012],[60,0.06],[50,0.18],[40,0.30],[30,0.40]],
  tripRefFail: 0.0045,        // the fail rate the tripOdds table is calibrated to (coal)
  tripOverhaul: 50,           // below this condition a service becomes a costly, slower OVERHAUL
  overhaulCostMult: 6,        // an overhaul costs this × the normal service charge (deep damage)
  overhaulTimeMult: 1.75,     // …and keeps the plant offline this × longer
                              //   (raised 3→5 — base rates are now low, so WEAR is the real trip
                              //   driver: a maintained plant almost never trips, a neglected one does)
  // v4.1 telegraphed trips: a hazard roll no longer drops a plant instantly — it enters a
  // STRAINED warning state for this many game-hours (still generating), giving you time to
  // fire reserves / shed load / stand a peaker down before it actually trips offline.
  strainWarn: 1.6,            // game-hours a plant strains before it trips (~3 real-seconds of warning)
  serviceTime: 4,             // game-hours a plant is offline for a full service
  // v4.2.2: service fee is strongly CONDITION-graduated. The per-MW-of-damage term
  // dominates (small flat floor), so a light touch-up at 80% is cheap and a heavy
  // service at 50% clearly isn't — condition visibly drives the bill.
  repairPerMW: 140,           // $/MW × damage fraction — the condition-driven term
  repairMin: 1500,            // small flat floor (call-out / fixed labour)
  // ---- v4.2.2 NET-LOAD VOLATILITY — the real moment-to-moment challenge ----
  // With trips now rare, difficulty comes from a choppy demand-vs-capacity curve:
  // intermittent renewables (gusts, cloud banks, lulls) and demand noise + spikes.
  // Both are mean-reverting random walks (toward 1.0 / 0) so they wander and recover
  // rather than ratcheting; a shortfall fills the strain meter (seconds to react),
  // so volatility rewards attention and a kept reserve margin, never instakills.
  // Each is a mean-reverting (Ornstein-Uhlenbeck) process: pull = revert×(μ−v)×dt,
  // noise = rand(-1,1)×vol×√dt. The √dt is the point — it makes volatility real and
  // FRAME-RATE INDEPENDENT (a linear ×dt noise averages out at 60fps, which is why the
  // old drift felt glassy). Equilibrium swing ≈ vol/√(2·revert)×0.577; correlation time
  // ≈ 1/revert real-seconds (a game-hour ≈ 2 real-sec), so swings last a few game-hours.
  vol: {
    sunRevert: 0.20, sunVol: 0.20, sunLo: 0.25, sunHi: 1.15,   // solar ≈ ±18% (cloud banks)
    windRevert: 0.15, windVol: 0.26, windLo: 0.15, windHi: 1.55, // wind ≈ ±27% (gusts & lulls)
    demandRevert: 0.20, demandVol: 0.11, demandJitMax: 0.14,   // continuous load wobble ≈ ±10%
    spikeChance: 0.14,  // probability per game-hour a demand spike begins
    spikeMin: 0.07, spikeMax: 0.20,  // +7%…+20% demand while a spike runs
    spikeDurMin: 0.6, spikeDurMax: 1.8, // game-hours a spike lasts
  },
  // ---- research / R&D lab (v3) ----
  rpPerDollar: 0.0006,        // RP per $ diverted into R&D. Tuned (F2) so a typical run
                              //   researches ~5–8 of 12 nodes — forcing a path choice —
                              //   instead of finishing the whole tree with RP to spare.
  rdFundingMax: 20000,        // $/game-hour cap on R&D funding
  // ---- per-run mutators (v3) — magnitudes live here so balance is central ----
  mut: {
    minRoll: 1,               // fewest mutators a run rolls
    maxRoll: 2,               // most mutators a run rolls
    fuelSpike: 1.5,           // gas fuel-price multiplier (re-sorts the merit order)
    heatwave: 1.18,           // demand multiplier (air-con all day)
    coldSnap: 1.12,           // demand multiplier (heating load)
    drought: 0.6,             // wind capacity-factor multiplier
    lull: 0.68,               // solar AND wind cf multiplier (F2: 0.55→0.68, it was the
                              //   deadliest mutator by a wide margin — evened toward the rest)
    fuelScarcity: 1.4,        // v4: fuel-spike also compounds the spot scarcity premium (b4)
    chaosVol: 0.6,            // v4 (E): chaotic-market adds this to the forecast-fog volatility axis
  },
  // ---- v4 "The Book": spot market + term contracts (Phase B) ----
  // Revenue = contracted blocks at a locked price + residual served load at spot.
  // Spot = a flat-ish baseline + a scarcity premium driven by the player's OWN
  // reserve margin (thin → spike, flush → crash); mutators compound it. Baseline
  // is deliberately small vs scarcityMax so the player's dispatch moves the price.
  // (g3 balance pass: scarcityMax 240→100 + spotCap 320→165 compress the old
  // spot WINDFALL — a tight unhedged grid used to ride spot to ~$1M; now the
  // net-worth p90 tail is ~$1–2M and the realized-spot CoV drops from ~1.0 to ~0.7.)
  spotBase: 50,               // $/MWh flat baseline the spot price sits around
  spotDaily: 0.25,            // how much the daily demand shape lifts/drops the baseline hour to hour
  spotDrift: 0.015,           // slow per-day upward drift of the baseline (a gentle cost-of-living climb)
  spotFloor: 8,               // $/MWh hard floor (a flush grid still clears above zero)
  spotCap: 165,               // $/MWh hard ceiling on spot (g3: 320→165 — scarcity can't run away)
  scarcityMax: 100,           // $/MWh premium at a tight/short grid (g3: 240→100; PLATEAUS — no deeper-shortfall windfall)
  crashMax: 54,               // $/MWh discount a flush grid suffers (g3: 42→54 — overbuild/flush bleeds; plateaus at rmCrash)
  rmRef: 0.25,                // reserve margin where the premium hits zero (healthy headroom)
  rmCrash: 0.80,              // reserve margin where the crash discount plateaus (hugely overbuilt)
  // term contracts (the hedge): lock load at a fixed price for a run of days
  hedgeDefault: 0.5,          // default hedge dial — commit ~half of expected output
  hedgeBaseFactor: 1.06,      // base lock ≈ baseline (g3: 0.90→1.06 — a 4-day lock prices ≈ the ~$60 average spot, so hedging is fair insurance, not a structural loss)
  hedgeTermBonus: 0.035,      // each extra day of term lifts the locked rate this much
  hedgePriceCap: 1.35,        // a long lock can't beat baseline by more than this
  contractTermMin: 2,         // shortest term the dial offers (game-days)
  contractTermMax: 6,         // longest term the dial offers (game-days)
  hedgeMaxContracts: 6,       // v4.1: most standing hedge legs you can ladder on the book at once
  // ---- v4 "The Book": financing — debt, credit, bankruptcy (Phase C) ----
  // A credit STANDING ∈ [0,100] carries across runs and sets both the interest
  // rate and the borrowing ceiling. Default craters it for the run and scars the
  // persistent record; sustained insolvency is a bankruptcy fail-state.
  creditStart: 70,            // starting credit standing ∈ [0,100] (≈ grade A — a clean operator)
  rateMin: 0.012,            // interest rate per GAME-DAY at perfect credit (100)
  rateMax: 0.085,            // interest rate per game-day at zero credit
  ceilingMin: 0,             // borrowing ceiling ($) at zero credit
  ceilingMax: 400000,        // borrowing ceiling ($) at perfect credit
  defaultCredit: 20,         // credit is slammed to ≤ this the moment you default
  defaultCeil: 55,           // and your credit ceiling is capped here for the rest of the run
  defaultFloor: 40,          // cross-run standing can't be written back above this after a default
  creditRecoverPerDay: 3,    // solvent days rebuild credit toward the (possibly capped) ceiling
  insolvencyFloor: 0,        // cash below this counts as insolvent
  hardInsolvency: -150000,   // cash this deep in the red = instant wind-up (assets seized)
  bankruptcyGrace: 6,        // real-seconds insolvent before bankruptcy (mirrors the strain window)
  // ---- v4 "The Book": multi-track scoring (Phase D) — each track earns ⚡ on its
  // own curve, so longevity, wealth, clean play and spot-trading can each be "the
  // point". Divisors are $/⚡ or %/⚡; higher = that track rewards more slowly.
  score: {
    longevityPerDay: 3,      // ⚡ per day survived
    netWorthPerCoin: 60000,  // $ of peak net worth per ⚡
    cleanPerPct: 0.4,        // ⚡ per percentage-point of clean-energy share
    spotKillPerCoin: 4000,   // $ of biggest single spot-spike capture per ⚡
  },
  // ---- v4 "The Book": earned forecast (Phase E) — the spot forecast starts
  // foggy, research sharpens it, volatility blurs it. fog = band half-width as a
  // fraction of price. ----
  forecast: {
    maxSkill: 3,             // forecasting research tops out at skill 3
    baseFog: 0.30,           // ±30% band with no forecasting skill, calm market
    skillGain: 0.28,         // each skill level narrows the base fog by this fraction
    volK: 1.2,               // how hard volatility widens the fog
    fogMin: 0.04,            // sharpest possible band (±4%)
    fogMax: 0.60,            // blurriest band (±60%)
  },
  // ---- v4 "The Book": meta blooms (Phase F) ----
  // A run is now a finite CONTRACT, not endless survival: it runs baseDays, grown
  // by the "Longer Shifts" economy unlocks, then ends as a graceful WIN.
  run: { baseDays: 5, tier1: 2, tier2: 2, tier3: 3 }, // 5 → 7 → 9 → 12 days
  // capacity market (advanced tier): get paid for available reserve MW, fined if
  // you can't deliver when called. A breach fine is recoverable — never fatal by
  // itself (only sustained insolvency ends a run).
  capacity: {
    pricePerMW: 9,        // $/MW/day availability payment while under obligation
    penaltyPerMw: 55,     // $/MW breach fine when called and short
    callBaseProb: 0.35,   // base per-day chance of a capacity call (rises with tightness)
  },
  // named-buyer special offers (the Rolodex): occasional standout contracts
  offers: { dailyChance: 0.25 }, // per-day chance a buyer brings an offer (with the unlock)
  // ---- v5 "The Persistent Grid" (Phase 1): the Year ▸ Quarter ▸ Day calendar +
  // the variable clock. The day LENGTH is the top-level CFG.secondsPerDay above
  // (one source, read by code + tests); these are the calendar/clock knobs. All
  // v5 tuning lands under CFG.v5 so the persistent-grid balance stays central. ----
  v5: {
    daysPerQuarter: 22,       // ~22 game-days per quarter (a ×4 compression of a real 90-day Q)
    quartersPerYear: 4,       // quarter = season = fiscal period; Q1 winter … Q4 autumn
    fastSpeed: 3,             // fast-forward multiplier (skip calm hours); 1× is the ~3-min day
    startYear: 1,             // the long arc begins at Year 1 …
    startQuarter: 1,          // … Quarter 1, Day 1
    // Phase 2: the dedicated peaker KIND is retired — fast gas is just a dial-able
    // thermal plant with a quick spin-up. These inherit the old peaker's ramp/start
    // characteristics so a gas unit dialled to a narrow high band is the former peaker.
    gas: {
      spin: 11,               // $/MW/h to keep synced (pricey top-up, as the old peaker)
      fail: 0.0030,           // per-tick trip reference (between coal and nuclear)
      recover: [1.5, 3],      // game-hours to come back from a trip
      startTime: 1.6,         // game-hours to spin up from cold (the "fast" in fast gas)
    },
  },
};

// Cost to service a unit back to 100% condition: scales with how worn it is and
// how big it is, plus a floor. Proactive service on a healthy plant is cheap — but
// let it fall below CFG.tripOverhaul and it's a wreck: a full OVERHAUL at a steep
// premium (overhaulCostMult). The cliff is the point — service before 50%.
export function serviceCost(u){
  const cond = u.condition ?? 100;
  const damage = Math.max(0, 1 - cond / 100);
  let cost = CFG.repairPerMW * u.cap * damage + CFG.repairMin;
  if (cond < CFG.tripOverhaul) cost *= CFG.overhaulCostMult;
  return Math.round(cost);
}

// Game-hours a service takes: a routine service is CFG.serviceTime; an overhaul
// (condition below CFG.tripOverhaul) keeps the plant offline overhaulTimeMult× longer.
export function serviceTimeFor(u){
  return CFG.serviceTime * ((u.condition ?? 100) < CFG.tripOverhaul ? CFG.overhaulTimeMult : 1);
}

// Salvage cash recovered by decommissioning a unit — a fraction of its notional
// build value (scaled by current capacity, so upgraded plants salvage higher).
export const SALVAGE_FRAC = 0.3;
export function salvageValue(u){
  const b = BUILD[u.tech];
  const perMw = b ? b.cost / b.mw : 800; // fallback $/MW for techs not in the build catalogue
  return Math.round(SALVAGE_FRAC * perMw * u.cap);
}

// ---- build catalogue: spend in-run cash to add a block of capacity ----
// cost is a live-tuned capital cost ($); mw is the block size. Batteries are now
// buildable (the sim tracks any number of storage units); `hours` sets a built
// battery's energy depth (MWh = mw × hours), matching the starting 2h battery.
export const BUILD = {
  solar:   { label:"Solar farm", mw:60,  cost:50000 },
  wind:    { label:"Wind",       mw:50,  cost:55000 },
  battery: { label:"Battery",    mw:60,  cost:60000, hours:2 },
  nuclear: { label:"Nuclear",    mw:100, cost:220000 },
  coal:    { label:"Coal",       mw:60,  cost:70000 },
  peaker:  { label:"Gas (fast)", mw:55,  cost:45000 }, // builds dial-able fast gas (the former peaker)
  // ---- v3 advanced generation: buildable only once their research unlocks them ----
  smr:      { label:"SMR",       mw:90,  cost:240000 },
  geo:      { label:"Geothermal",mw:80,  cost:180000 },
  ccs_coal: { label:"Coal + CCS",mw:80,  cost:150000 },
  ccs_gas:  { label:"Gas + CCS", mw:90,  cost:130000 },
};
export const BUILD_ORDER = ["solar", "wind", "battery", "coal", "peaker", "nuclear", "smr", "geo", "ccs_coal", "ccs_gas"];

// Build gates: a tech here can only be built once the named research mod is set
// (see research.computeResearchMods). Techs absent from this map are always
// buildable. CCS (coal & gas) shares one unlock.
export const BUILD_GATE = {
  smr:      "smrUnlocked",
  geo:      "geoUnlocked",
  ccs_coal: "ccsUnlocked",
  ccs_gas:  "ccsUnlocked",
};

// Per-tech firm-plant operating params for units built mid-run (spin $/MW/h,
// per-second trip rate, and the [min,max] game-hours to recover from a trip).
const FIRM_PARAMS = {
  nuclear:  { spin:2, fail:0.0020, recover:[5, 9] },
  smr:      { spin:2, fail:0.0020, recover:[5, 9] },
  geo:      { spin:3, fail:0.0025, recover:[3, 6] },
  coal:     { spin:4, fail:0.0045, recover:[1.5, 3] },
  ccs_coal: { spin:4, fail:0.0045, recover:[1.5, 3] },
  ccs_gas:  { spin:4, fail:0.0040, recover:[1.5, 3] },
};

// ---- upgrade tiers (Mk I→II→III): capacity up, trips down, standby cost down ----
export const UPGRADE = {
  maxTier: 3,
  cost: 50000,       // base cost for Mk I→II
  costGrowth: 1.8,   // each further tier costs this much more
  capMult: 1.25,     // +25% capacity per tier
  failMult: 0.6,     // trip rate down (more reliable → effective efficiency)
  spinMult: 0.7,     // standby $/MW/h down (running cost)
};
export function upgradeCost(tier){ return Math.round(UPGRADE.cost * Math.pow(UPGRADE.costGrowth, (tier || 1) - 1)); }

// ---- plant naming ----
// Real grids name their iron after the place it stands on, not "Coal Plant A".
// Each name is `<place> <fuel>` so it reads like a real station (Blackmoor Coal,
// Fellcrest Wind) while still telegraphing the tech at a glance. The fuel word is
// the clarifier; the fleet table's sub-line carries kind + MW separately. Pure
// data — a fuller named-territory scheme is the v5 "Identity" work.
const FUEL_WORD = {
  nuclear:"Nuclear", coal:"Coal", solar:"Solar", wind:"Wind", peaker:"Gas",
  battery:"Battery", smr:"SMR", geo:"Geothermal", ccs_coal:"Coal CCS", ccs_gas:"Gas CCS",
};
// Place-name pools for units built mid-run. Indexed by the per-tech build count,
// so the first new coal plant is "Sootbank Coal", the second "Emberly Coal", … .
// Starting-fleet names are set directly in makeFleet() and don't draw from here,
// so there's no collision. Wraps with a numeral only in very long runs.
const PLACE_POOL = {
  nuclear: ["Dunmoor","Severn Reach","Kesterling","Thornwick"],
  coal:    ["Sootbank","Emberly","Colliers Rise","Dunsmere","Blackdyke","Furnace Hill"],
  solar:   ["Harbrook","Oakfield","Sunderley","Marsh End","Pennington","Goldacre"],
  wind:    ["Stormholt","Gale Point","Hollowfell","Ravensmoor","Netherby","Cragwind"],
  peaker:  ["Sparkbridge","Quickfell","Flintlock","Dormer Gate","Tindall","Risewood"],
  battery: ["Fenwick","Hollowmere","Tanfield","Larkstone","Brindle","Saltmarsh"],
  smr:     ["Aldermint","Beacon Hill","Quellstone","Vale End"],
  geo:     ["Cauldwell","Hotspring Vale","Ironvent","Deepcombe"],
  ccs_coal:["Carbonmoor","Scrubbdale","Greycap","Ashworth"],
  ccs_gas: ["Cleanburn","Methermere","Vaporton","Blueflame"],
};
// Name for the n-th (1-based) mid-run build of a tech: `<place> <fuel>`, with a
// numeral suffix if the run outlasts the pool.
export function plantName(tech, n){
  const pool = PLACE_POOL[tech] || PLACE_POOL.coal;
  const fuel = FUEL_WORD[tech] || (BUILD[tech]?.label ?? tech);
  const i = (n - 1) % pool.length;
  const wrap = Math.floor((n - 1) / pool.length);
  return `${pool[i]} ${fuel}${wrap ? " " + (wrap + 1) : ""}`;
}

// ---- fleet definition ----
// kind: firm (dial-able baseload thermal), gas (dial-able FAST thermal — the former
// peaker, retired as a kind in v5 Phase 2), renew (variable), battery.
// `tech` maps each unit onto an engine resource; `mc` mirrors TECH so the cards
// and the dispatchHour() clearing agree on one set of economics. Every dispatchable
// unit carries its Core+ dials (defaultDials); baseload commits by default, gas
// sits in reserve, so a fresh fleet runs like v4 until the player dials it.
export function makeFleet() {
  const g = CFG.v5.gas;
  const fleet = [
    { id:"nuc",  name:"Harrowgate Nuclear", kind:"firm",   tech:"nuclear", cap:250, mc:TECH.nuclear.mc, spin:2,  tier:1, condition:100, status:"online", ctrl:false, fail:0.0020, recover:[5,9],  key:null },
    { id:"colA", name:"Blackmoor Coal",     kind:"firm",   tech:"coal",    cap:180, mc:TECH.coal.mc,    spin:4,  tier:1, condition:100, status:"online", ctrl:false, fail:0.0045, recover:[1.5,3], key:null },
    { id:"colB", name:"Cinderhope Coal",    kind:"firm",   tech:"coal",    cap:140, mc:TECH.coal.mc,    spin:4,  tier:1, condition:100, status:"online", ctrl:false, fail:0.0045, recover:[1.5,3], key:null },
    { id:"sol",  name:"Meadowbank Solar",   kind:"renew",  tech:"solar",   cap:220, mc:TECH.solar.mc,   tier:1, status:"online", ctrl:false, cf:SOLAR_CF, key:null },
    { id:"wnd",  name:"Fellcrest Wind",     kind:"renew",  tech:"wind",    cap:160, mc:TECH.wind.mc,    tier:1, status:"online", ctrl:false, cf:WIND_CF,  key:null },
    { id:"pk1",  name:"Ashgate Gas",        kind:"gas",    tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:g.spin, tier:1, condition:100, status:"off", ctrl:true, fail:g.fail, recover:[...g.recover], startTime:g.startTime, key:"1" },
    { id:"pk2",  name:"Kilnbrook Gas",      kind:"gas",    tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:g.spin, tier:1, condition:100, status:"off", ctrl:true, fail:g.fail, recover:[...g.recover], startTime:g.startTime, key:"2" },
    { id:"pk3",  name:"Forgewell Gas",      kind:"gas",    tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:g.spin, tier:1, condition:100, status:"off", ctrl:true, fail:g.fail, recover:[...g.recover], startTime:g.startTime, key:"3" },
    { id:"bat",  name:"Weircross Battery",  kind:"battery",tech:"battery", cap:120, mc:TECH.battery.mc, tier:1, status:"off",    ctrl:true,  energy:240, maxEnergy:240, key:"B" },
  ];
  for (const u of fleet) u.dials = defaultDials(u); // Phase 2: Core+ dials on every unit
  return fleet;
}

// Factory for a unit added mid-run via the build catalogue. `n` numbers the
// unit for display; `seq` makes its id unique.
export function makeUnit(tech, n, seq){
  const b = BUILD[tech];
  const kind = (tech === "solar" || tech === "wind") ? "renew"
             : tech === "peaker" ? "gas"       // v5 Phase 2: "peaker" builds dial-able fast gas
             : tech === "battery" ? "battery" : "firm";
  const u = { id:`${tech}-${seq}`, name:plantName(tech, n), kind, tech, cap:b.mw, mc:TECH[tech].mc, tier:1,
              status: (kind === "gas" || kind === "battery") ? "off" : "online",
              ctrl: (kind === "gas" || kind === "battery"), key:null };
  if (kind === "firm" || kind === "gas"){ u.condition = 100; u.ageHours = 0; } // mechanical plants wear & can be serviced
  if (kind === "renew") u.cf = tech === "solar" ? SOLAR_CF : WIND_CF;
  if (kind === "battery"){ u.maxEnergy = u.energy = Math.round(b.mw * (b.hours || 2)); }
  if (kind === "firm"){ const p = FIRM_PARAMS[tech] || FIRM_PARAMS.coal; u.spin = p.spin; u.fail = p.fail; u.recover = [...p.recover]; }
  if (kind === "gas"){ const g = CFG.v5.gas; u.spin = g.spin; u.fail = g.fail; u.recover = [...g.recover]; u.startTime = g.startTime; }
  u.dials = defaultDials(u); // Phase 2: Core+ dials
  return u;
}
