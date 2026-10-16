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
];
// Cost to buy the next level given how many are already owned.
export function skillCost(skill, owned){ return skill.baseCost * (owned + 1); }

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
  };
}

// ---- end-of-run scoring & meta-currency ----
export function scoreRun(S){
  const days = Math.max(0, S.day - 1);
  const uptime = (S.upAcc + S.downAcc) > 0 ? S.upAcc / (S.upAcc + S.downAcc) : 1;
  const milestones = (S.milestonesHit || []).length;
  const score = Math.round(
    days * 25 +
    S.peak / 100 * 8 +
    Math.max(0, S.cash) / 10000 * 3 +
    uptime * 60 +
    milestones * 20
  );
  return { score, days, uptime, milestones };
}
export function currencyFor(score){ return Math.max(1, Math.round(score / 15)); }

// Effective per-day demand growth after the Efficiency Drive skill.
export function effPeakGrowth(mods){ return 1 + (CFG.peakGrowth - 1) * mods.peakGrowthMult; }
