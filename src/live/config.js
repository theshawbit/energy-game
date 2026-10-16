// ============================================================
// LIVE CONFIG — tuning knobs and the starting fleet definition.
// Pure data (plus one factory). No state, no DOM. Safe to import anywhere.
// ============================================================
import { SOLAR_CF, WIND_CF, TECH } from "../constants.js";

// ---- tuning (meant to be played with) ----
export const CFG = {
  secondsPerDay: 48,          // real seconds for a 24h cycle (1 hour ≈ 2s)
  startHour: 6,               // shift begins at 06:00
  startPeak: 780,             // MW peak demand, day 1
  peakGrowth: 1.06,           // demand growth per day survived
  spinCost: 11,               // $/MW/h default to keep a thermal plant synced (per-unit `spin` overrides)
  strainRate: 55,             // strain gained per second at 100% shortfall
  strainRecover: 45,          // strain shed per second when covered
  instantBlackout: 0.30,      // shortfall/demand above this = immediate blackout
  battRecharge: 70,           // MW recharge rate when idle
  carbonStartDay: 3,          // carbon pricing kicks in after the opening days
  carbonPerDay: 3.5,          // $/t added each day thereafter (~day 13 flips coal→gas)
};

// ---- fleet definition ----
// kind: firm (always-on thermal), renew (variable), peaker (reserve), battery
// `tech` maps each unit onto an engine resource; `mc` mirrors TECH so the cards
// and the dispatchHour() clearing agree on one set of economics.
export function makeFleet() {
  return [
    { id:"nuc",  name:"Nuclear",   kind:"firm",   tech:"nuclear", cap:250, mc:TECH.nuclear.mc, spin:2,  status:"online", ctrl:false, fail:0.010, recover:[6,10], key:null },
    { id:"colA", name:"Coal A",    kind:"firm",   tech:"coal",    cap:180, mc:TECH.coal.mc,    spin:4,  status:"online", ctrl:false, fail:0.030, recover:[2,4],  key:null },
    { id:"colB", name:"Coal B",    kind:"firm",   tech:"coal",    cap:140, mc:TECH.coal.mc,    spin:4,  status:"online", ctrl:false, fail:0.030, recover:[2,4],  key:null },
    { id:"sol",  name:"Solar farm",kind:"renew",  tech:"solar",   cap:220, mc:TECH.solar.mc,   status:"online", ctrl:false, cf:SOLAR_CF, key:null },
    { id:"wnd",  name:"Wind",      kind:"renew",  tech:"wind",    cap:160, mc:TECH.wind.mc,    status:"online", ctrl:false, cf:WIND_CF,  key:null },
    { id:"pk1",  name:"Peaker 1",  kind:"peaker", tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:11, status:"off",    ctrl:true,  fail:0.015, recover:[1.5,3], startTime:1.6, key:"1" },
    { id:"pk2",  name:"Peaker 2",  kind:"peaker", tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:11, status:"off",    ctrl:true,  fail:0.015, recover:[1.5,3], startTime:1.6, key:"2" },
    { id:"pk3",  name:"Peaker 3",  kind:"peaker", tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:11, status:"off",    ctrl:true,  fail:0.015, recover:[1.5,3], startTime:1.6, key:"3" },
    { id:"bat",  name:"Battery",   kind:"battery",tech:"battery", cap:120, mc:TECH.battery.mc, status:"off",    ctrl:true,  energy:240, maxEnergy:240, key:"B" },
  ];
}
