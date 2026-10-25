// ============================================================
// LIVE ACTIONS — player inputs that mutate state. No DOM; the caller
// (main.js) repaints after an action. Guarded so they only apply during
// live, unpaused play.
// ============================================================
import { setTicker } from "./sim.js";
import { CFG, BUILD, BUILD_GATE, UPGRADE, upgradeCost, serviceCost, salvageValue, makeUnit } from "./config.js";
import { doResearch, researchById } from "./research.js";
import { dailyBaseline } from "./market.js";
import { contractPrice, expectedOutput, makeContract } from "./finance.js";

export function toggleUnit(S, id){
  if (!S.running || S.paused || S.over) return;
  const u = S.fleet.find(x => x.id === id); if (!u || !u.ctrl) return;
  if (u.kind === "battery"){
    if (u.status === "discharge") u.status = "off";
    else if (u.energy > 1) u.status = "discharge";
    else setTicker(S, "Battery depleted — needs surplus capacity to recharge.");
  } else { // peaker
    if (u.status === "off"){ u.status = "starting"; u.startTimer = u.startTime * (S.mods?.startTimeMult ?? 1) * (S.rmods?.startTimeMult ?? 1); }
    else if (u.status === "online" || u.status === "starting") u.status = "off";
  }
}

// Build a new block of capacity of `tech`, paid in in-run cash. Returns
// {ok, msg}; on success the fleet gains a unit (caller rebuilds the cards).
export function buildCapacity(S, tech){
  if (S.over) return { ok:false, msg:"Run is over." };
  const b = BUILD[tech];
  if (!b) return { ok:false, msg:"That can't be built." };
  const gate = BUILD_GATE[tech];
  if (gate && !(S.rmods?.[gate])) return { ok:false, msg:`${b.label} needs research before you can build it.` };
  if (S.cash < b.cost) return { ok:false, msg:"Not enough cash to build that." };
  S.cash -= b.cost;
  // monotonic per-tech number so a build after a sell can't reuse a label
  const n = (S.techCount[tech] = (S.techCount[tech] || 0) + 1);
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
  // Research "Modular Upgrades" amplifies the capacity gain of every Mk tier.
  const capMult = UPGRADE.capMult + (S.rmods?.upgradeCapBonus || 0);
  u.cap = Math.round(u.cap * capMult);
  if (u.kind === "battery") u.maxEnergy = Math.round(u.maxEnergy * capMult);
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
  const cost = Math.round(serviceCost(u) * (S.mods?.repairMult ?? 1));
  if (S.cash < cost) return { ok:false, msg:"Not enough cash to service." };
  S.cash -= cost;
  u.status = "service"; u.serviceTimer = CFG.serviceTime;
  setTicker(S, `${u.name} pulled for service — back in ${CFG.serviceTime}h.`);
  return { ok:true };
}

// Decommission a unit and recover salvage cash. Lets the player transition the
// fleet mix (e.g. retire early coal for nuclear/peakers). The battery is kept
// (the sim tracks a single battery), everything else can go.
export function decommissionUnit(S, id){
  if (S.over) return { ok:false };
  const idx = S.fleet.findIndex(x => x.id === id);
  if (idx < 0) return { ok:false };
  const u = S.fleet[idx];
  if (u.kind === "battery" && S.fleet.filter(x => x.kind === "battery").length <= 1)
    return { ok:false, msg:"Can't retire your last battery." };
  S.cash += salvageValue(u);
  S.fleet.splice(idx, 1);
  setTicker(S, `${u.name} decommissioned — ${u.cap} MW retired for salvage.`);
  return { ok:true };
}

// ---- research / R&D lab (v3) ----

// Set the R&D funding rate ($/game-hour diverted into Research Points). Clamped
// to [0, CFG.rdFundingMax]. Like build/upgrade, usable while the manage/research
// panel is open (paused); only blocked once the run is over.
export function setRdFunding(S, perHour){
  if (S.over) return { ok:false };
  const v = Number(perHour);
  if (!Number.isFinite(v)) return { ok:false, msg:"Invalid funding rate." };
  S.rdFunding = Math.max(0, Math.min(CFG.rdFundingMax, v));
  return { ok:true };
}

// Research a tech node, spending in-run Research Points. Delegates gating/cost
// to research.js; returns its {ok,msg}.
export function researchNode(S, id){
  if (S.over) return { ok:false };
  const res = doResearch(S, id);
  if (res.ok) setTicker(S, `🔬 Research complete — ${researchById(id)?.label || id}.`);
  return res;
}

// ---- v4 "The Book": the Desk — term contracts (Phase B) ----

// Set the hedge dial (fraction of expected output to commit). Clamped to [0,1].
// Only sizes the NEXT hedge contract; existing contracts are untouched.
export function setHedge(S, frac){
  if (S.over) return { ok:false };
  const v = Number(frac);
  if (!Number.isFinite(v)) return { ok:false, msg:"Invalid hedge." };
  S.hedge = Math.max(0, Math.min(1, v));
  return { ok:true };
}

// Sign the standing hedge contract off the dial: commit hedge×expectedOutput MW
// at a term-priced rate. One standing dial contract at a time — signing again
// REPLACES it (locked decision 6), so the dial is a single always-on hedge.
export function hedgeContract(S, term){
  if (S.over) return { ok:false };
  const t = Math.max(CFG.contractTermMin, Math.min(CFG.contractTermMax, Math.round(Number(term) || CFG.contractTermMin)));
  const mw = Math.round(S.hedge * expectedOutput(S.peak));
  S.contracts = (S.contracts || []).filter(c => c.origin !== "dial"); // replace the standing dial hedge
  if (mw <= 0){ setTicker(S, "Hedge dial at 0 — standing contract cleared."); return { ok:true, cleared:true }; }
  const price = contractPrice(dailyBaseline(S.day), t);
  S.contracts.push(makeContract({ mw, price, term:t, origin:"dial", buyer:null, seq:S.contractSeq++ }));
  setTicker(S, `✍ Hedged ${mw} MW at $${price}/MWh for ${t} days.`);
  return { ok:true, mw, price, term:t };
}

// Sign an explicit one-off contract (used by Phase F special offers; also the
// generic signer). `spec` = {mw, price, term, origin, buyer}. Adds, never replaces.
export function signContract(S, spec){
  if (S.over) return { ok:false };
  const { mw, price, term } = spec || {};
  if (!(mw > 0) || !(price >= 0) || !(term > 0)) return { ok:false, msg:"Invalid contract." };
  S.contracts = S.contracts || [];
  S.contracts.push(makeContract({ mw, price, term, origin:spec.origin || "offer", buyer:spec.buyer ?? null, seq:S.contractSeq++ }));
  setTicker(S, `✍ Signed ${Math.round(mw)} MW at $${price}/MWh for ${term} days.`);
  return { ok:true };
}

// Accept / decline the pending special offer (populated by Phase F's offers.js;
// null until then, so these are safe no-ops in B).
export function acceptOffer(S){
  if (S.over || !S.pendingOffer) return { ok:false };
  const res = signContract(S, S.pendingOffer);
  if (res.ok) S.pendingOffer = null;
  return res;
}
export function declineOffer(S){
  if (S.over) return { ok:false };
  S.pendingOffer = null;
  return { ok:true };
}
