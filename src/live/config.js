// ============================================================
// LIVE CONFIG — tuning knobs, the starting fleet, and a factory for
// newly-built units. Pure data (plus factories). No state, no DOM.
// ============================================================
import { SOLAR_CF, WIND_CF, TECH } from "../constants.js";

// ---- tuning (meant to be played with) ----
export const CFG = {
  secondsPerDay: 48,          // real seconds for a 24h cycle (1 hour ≈ 2s)
  startHour: 6,               // shift begins at 06:00
  startPeak: 780,             // MW peak demand, day 1
  startCash: 120000,          // $ on hand day 1, so the manage panel has an opening move
  peakGrowth: 1.06,           // demand growth per day survived
  spinCost: 11,               // $/MW/h default to keep a thermal plant synced (per-unit `spin` overrides)
  fixedOM: 10,                // $/MW/h fixed operating cost on dispatchable capacity (renewables exempt; owning it costs money)
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
  wearRate: 0.7,              // condition %/game-hour lost while a plant generates
  wearTripK: 3,               // worn plants trip up to (1+K)× as often at 0% condition
  serviceTime: 4,             // game-hours a plant is offline for a full service
  repairPerMW: 90,            // $/MW of capacity to fully service a wrecked plant
  repairMin: 4000,            // minimum service charge
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
  },
  // ---- v4 "The Book": spot market + term contracts (Phase B) ----
  // Revenue = contracted blocks at a locked price + residual served load at spot.
  // Spot = a flat-ish baseline + a scarcity premium driven by the player's OWN
  // reserve margin (thin → spike, flush → crash); mutators compound it. Baseline
  // is deliberately small vs scarcityMax so the player's dispatch moves the price.
  spotBase: 50,               // $/MWh flat baseline the spot price sits around
  spotDaily: 0.25,            // how much the daily demand shape lifts/drops the baseline hour to hour
  spotDrift: 0.015,           // slow per-day upward drift of the baseline (a gentle cost-of-living climb)
  spotFloor: 8,               // $/MWh hard floor (a flush grid still clears above zero)
  spotCap: 320,               // $/MWh hard ceiling on spot (scarcity can't run away)
  scarcityMax: 240,           // $/MWh premium at a tight/short grid (PLATEAUS — no deeper-shortfall windfall)
  crashMax: 42,               // $/MWh discount a flush grid suffers (plateaus at rmCrash)
  rmRef: 0.25,                // reserve margin where the premium hits zero (healthy headroom)
  rmCrash: 0.80,              // reserve margin where the crash discount plateaus (hugely overbuilt)
  // term contracts (the hedge): lock load at a fixed price for a run of days
  hedgeDefault: 0.5,          // default hedge dial — commit ~half of expected output
  hedgeBaseFactor: 0.90,      // a 1-day lock earns ~90% of baseline (you pay for certainty)
  hedgeTermBonus: 0.035,      // each extra day of term lifts the locked rate this much
  hedgePriceCap: 1.35,        // a long lock can't beat baseline by more than this
  contractTermMin: 2,         // shortest term the dial offers (game-days)
  contractTermMax: 6,         // longest term the dial offers (game-days)
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
};

