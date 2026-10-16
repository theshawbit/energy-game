// ============================================================
// LIVE ACTIONS — player inputs that mutate state. No DOM; the caller
// (main.js) repaints after an action. Guarded so they only apply during
// live, unpaused play.
// ============================================================
import { setTicker } from "./sim.js";
import { CFG, BUILD, UPGRADE, upgradeCost, serviceCost, makeUnit } from "./config.js";

export function toggleUnit(S, id){
  if (!S.running || S.paused || S.over) return;
  const u = S.fleet.find(x => x.id === id); if (!u || !u.ctrl) return;
  if (u.kind === "battery"){
    if (u.status === "discharge") u.status = "off";
    else if (u.energy > 1) u.status = "discharge";
    else setTicker(S, "Battery depleted — needs surplus capacity to recharge.");
  } else { // peaker
    if (u.status === "off"){ u.status = "starting"; u.startTimer = u.startTime; }
    else if (u.status === "online" || u.status === "starting") u.status = "off";
  }
}

// Build a new block of capacity of `tech`, paid in in-run cash. Returns
// {ok, msg}; on success the fleet gains a unit (caller rebuilds the cards).
export function buildCapacity(S, tech){
  if (S.over) return { ok:false, msg:"Run is over." };
  const b = BUILD[tech];
  if (!b) return { ok:false, msg:"That can't be built." };
  if (S.cash < b.cost) return { ok:false, msg:"Not enough cash to build that." };
  S.cash -= b.cost;
  const n = S.fleet.filter(u => u.tech === tech).length + 1;
  S.fleet.push(makeUnit(tech, n, S.buildSeq++));
  setTicker(S, `✓ Built ${b.label} ${n} — +${b.mw} MW online.`);
  return { ok:true };
}

// Upgrade one unit to the next Mk tier: +capacity, −trip rate, −standby cost.
export function upgradeUnit(S, id){
  if (S.over) return { ok:false };
  const u = S.fleet.find(x => x.id === id); if (!u) return { ok:false };
  if ((u.tier || 1) >= UPGRADE.maxTier) return { ok:false, msg:"Already at max tier." };
  const cost = upgradeCost(u.tier || 1);
  if (S.cash < cost) return { ok:false, msg:"Not enough cash to upgrade that." };
  S.cash -= cost;
  u.tier = (u.tier || 1) + 1;
  u.cap = Math.round(u.cap * UPGRADE.capMult);
  if (u.kind === "battery") u.maxEnergy = Math.round(u.maxEnergy * UPGRADE.capMult);
  if (u.fail != null) u.fail *= UPGRADE.failMult;
  if (u.spin != null) u.spin *= UPGRADE.spinMult;
  setTicker(S, `✓ ${u.name} upgraded to Mk ${u.tier}.`);
  return { ok:true };
}

// Pull a unit for scheduled service: it goes offline for CFG.serviceTime
// game-hours (the downtime cost), then returns at 100% condition. Costs cash
// scaled by how worn it is. The gamble is losing that capacity now vs. a trip
// at the worst moment later.
export function serviceUnit(S, id){
  if (S.over) return { ok:false };
  const u = S.fleet.find(x => x.id === id); if (!u || u.condition == null) return { ok:false, msg:"Nothing to service." };
  if (u.status === "service") return { ok:false, msg:"Already in service." };
  const cost = serviceCost(u);
  if (S.cash < cost) return { ok:false, msg:"Not enough cash to service." };
  S.cash -= cost;
  u.status = "service"; u.serviceTimer = CFG.serviceTime;
  setTicker(S, `${u.name} pulled for service — back in ${CFG.serviceTime}h.`);
  return { ok:true };
}
