// ============================================================
// CREWS (v5 Phase 4) — the soft-specialized, levelling maintenance pool. A crew is
// best at ONE trade (a KPI axis) but can take any task at a penalty (never 0, so the
// pool is fungible). Crews level passively through completed work; ⚡ promotes
// standouts and raises their level ceiling; hiring is gated by the roster ceiling and
// costs cash; wages are a standing per-quarter cost.
//
// Pure helpers over `S` and a `Crew` — all balance comes from CFG.v5.crews, so the
// module itself holds no magic numbers. `taskRestore` (which combines a crew with a
// task) and `resolveQuarterTasks` live in maint.js; this file owns the crew itself.
// ============================================================
import { CFG, crewName } from "./config.js";

// The four trades a crew can specialize in — one per KPI axis.
export const TRADES = ["reliability", "efficiency", "output", "flexibility"];

// A fresh crew: level 1, no XP, free (unassigned), its level ceiling at the base cap.
export function makeCrew(trade, seq){
  const c = CFG.v5.crews;
  return { id: "crew" + seq, name: crewName(seq), trade, level: 1, xp: 0, levelCap: c.levelCapBase, assignment: null };
}

// On-trade = 1.0; off-trade = the configured penalty (never 0 — any crew can work any
// task, just less effectively). This is what makes the pool soft-specialized.
export function tradeModifier(crew, axis){
  return crew.trade === axis ? 1 : CFG.v5.crews.offTrade;
}

// Passive levelling: bank XP, crossing the curve bumps the level up to the crew's
// current ceiling (promotion raises the ceiling). Mutates the crew.
export function gainXP(crew, amount){
  crew.xp += amount;
  while (crew.xp >= CFG.v5.crews.xpCurve && crew.level < crew.levelCap){
    crew.xp -= CFG.v5.crews.xpCurve;
    crew.level += 1;
  }
  if (crew.level >= crew.levelCap) crew.xp = Math.min(crew.xp, CFG.v5.crews.xpCurve); // park XP at the ceiling
  return crew;
}

// Room to promote? (not yet at the hard max level ceiling).
export function canLevelUp(crew){ return crew.levelCap < CFG.v5.crews.maxLevel; }

// ⚡ promotes a standout: spend the configured ⚡, raise the level ceiling, and bump
// the level into the new room. Refused if ⚡ short or already maxed. Routes only
// through the existing ⚡ lane — no new resource.
export function promote(S, crewId){
  const crew = S.crews.find(c => c.id === crewId);
  if (!crew) return false;
  const c = CFG.v5.crews;
  if (!canLevelUp(crew)) return false;
  if ((S.zap || 0) < c.promoteCost) return false;
  S.zap -= c.promoteCost;
  crew.levelCap = Math.min(c.maxLevel, crew.levelCap + c.promoteCapBump);
  crew.level = Math.min(crew.levelCap, crew.level + 1);
  return true;
}

// Hire a crew of `trade`: gated by the ⚡-unlocked roster ceiling (Phase 7 raises
// S.rosterCap), and costs cash. Returns the new crew or null if refused.
export function hireCrew(S, trade){
  const c = CFG.v5.crews;
  if (!TRADES.includes(trade)) return null;
  if (S.crews.length >= (S.rosterCap ?? c.baseRoster)) return null; // ceiling bites
  if (S.cash < c.hireCost) return null;
  S.cash -= c.hireCost;
  const crew = makeCrew(trade, (S.crewSeq = (S.crewSeq || S.crews.length) + 1));
  S.crews.push(crew);
  return crew;
}

// The standing wage bill for the current roster — N × wage. Pure (reads only).
export function wageBill(S){ return S.crews.length * CFG.v5.crews.wage; }
