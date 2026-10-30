// ============================================================
// PROGRESSION (v5 Phase 7) — the three growth lanes, retiring the v4 Mk ladder.
//
//  • SPECIALIZATION (cash) — raise any of a thermal plant's four KPI attainable-maxes
//    (`u.caps[axis]`) along a STEEPENING per-axis curve. Free development, no branch
//    lock: a plant can take any mix of axes, but spreading thin costs more. The KPI
//    effect curves (kpi.js) read past 100, so a raised cap is a real edge.
//  • RESEARCH (RP) — `raiseCeiling` lifts a tech-family axis's HARD ceiling (how far
//    cash can push it), up to CFG.v5.upgrade.axisMax. (The named v3 tech tree —
//    research.js — stays as-is for build unlocks / buffs.)
//  • ⚡ PERKS — crew roster, research-branch unlocks, and AUTOMATION (auto-maintenance,
//    dispatch assist) that is GROWTH-TIER-GATED: a small grid can't automate, so you
//    feel the clerical burden of scale before you earn the relief.
//
// Pure over `S` (no DOM, no RNG). Automation routes through the Phase 4 scheduleTask /
// Phase 2 dials — relief, never a cheat (it still pays, still obeys quarter-end timing).
// ============================================================
import { CFG } from "./config.js";
import { effectiveMax } from "./kpi.js";
import { scheduleTask } from "./maint.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const AXES = ["reliability", "efficiency", "output", "flexibility"];

// ---- specialization (cash) ----

// How many cash upgrades an axis has already taken (0 at a fresh plant's base).
function axisSteps(u, axis){
  const up = CFG.v5.upgrade;
  return Math.max(0, Math.round(((u.caps?.[axis] ?? up.base) - up.base) / up.step));
}

// The steepening cash cost of the NEXT upgrade on an axis — each point costs more than
// the last. The research "Modular Upgrades" node discounts it (rmods.upgradeDiscount).
export function upgradeCost(S, u, axis){
  const up = CFG.v5.upgrade;
  const raw = up.cost0 * Math.pow(up.costGrowth, axisSteps(u, axis));
  return Math.round(raw * (1 - (S.rmods?.upgradeDiscount ?? 0)));
}

// The hard ceiling an axis can be cash-upgraded to for a tech family: cash alone reaches
// baseCeiling; each RP ceiling-raise (S.capCeil) lifts it by `ceilingStep`, never past axisMax.
export function axisHardCeiling(S, tech, axis){
  const up = CFG.v5.upgrade;
  return Math.min(up.axisMax, up.baseCeiling + (S.capCeil?.[tech]?.[axis] ?? 0));
}

// Can this plant take another upgrade on `axis` right now? (thermal, below the hard
// ceiling, cash on hand).
export function canUpgrade(S, unitId, axis){
  const u = typeof unitId === "object" ? unitId : S.fleet.find(x => x.id === unitId);
  if (!u || !u.caps || !AXES.includes(axis)) return false;
  if (u.caps[axis] + CFG.v5.upgrade.step > axisHardCeiling(S, u.tech, axis)) return false;
  return S.cash >= upgradeCost(S, u, axis);
}

// Spend cash to raise an axis's attainable max by one step, and bump the live KPI up to
// it (the immediate benefit). Refused at the hard ceiling or when short on cash. Returns bool.
export function applyUpgrade(S, unitId, axis){
  const u = S.fleet.find(x => x.id === unitId);
  if (!u || !u.caps || !AXES.includes(axis)) return false;
  const step = CFG.v5.upgrade.step;
  if (u.caps[axis] + step > axisHardCeiling(S, u.tech, axis)) return false; // ceiling blocks
  const cost = upgradeCost(S, u, axis);
  if (S.cash < cost) return false;
  S.cash -= cost;
  u.caps[axis] += step;
  if (u.kpis) u.kpis[axis] = Math.min(u.caps[axis], (u.kpis[axis] ?? 0) + step); // immediate edge
  if (u.kpis) u.condition = Math.min(u.kpis.reliability, u.kpis.efficiency, u.kpis.output, u.kpis.flexibility);
  return true;
}

// ---- research (RP) — the per-tech axis ceiling ----

// How many ceiling-raises a tech+axis has already taken.
function ceilingRaises(S, tech, axis){
  return Math.round((S.capCeil?.[tech]?.[axis] ?? 0) / CFG.v5.upgrade.ceilingStep);
}

// Steepening RP cost of the next ceiling-raise for a tech+axis.
export function ceilingCost(S, tech, axis){
  const up = CFG.v5.upgrade;
  return Math.round(up.ceilingCost0 * Math.pow(up.ceilingGrowth, ceilingRaises(S, tech, axis)));
}

