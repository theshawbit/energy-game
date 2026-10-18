// ============================================================
// META — roguelike progression logic. Pure: no state object mutation beyond
// what callers pass, no DOM, no storage. Defines run milestones, end-of-run
// scoring, the meta-currency award, and the permanent skill tree (how owned
// skills turn into per-run modifiers).
// ============================================================
import { CFG } from "./config.js";

// ---- in-run milestones (near-term goals; award score at end of run) ----
export const MILESTONES = [
  { id:"p900",  kind:"peak", at:900,     label:"Peak 900 MW" },
  { id:"p1200", kind:"peak", at:1200,    label:"Peak 1.2 GW" },
  { id:"p1600", kind:"peak", at:1600,    label:"Peak 1.6 GW" },
  { id:"c200k", kind:"cash", at:200000,  label:"$200k banked" },
  { id:"c500k", kind:"cash", at:500000,  label:"$500k banked" },
  { id:"c1m",   kind:"cash", at:1000000, label:"$1M banked" },
];

// Milestones newly reached this tick (threshold met and not already recorded).
export function newMilestones(S){
  const hit = S.milestonesHit || [];
  return MILESTONES.filter(m => !hit.includes(m.id) &&
    ((m.kind === "peak" && S.peak >= m.at) || (m.kind === "cash" && S.cash >= m.at)));
}

// ---- skill tree (permanent, bought between runs with meta-currency) ----
export const SKILLS = [
  { id:"reserves",    name:"Grid Reserves",    max:3, baseCost:5, desc:"+$40k starting cash / level" },
  { id:"maintenance", name:"Maintenance Crew", max:3, baseCost:6, desc:"−15% wear & repair cost / level" },
  { id:"faststart",   name:"Fast Start",       max:3, baseCost:5, desc:"−20% peaker spin-up / level" },
  { id:"efficiency",  name:"Efficiency Drive", max:3, baseCost:7, desc:"−10% demand growth / level" },
  { id:"battery",     name:"Battery Science",  max:3, baseCost:6, desc:"+20% battery capacity / level" },
  { id:"servicemgr",  name:"Service Manager",  max:3, baseCost:8, desc:"auto-services worn plants (higher = sooner)" },
];
// Condition threshold the Service Manager auto-services below, by owned level.
const AUTO_SERVICE_AT = [0, 40, 55, 70];
// Cost to buy the next level given how many are already owned.
export function skillCost(skill, owned){ return skill.baseCost * (owned + 1); }

// ---- research unlocks (v3): meta-currency permanently opens a research BRANCH
// so the in-run tree grows across runs. One-time purchases (not leveled), kept
// in their own list/tab, distinct from the passive SKILLS above. The `id` is the
// flag each gated research node names via its `metaGate`. ----
export const RESEARCH_UNLOCKS = [
  { id:"storage", name:"Grid Storage R&D",       cost:4, desc:"Unlock the storage research branch (power, depth, fast charge)" },
  { id:"demand",  name:"Demand-Side R&D",        cost:4, desc:"Unlock demand-response research (shave the peak)" },
  { id:"advgen",  name:"Advanced Generation R&D", cost:6, desc:"Unlock SMR, geothermal & carbon-capture research" },
];

// Buy a research-branch unlock into `profile` (mutates it). Returns true on
// success, false if unknown / already owned / unaffordable.
export function buyUnlock(profile, id){
  const u = RESEARCH_UNLOCKS.find(x => x.id === id); if (!u) return false;
  if (profile.researchUnlocked?.[id]) return false;
  if (profile.currency < u.cost) return false;
  profile.currency -= u.cost;
  (profile.researchUnlocked ||= {})[id] = true;
  return true;
}

// Buy the next level of a skill into `profile` (mutates it). Returns true on
// success, false if unknown / maxed / unaffordable.
export function buySkill(profile, id){
  const sk = SKILLS.find(s => s.id === id); if (!sk) return false;
  const owned = profile.skills[id] || 0;
  if (owned >= sk.max) return false;
  const cost = skillCost(sk, owned);
  if (profile.currency < cost) return false;
  profile.currency -= cost;
  profile.skills[id] = owned + 1;
  return true;
}

// Turn owned skill levels into the per-run modifiers the sim reads.
export function computeMods(skills = {}){
  const lv = id => skills[id] || 0;
  return {
    startCashBonus: 40000 * lv("reserves"),
    wearMult:       Math.pow(0.85, lv("maintenance")),
    repairMult:     Math.pow(0.85, lv("maintenance")),
    startTimeMult:  Math.pow(0.80, lv("faststart")),
    peakGrowthMult: Math.pow(0.90, lv("efficiency")), // scales the growth *above* 1.0
    battMult:       1 + 0.20 * lv("battery"),
    autoServiceAt:  AUTO_SERVICE_AT[lv("servicemgr")] || 0, // 0 = Service Manager not owned
  };
}

// ---- end-of-run scoring & meta-currency ----
export function scoreRun(S){
  const days = Math.max(0, S.day - 1);
  const uptime = (S.upAcc + S.downAcc) > 0 ? S.upAcc / (S.upAcc + S.downAcc) : 1;
  const milestones = (S.milestonesHit || []).length;
  // Reward good operation — days survived, reliability (uptime), and milestones
  // — over cash. Cash is a minor bonus so hoarding (or a lucky run) can't
  // dominate the score the way a scarcity windfall once did.
  const score = Math.round(
    days * 40 +
    uptime * 110 +
    milestones * 25 +
    S.peak / 100 * 6 +
    Math.max(0, S.cash) / 50000 * 4
  );
  return { score, days, uptime, milestones };
}
export function currencyFor(score){ return Math.max(1, Math.round(score / 15)); }

// Effective per-day demand growth after the Efficiency Drive skill.
export function effPeakGrowth(mods){ return 1 + (CFG.peakGrowth - 1) * mods.peakGrowthMult; }
