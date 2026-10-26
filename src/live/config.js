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
  wearRate: 0.7,              // condition %/game-hour lost while a plant generates
  // v4.2.1: trip risk is tied to CONDITION via this lookup — [condition%, daily
  // strain probability] for a REFERENCE plant at fail = tripRefFail (coal). A
  // plant's own u.fail scales it (nuclear is more reliable; an upgrade that cuts
  // u.fail cuts trips too). Healthy plants are near-immune; the mid-band is
  // deliberately punishing; condition ≤ the last point plateaus. Edit freely.
  tripOdds: [[100,0.001],[90,0.002],[85,0.004],[77,0.008],[70,0.024],[60,0.124],[50,0.372],[40,0.558],[30,0.6667]],
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

// ---- fleet definition ----
// kind: firm (always-on thermal), renew (variable), peaker (reserve), battery
// `tech` maps each unit onto an engine resource; `mc` mirrors TECH so the cards
// and the dispatchHour() clearing agree on one set of economics.
export function makeFleet() {
  return [
    { id:"nuc",  name:"Nuclear",   kind:"firm",   tech:"nuclear", cap:250, mc:TECH.nuclear.mc, spin:2,  tier:1, condition:100, status:"online", ctrl:false, fail:0.0020, recover:[5,9],  key:null },
    { id:"colA", name:"Coal A",    kind:"firm",   tech:"coal",    cap:180, mc:TECH.coal.mc,    spin:4,  tier:1, condition:100, status:"online", ctrl:false, fail:0.0045, recover:[1.5,3], key:null },
    { id:"colB", name:"Coal B",    kind:"firm",   tech:"coal",    cap:140, mc:TECH.coal.mc,    spin:4,  tier:1, condition:100, status:"online", ctrl:false, fail:0.0045, recover:[1.5,3], key:null },
    { id:"sol",  name:"Solar farm",kind:"renew",  tech:"solar",   cap:220, mc:TECH.solar.mc,   tier:1, status:"online", ctrl:false, cf:SOLAR_CF, key:null },
    { id:"wnd",  name:"Wind",      kind:"renew",  tech:"wind",    cap:160, mc:TECH.wind.mc,    tier:1, status:"online", ctrl:false, cf:WIND_CF,  key:null },
    { id:"pk1",  name:"Peaker 1",  kind:"peaker", tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:11, tier:1, condition:100, status:"off",    ctrl:true,  fail:0.0030, recover:[1.5,3], startTime:1.6, key:"1" },
    { id:"pk2",  name:"Peaker 2",  kind:"peaker", tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:11, tier:1, condition:100, status:"off",    ctrl:true,  fail:0.0030, recover:[1.5,3], startTime:1.6, key:"2" },
    { id:"pk3",  name:"Peaker 3",  kind:"peaker", tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:11, tier:1, condition:100, status:"off",    ctrl:true,  fail:0.0030, recover:[1.5,3], startTime:1.6, key:"3" },
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
  if (kind === "peaker"){ u.spin = 11; u.fail = 0.0030; u.recover = [1.5, 3]; u.startTime = 1.6; }
  return u;
}