// Cost to service a unit back to 100% condition: scales with how worn it is and
// how big it is, plus a floor. Proactive service on a healthy plant is cheap.
export function serviceCost(u){
  const damage = Math.max(0, 1 - (u.condition ?? 100) / 100);
  return Math.round(CFG.repairPerMW * u.cap * damage) + CFG.repairMin;
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
  peaker:  { label:"Peaker",     mw:55,  cost:45000 },
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
  nuclear:  { spin:2, fail:0.006, recover:[5, 9] },
  smr:      { spin:2, fail:0.006, recover:[5, 9] },
  geo:      { spin:3, fail:0.007, recover:[3, 6] },
  coal:     { spin:4, fail:0.013, recover:[1.5, 3] },
  ccs_coal: { spin:4, fail:0.013, recover:[1.5, 3] },
  ccs_gas:  { spin:4, fail:0.011, recover:[1.5, 3] },
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

// ---- fleet definition ----
// kind: firm (always-on thermal), renew (variable), peaker (reserve), battery
// `tech` maps each unit onto an engine resource; `mc` mirrors TECH so the cards
// and the dispatchHour() clearing agree on one set of economics.
export function makeFleet() {
  return [
    { id:"nuc",  name:"Nuclear",   kind:"firm",   tech:"nuclear", cap:250, mc:TECH.nuclear.mc, spin:2,  tier:1, condition:100, status:"online", ctrl:false, fail:0.006, recover:[5,9],  key:null },
    { id:"colA", name:"Coal A",    kind:"firm",   tech:"coal",    cap:180, mc:TECH.coal.mc,    spin:4,  tier:1, condition:100, status:"online", ctrl:false, fail:0.013, recover:[1.5,3], key:null },
    { id:"colB", name:"Coal B",    kind:"firm",   tech:"coal",    cap:140, mc:TECH.coal.mc,    spin:4,  tier:1, condition:100, status:"online", ctrl:false, fail:0.013, recover:[1.5,3], key:null },
    { id:"sol",  name:"Solar farm",kind:"renew",  tech:"solar",   cap:220, mc:TECH.solar.mc,   tier:1, status:"online", ctrl:false, cf:SOLAR_CF, key:null },
    { id:"wnd",  name:"Wind",      kind:"renew",  tech:"wind",    cap:160, mc:TECH.wind.mc,    tier:1, status:"online", ctrl:false, cf:WIND_CF,  key:null },
    { id:"pk1",  name:"Peaker 1",  kind:"peaker", tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:11, tier:1, condition:100, status:"off",    ctrl:true,  fail:0.009, recover:[1.5,3], startTime:1.6, key:"1" },
    { id:"pk2",  name:"Peaker 2",  kind:"peaker", tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:11, tier:1, condition:100, status:"off",    ctrl:true,  fail:0.009, recover:[1.5,3], startTime:1.6, key:"2" },
    { id:"pk3",  name:"Peaker 3",  kind:"peaker", tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:11, tier:1, condition:100, status:"off",    ctrl:true,  fail:0.009, recover:[1.5,3], startTime:1.6, key:"3" },
    { id:"bat",  name:"Battery",   kind:"battery",tech:"battery", cap:120, mc:TECH.battery.mc, tier:1, status:"off",    ctrl:true,  energy:240, maxEnergy:240, key:"B" },
  ];
}

// Factory for a unit added mid-run via the build catalogue. `n` numbers the
// unit for display; `seq` makes its id unique.
export function makeUnit(tech, n, seq){
  const b = BUILD[tech];
  const kind = (tech === "solar" || tech === "wind") ? "renew"
             : tech === "peaker" ? "peaker"
             : tech === "battery" ? "battery" : "firm";
  const u = { id:`${tech}-${seq}`, name:`${b.label} ${n}`, kind, tech, cap:b.mw, mc:TECH[tech].mc, tier:1,
              status: (kind === "peaker" || kind === "battery") ? "off" : "online",
              ctrl: (kind === "peaker" || kind === "battery"), key:null };
  if (kind === "firm" || kind === "peaker") u.condition = 100; // mechanical plants wear & can be serviced
  if (kind === "renew") u.cf = tech === "solar" ? SOLAR_CF : WIND_CF;
  if (kind === "battery"){ u.maxEnergy = u.energy = Math.round(b.mw * (b.hours || 2)); }
  if (kind === "firm"){ const p = FIRM_PARAMS[tech] || FIRM_PARAMS.coal; u.spin = p.spin; u.fail = p.fail; u.recover = [...p.recover]; }
  if (kind === "peaker"){ u.spin = 11; u.fail = 0.009; u.recover = [1.5, 3]; u.startTime = 1.6; }
  return u;
}
