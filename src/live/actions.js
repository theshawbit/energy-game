// ============================================================
// LIVE ACTIONS — player inputs that mutate state. No DOM; the caller
// (main.js) repaints after an action. Guarded so they only apply during
// live, unpaused play.
// ============================================================
import { setTicker } from "./sim.js";
import { CFG, BUILD, BUILD_GATE, UPGRADE, upgradeCost, serviceCost, salvageValue, makeUnit } from "./config.js";
import { doResearch, researchById } from "./research.js";
import { dailyBaseline } from "./market.js";
import { contractPrice, expectedOutput, makeContract, creditRating } from "./finance.js";

export function toggleUnit(S, id){
  if (!S.running || S.paused || S.over) return;
  const u = S.fleet.find(x => x.id === id); if (!u || !u.ctrl) return;
  if (u.kind === "battery"){
    if (u.status === "discharge") u.status = "off";
    else if (u.energy > 1) u.status = "discharge";
    else setTicker(S, "Battery depleted — needs surplus capacity to recharge.");
  } else { // peaker
    if (u.status === "off"){ u.status = "starting"; u.startTimer = u.startTime * (S.mods?.startTimeMult ?? 1) * (S.rmods?.startTimeMult ?? 1); }
    // online / starting / strained → stand down (standing a STRAINED peaker down on
    // your terms clears the strain, so the warning window buys you real agency)
    else if (u.status === "online" || u.status === "starting" || u.status === "strained"){ u.status = "off"; u.strainTimer = 0; }
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

// Sign a hedge contract off the dial: commit hedge×expectedOutput MW at a
// term-priced rate. v4.1: ADDITIVE — each sign LAYERS a new contract onto the book
// (a ladder of terms/prices/sizes), up to CFG.hedgeMaxContracts standing hedges, so
// you can build and roll a real hedge position instead of a single all-or-nothing
// dial. Cancel individual legs with cancelContract.
export function hedgeContract(S, term){
  if (S.over) return { ok:false };
  const t = Math.max(CFG.contractTermMin, Math.min(CFG.contractTermMax, Math.round(Number(term) || CFG.contractTermMin)));
  const mw = Math.round(S.hedge * expectedOutput(S.peak));
  if (mw <= 0){ setTicker(S, "Hedge dial at 0 — nothing to sign."); return { ok:false, msg:"Raise the hedge dial above 0 first." }; }
  const dialCount = (S.contracts || []).filter(c => c.origin === "dial").length;
  if (dialCount >= CFG.hedgeMaxContracts) return { ok:false, msg:`Hedge book full (${CFG.hedgeMaxContracts} standing legs) — cancel one first.` };
  const price = contractPrice(dailyBaseline(S.day), t);
  S.contracts = S.contracts || [];
  S.contracts.push(makeContract({ mw, price, term:t, origin:"dial", buyer:null, seq:S.contractSeq++ }));
  setTicker(S, `✍ Hedged ${mw} MW at $${price}/MWh for ${t} days — ${dialCount + 1} leg${dialCount ? "s" : ""} on the book.`);
  return { ok:true, mw, price, term:t };
}

// Cancel one standing contract by id (a hedge leg or an accepted offer). Lets the
// player manage the ladder — trim an over-hedge, drop a leg that's no longer wanted.
export function cancelContract(S, id){
  if (S.over) return { ok:false };
  const before = (S.contracts || []).length;
  S.contracts = (S.contracts || []).filter(c => c.id !== id);
  if (S.contracts.length === before) return { ok:false, msg:"No such contract." };
  setTicker(S, "Contract cancelled — that block clears at spot again.");
  return { ok:true };
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
// null until then, so these are safe no-ops in B). The offer carries a priceMult
// applied to the standard term-contract rate for its term.
export function acceptOffer(S){
  if (S.over || !S.pendingOffer) return { ok:false };
  const o = S.pendingOffer;
  const price = Math.round(contractPrice(dailyBaseline(S.day), o.termDays) * (o.priceMult ?? 1));
  const res = signContract(S, { mw:o.mw, price, term:o.termDays, origin:"offer", buyer:o.buyerName });
  if (res.ok) S.pendingOffer = null;
  return res;
}
export function declineOffer(S){
  if (S.over) return { ok:false };
  S.pendingOffer = null;
  return { ok:true };
}

// ---- v4 "The Book": the Desk — financing (Phase C) ----

// Draw down debt (cash now, interest forever). Refused past the credit ceiling.
export function borrow(S, amount){
  if (S.over) return { ok:false };
  const a = Math.round(Number(amount) || 0);
  if (a <= 0) return { ok:false, msg:"Enter an amount to borrow." };
  const ceiling = creditRating(S.credit).ceiling;
  if ((S.debt || 0) + a > ceiling) return { ok:false, msg:`Over your $${ceiling.toLocaleString()} credit ceiling.` };
  S.debt = (S.debt || 0) + a; S.cash += a;
  (S.debtLedger = S.debtLedger || []).push({ type:"borrow", day:S.day, amount:a });
  setTicker(S, `＄ Borrowed $${a.toLocaleString()} — debt now $${Math.round(S.debt).toLocaleString()}.`);
  return { ok:true };
}

// Repay debt from cash. Clamped to what's owed and what's on hand (can't repay
// into the red). Lower debt → less interest and a faster credit rebuild.
export function repay(S, amount){
  if (S.over) return { ok:false };
  const a = Math.min(Math.round(Number(amount) || 0), S.debt || 0, Math.max(0, S.cash));
  if (a <= 0) return { ok:false, msg:"Nothing to repay (or no spare cash)." };
  S.debt -= a; S.cash -= a;
  (S.debtLedger = S.debtLedger || []).push({ type:"repay", day:S.day, amount:a });
  setTicker(S, `＄ Repaid $${a.toLocaleString()} — debt now $${Math.round(S.debt).toLocaleString()}.`);
  return { ok:true };
}

// ---- v4 "The Book": capacity market (Phase F, gated by the economy unlock) ----

// Take on a capacity obligation: commit to keeping `reserveMW` of firm capacity
// available for a term, earning an availability payment — and risking a breach
// fine if a call finds you short. One obligation at a time. reserveMW defaults to
// ~40% of current firm+peaker capacity (what a prudent operator can actually back).
export function takeCapacityObligation(S, term = 4){
  if (S.over) return { ok:false };
  if (!(S.economyUnlocked && S.economyUnlocked["capacity-market"])) return { ok:false, msg:"Capacity Market not unlocked." };
  if (S.capacityObligation) return { ok:false, msg:"Already under a capacity obligation." };
  const firm = S.fleet.reduce((a, u) => a + ((u.kind === "firm" || u.kind === "peaker") ? u.cap : 0), 0);
  const reserveMW = Math.round(0.4 * firm);
  if (reserveMW <= 0) return { ok:false, msg:"No firm capacity to pledge." };
  const termDays = Math.max(2, Math.min(6, Math.round(Number(term) || 4)));
  S.capacityObligation = { reserveMW, pricePerMW:CFG.capacity.pricePerMW, termDays, daysLeft:termDays, calledToday:false };
  setTicker(S, `✍ Capacity obligation — ${reserveMW} MW reserve for ${termDays} days at $${CFG.capacity.pricePerMW}/MW/day.`);
  return { ok:true };
}

// Exit the capacity obligation early (stops payments; no exit fee).
export function dropCapacityObligation(S){
  if (S.over) return { ok:false };
  if (!S.capacityObligation) return { ok:false };
  S.capacityObligation = null;
  setTicker(S, "Capacity obligation ended.");
  return { ok:true };
}
