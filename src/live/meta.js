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
  { id:"forecasting", name:"Forecasting Desk R&D", cost:5, desc:"Unlock the spot-price forecasting branch (sharpen the band)" },
];

// ---- economy unlocks (v4, Phase F): one-time buys in their own meta tab that
// bloom the Book's complexity across runs. Spend ONLY meta-currency (⚡), written
// to profile.economyUnlocked (from the p0 migration). `forecasting` is NOT here —
// it ships as a research-branch unlock (see RESEARCH_UNLOCKS) to keep one buy path. ----
export const ECONOMY_UNLOCKS = [
  { id:"capacity-market", name:"Capacity Market", cost:8, desc:"Get paid for available reserve MW — and fined if you can't deliver when called" },
  { id:"special-offers",  name:"Rolodex",         cost:4, desc:"Named buyers bring occasional standout contracts to the Desk" },
  { id:"runlen-1", name:"Longer Shifts I",   cost:4, desc:"+2 max run days (longer contracts to operate)" },
  { id:"runlen-2", name:"Longer Shifts II",  cost:6, desc:"+2 more max run days", prereq:"runlen-1" },
  { id:"runlen-3", name:"Longer Shifts III", cost:8, desc:"+3 more max run days", prereq:"runlen-2" },
];

// Buy an economy unlock into `profile` (mutates it). Spends currency only; respects
// a named prereq; idempotent. Returns true on success.
export function buyEconomyUnlock(profile, id){
  const u = ECONOMY_UNLOCKS.find(x => x.id === id); if (!u) return false;
  if (profile.economyUnlocked?.[id]) return false;
  if (u.prereq && !(profile.economyUnlocked?.[u.prereq])) return false;
  if ((profile.currency || 0) < u.cost) return false;
  profile.currency -= u.cost;
  (profile.economyUnlocked ||= {})[id] = true;
  return true;
}

// Max run length (game-days) for a profile: base plus each owned "Longer Shifts"
// tier. 5 → 7 → 9 → 12.
export function runLengthFor(profile){
  const o = profile.economyUnlocked || {};
  return CFG.run.baseDays + (o["runlen-1"] ? CFG.run.tier1 : 0) + (o["runlen-2"] ? CFG.run.tier2 : 0) + (o["runlen-3"] ? CFG.run.tier3 : 0);
}

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

// ---- v4 "The Book": multi-track scoring (Phase D) ----
// Four independent tracks, each converting to ⚡ on its own curve, so money and
// clean play can finally *be* the point. CLEAN_TECHS includes abated fossil (CCS)
// — captured carbon counts as clean (locked decision 4).
export const CLEAN_TECHS = new Set(["solar", "wind", "battery", "nuclear", "smr", "geo", "ccs_coal", "ccs_gas"]);

export const SCORE_TRACKS = [
  { id:"longevity",  label:"Longevity",   unit:"days",  reward:v => v * CFG.score.longevityPerDay },
  { id:"netWorth",   label:"Peak net worth", unit:"$",  reward:v => Math.max(0, v) / CFG.score.netWorthPerCoin },
  { id:"cleanShare", label:"Clean share", unit:"%",     reward:v => v * 100 * CFG.score.cleanPerPct },
  { id:"spotKill",   label:"Spot trading", unit:"$",    reward:v => v / CFG.score.spotKillPerCoin },
];

// Raw per-track values for a finished (or live) run. All sibling reads use
// ?? fallbacks so this degrades gracefully if called before B/C ran.
export function scoreTracks(S){
  return {
    longevity:  Math.max(0, (S.day || 1) - 1),
    netWorth:   S.peakNetWorth ?? (S.cash - (S.debt || 0)),
    cleanShare: (S.servedMWh > 0) ? (S.cleanMWh / S.servedMWh) : 0,
    spotKill:   S.bestSpotKill ?? 0,
  };
}

// v5.1 Phase 6: the end-of-run ⚡ award (`currencyForRun`) is RETIRED — it died with the v5
// run and left the skill tree with no faucet. ⚡ is now minted QUARTERLY from the KPI
// scorecard (scorecard.js) and banked to profile.currency via awardCurrency below, every board
// review. `scoreTracks` / `SCORE_TRACKS` stay for the per-track records + the stats hub.

// The ONLY path that grants meta-currency (⚡). Kept isolated from the credit
// thread (commitCreditStanding) so a test can assert the two never mix.
export function awardCurrency(profile, n){
  profile.currency = (profile.currency || 0) + Math.max(0, Math.round(n));
  return profile.currency;
}

// Raise per-track bests in profile.records; returns the ids that set a new best.
export function updateRecords(profile, tracks, at = null){
  const rec = (profile.records ||= {});
  const beaten = [];
  for (const tr of SCORE_TRACKS){
    const v = tracks[tr.id] || 0;
    const cur = rec[tr.id] || (rec[tr.id] = { value:0, at:null });
    if (v > cur.value){ cur.value = v; cur.at = at; beaten.push(tr.id); }
  }
  return beaten;
}

// Effective per-day demand growth after the Efficiency Drive skill.
export function effPeakGrowth(mods){ return 1 + (CFG.peakGrowth - 1) * mods.peakGrowthMult; }
