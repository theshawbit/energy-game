// ============================================================
// PROGRESSION (v5 Phase 7, reworked by v5.1 Phase 3) — the growth lanes.
//
//  • UPGRADE LADDERS (cash, v5.1 Phase 3) — four parallel 9-tier ladders per plant, one
//    per KPI axis. `u.tiers[axis]` (0..9) drives `u.caps[axis]` (axisTierValue); each tier
//    ~+tierStep of base with a GEOMETRIC cost, so nine tiers (~2.6× base) is a long climb.
//    The KPI effect curves (kpi.js) read past 100, so a raised cap is a real edge. Tiers are
//    bought through the rolling CONTRACTOR queue (contractor.js) — its own labor, never the
//    maintenance crew pool — the fast capacity channel between builds. (This RETIRES Phase 7's
//    instant cash specialization + the RP-family-ceiling lane; RP stays the v3 tech tree.)
//  • ⚡ PERKS — crew roster, research-branch unlocks, and AUTOMATION (auto-maintenance,
//    dispatch assist) that is GROWTH-TIER-GATED: a small grid can't automate, so you feel
//    the clerical burden of scale before you earn the relief. (⚡ funding rehomes to the
//    Phase 6 quarterly currency; kept on S.zap in the interim — see the Phase 3 PR note.)
//
// Pure over `S` (no DOM, no RNG). Automation routes through the Phase 4 queueMaint /
// Phase 2 dials — relief, never a cheat (it still pays, reserves a crew, books downtime).
// ============================================================
import { CFG } from "./config.js";
import { effectiveMax } from "./kpi.js";
import { queueMaint } from "./maint.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const AXES = ["reliability", "efficiency", "output", "flexibility"];

// ---- the per-axis upgrade ladder (v5.1 Phase 3) ----
//
// Four parallel 9-tier cash ladders per plant (one per KPI axis). `u.tiers[axis]` (0..9) is the
// source of truth; it drives `u.caps[axis]` (the attainable max maintenance restores toward) via
// axisTierValue. A tier is BOUGHT through the rolling contractor queue (contractor.js) — this
// module owns the ladder curve + cost + eligibility; the queue owns the money + lead time.

// Nine cash tiers per axis; tier 9 is the cap.
export const upgradeTierMax = CFG.v5_1.upgrade.tierMax;

// The attainable-max an axis reaches at a given tier (0..tierMax): base at tier 0, each tier
// adds `tierStep` of base, so tier 9 lands at ~2.6× base. Pure in config (no RNG).
export function axisTierValue(tier){
  const up = CFG.v5_1.upgrade;
  const t = clamp(Math.round(tier || 0), 0, up.tierMax);
  return Math.round(up.base * (1 + t * up.tierStep));
}

// The steepening cash cost to buy the NEXT tier on `u`'s `axis` — geometric in the current
// tier, so you can't rush to max. Returns Infinity at the cap (tier 9) so callers refuse it.
// `rmods` is optional (stays pure): the Modular Upgrades research node discounts the cost via
// rmods.upgradeDiscount; omitted → the undiscounted ladder cost.
export function upgradeCost(u, axis, rmods){
  const up = CFG.v5_1.upgrade;
  const tier = u?.tiers?.[axis] ?? 0;
  if (tier >= up.tierMax) return Infinity;
  const raw = up.costBase * Math.pow(up.costGrowth, tier);
  return Math.round(raw * (1 - (rmods?.upgradeDiscount ?? 0)));
}

// Can this plant take another tier on `axis` right now? Thermal, below tier 9, cash on hand,
// and not ALREADY queued for that axis (one in-flight upgrade job per axis at a time).
export function canUpgrade(S, unitId, axis){
  const u = typeof unitId === "object" ? unitId : S.fleet.find(x => x.id === unitId);
  if (!u || !u.tiers || !AXES.includes(axis)) return false;
  if ((u.tiers[axis] ?? 0) >= CFG.v5_1.upgrade.tierMax) return false;
  if ((S.contractor || []).some(j => j.unitId === u.id && j.axis === axis)) return false;
  return S.cash >= upgradeCost(u, axis, S.rmods);
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

// Auto-maintenance (v5.1 Phase 4: now ROLLING): assign free crews to the neediest plants' worst
// axis while cash allows — relief, not a cheat (routes through queueMaint, so it still pays,
// reserves a crew, books downtime and obeys the rolling calendar exactly like a manual queue).
// Called daily by the sim when the perk is owned. Returns the MaintJob[] it queued.
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
  const queued = [];
  for (const c of candidates){
    const freeCrew = (S.crews || []).find(cr => !cr.assignment);
    if (!freeCrew) break;                       // no crews left to assign
    const j = queueMaint(S, c.u.id, c.axis, freeCrew.id); // enforces cash/crew-free/not-down/not-queued
    if (j) queued.push(j);
  }
  return queued;
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