export function canRaiseCeiling(S, tech, axis){
  if (!AXES.includes(axis)) return false;
  if (axisHardCeiling(S, tech, axis) >= CFG.v5.upgrade.axisMax) return false; // already at the absolute max
  return (S.rp || 0) >= ceilingCost(S, tech, axis);
}

// Spend RP to lift a whole tech family's hard ceiling on an axis by one step (never past
// axisMax). Lets a subsequent cash upgrade climb higher. Returns bool.
export function raiseCeiling(S, tech, axis){
  if (!canRaiseCeiling(S, tech, axis)) return false;
  S.rp -= ceilingCost(S, tech, axis);
  (S.capCeil ||= {});
  (S.capCeil[tech] ||= { reliability: 0, efficiency: 0, output: 0, flexibility: 0 });
  S.capCeil[tech][axis] += CFG.v5.upgrade.ceilingStep;
  return true;
}

// ---- ⚡ perks + the automation growth-gate ----

export const PERKS = CFG.v5.perks.list;

// The grid's automation tier: the highest tier index whose fleet-size AND year thresholds
// are both met. A fresh grid sits at tier 0; automation perks need a later tier.
export function automationTier(S){
  const fleet = S.fleet?.length ?? 0, year = S.calendar?.year ?? 1;
  const tiers = CFG.v5.perks.tiers;
  let tier = 0;
  for (let i = 0; i < tiers.length; i++) if (fleet >= tiers[i].fleet && year >= tiers[i].year) tier = i;
  return tier;
}

// Is an automation perk's growth-tier gate satisfied? Non-automation perks are never gated.
export function isAutomationUnlocked(S, perkId){
  const p = PERKS[perkId];
  if (!p || p.kind !== "automation") return true;
  return automationTier(S) >= (p.tier ?? 0);
}

export function canUnlockPerk(S, perkId){
  const p = PERKS[perkId];
  if (!p) return false;
  if (S.perks?.[perkId]) return false;              // already owned
  if (!isAutomationUnlocked(S, perkId)) return false; // growth-gated
  return (S.zap || 0) >= p.cost;
}

// Spend ⚡ to unlock a perk. Automation perks are refused below their growth tier even with
// ample ⚡. Side effects: roster perks raise the crew ceiling; research-branch perks flip the
// meta gate so that branch's nodes become researchable. Returns bool.
export function unlockPerk(S, perkId){
  if (!canUnlockPerk(S, perkId)) return false;
  const p = PERKS[perkId];
  S.zap -= p.cost;
  (S.perks ||= {})[perkId] = true;
  if (p.kind === "roster") S.rosterCap = (S.rosterCap ?? CFG.v5.crews.baseRoster) + (p.rosterBump ?? 1);
  if (p.kind === "research-branch") (S.researchUnlocked ||= {})[p.branch] = true;
  return true;
}

// ---- automation behaviours (active only when their perk is owned) ----

// Auto-maintenance: at the quarter-end review, assign free crews to the neediest plants'
// worst axis while cash allows — relief, not a cheat (routes through scheduleTask, so it
// obeys quarter-end timing, crew availability and cost exactly like a manual plan). Returns
// the Task[] it scheduled.
export function autoMaintenancePlan(S){
  if (!S.perks?.autoMaint) return [];
  const candidates = [];
  for (const u of S.fleet){
    if (!u.kpis || u.maintDown) continue;
    let worstAxis = null, worst = Infinity;
    for (const ax of AXES) if (u.kpis[ax] < worst){ worst = u.kpis[ax]; worstAxis = ax; }
    const cap = u.caps?.[worstAxis] ?? 100;
    if (worstAxis && worst < cap - 1) candidates.push({ u, axis: worstAxis, deficit: cap - worst });
  }
  candidates.sort((a, b) => b.deficit - a.deficit); // worst first
  const scheduled = [];
  for (const c of candidates){
    const freeCrew = (S.crews || []).find(cr => !cr.assignment);
    if (!freeCrew) break;                       // no crews left to assign
    const t = scheduleTask(S, c.u.id, c.axis, freeCrew.id); // enforces planning/cash/crew-free/not-down
    if (t) scheduled.push(t);
  }
  return scheduled;
}

// Dispatch assist: open each committed, UNPINNED thermal plant's band to its legal max each
// tick so output isn't accidentally throttled. Never touches a plant the player pinned
// (u.pin) or a dial value on it. Deterministic (no RNG). Returns the count adjusted.
export function dispatchAssist(S){
  if (!S.perks?.dispatchAssist) return 0;
  let n = 0;
  for (const u of S.fleet){
    if (!u.dials || !(u.kind === "firm" || u.kind === "gas")) continue;
    if (u.pin || !u.dials.commit) continue;     // player-pinned or offline → left alone
    const eMax = effectiveMax(u);
    u.dials.bandMax = eMax;
    u.dials.bandMin = clamp(u.dials.bandMin ?? 0, 0, eMax);
    n++;
  }
  return n;
}
