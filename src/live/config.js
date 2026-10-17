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
  retailPrice: 62,            // $/MWh the city pays for SERVED energy. Revenue is retail×served,
                              //   NOT the volatile wholesale clearing price — so a shortfall can
                              //   never be a scarcity jackpot. Wholesale/carbon still drive costs.
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
// cost is a live-tuned capital cost ($); mw is the block size. Battery is
// upgrade-only (the sim tracks a single battery), so it is absent here.
export const BUILD = {
  solar:   { label:"Solar farm", mw:60,  cost:50000 },
  wind:    { label:"Wind",       mw:50,  cost:55000 },
  nuclear: { label:"Nuclear",    mw:100, cost:220000 },
  coal:    { label:"Coal",       mw:60,  cost:70000 },
  peaker:  { label:"Peaker",     mw:55,  cost:45000 },
};
export const BUILD_ORDER = ["solar", "wind", "battery", "coal", "peaker", "nuclear"];

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
    { id:"bat",  name:"Battery",   kind:"battery",tech:"battery", cap:120, mc:TECH.battery.mc, tier:1, condition:100, status:"off",    ctrl:true,  energy:240, maxEnergy:240, key:"B" },
  ];
}

// Factory for a unit added mid-run via the build catalogue. `n` numbers the
// unit for display; `seq` makes its id unique.
export function makeUnit(tech, n, seq){
  const b = BUILD[tech];
  const kind = (tech === "solar" || tech === "wind") ? "renew" : tech === "peaker" ? "peaker" : "firm";
  const u = { id:`${tech}-${seq}`, name:`${b.label} ${n}`, kind, tech, cap:b.mw, mc:TECH[tech].mc, tier:1,
              status: kind === "peaker" ? "off" : "online", ctrl: kind === "peaker", key:null };
  if (kind !== "renew") u.condition = 100; // mechanical plants wear and can be serviced
  if (kind === "renew") u.cf = tech === "solar" ? SOLAR_CF : WIND_CF;
  if (kind === "firm"){ u.spin = tech === "nuclear" ? 2 : 4; u.fail = tech === "nuclear" ? 0.006 : 0.013; u.recover = tech === "nuclear" ? [5, 9] : [1.5, 3]; }
  if (kind === "peaker"){ u.spin = 11; u.fail = 0.009; u.recover = [1.5, 3]; u.startTime = 1.6; }
  return u;
}
