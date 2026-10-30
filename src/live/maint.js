// ============================================================
// MAINTENANCE (v5 Phase 4) — cut-throat, QUARTER-END-ONLY repair of the four KPIs.
// You triage the quarter's accumulated decay at the board review, assign crews to
// per-KPI tasks, and those tasks resolve over the NEXT quarter — with downtime (the
// plant is in the shop, offline). There is no mid-quarter buy-out: a plant that
// breaks on day 5 is yours to nurse to the review (the Phase 8 crisis toolkit is the
// only in-quarter recourse). This retires the v4 condition-service path wholesale.
//
// Pure over `S`: a task is scheduled during planning, advanced/completed in the
// rollover. All numbers come from CFG.v5.maint / CFG.v5.crews.
// ============================================================
import { CFG } from "./config.js";
import { tradeModifier, gainXP } from "./crews.js";

// The per-KPI task catalogue, keyed by task name, each carrying its one axis. Built
// from config so the numbers tune centrally; `name` is folded in for convenience.
export const TASKS = Object.fromEntries(
  Object.entries(CFG.v5.maint.tasks).map(([name, t]) => [name, { name, ...t }])
);

// The one task that restores a given axis (overhaul→reliability, etc.). 1:1.
function taskForAxis(axis){ return Object.values(TASKS).find(t => t.axis === axis) || null; }

// How many KPI points a crew repairs on a task: base restore × the crew's level
// mastery × the on/off-trade modifier. On-trade, high-level crews restore the most;
// an off-trade crew still helps (never 0). Pure.
export function taskRestore(task, crew){
  if (!crew) return task.restore;
  const levelFactor = 1 + (crew.level - 1) * CFG.v5.crews.levelEdge;
  return task.restore * levelFactor * tradeModifier(crew, task.axis);
}

// Schedule a quarter-end maintenance job: axis picks the task, crewId the worker.
// Refused outside planning (no mid-quarter buy-out), if the unit/crew is invalid,
// the crew is busy, the unit is already in the shop, or cash is short. On success it
// books the cost, marks the unit down for the task's duration, and returns the Task.
export function scheduleTask(S, unitId, axis, crewId){
  if (S.calendar?.mode !== "planning") return null;     // quarter-end only — the teeth
  const task = taskForAxis(axis); if (!task) return null;
  const u = S.fleet.find(x => x.id === unitId); if (!u || !u.kpis) return null;
  const crew = S.crews.find(c => c.id === crewId); if (!crew || crew.assignment) return null;
  if (u.maintDown) return null;                         // one job per plant per quarter
  if (S.cash < task.cost) return null;
  S.cash -= task.cost;
  const t = { id: "task" + (S.taskSeq = (S.taskSeq || 0) + 1), name: task.name, axis, unitId, crewId, quartersLeft: task.quarters };
  (S.tasks = S.tasks || []).push(t);
  crew.assignment = t.id;
  u.maintDown = true;                                   // booked offline next quarter
  return t;
}

// Cancel a scheduled task before the quarter runs (refund, free the crew, re-open the
// plant). Only meaningful in planning, before resolution.
export function cancelTask(S, taskId){
  const idx = (S.tasks || []).findIndex(t => t.id === taskId);
  if (idx < 0) return false;
  const t = S.tasks[idx];
  const task = TASKS[t.name];
  if (task) S.cash += task.cost;                        // refund the booked cost
  const crew = S.crews.find(c => c.id === t.crewId); if (crew) crew.assignment = null;
  S.tasks.splice(idx, 1);
  if (!S.tasks.some(x => x.unitId === t.unitId)){
    const u = S.fleet.find(x => x.id === t.unitId); if (u) u.maintDown = false;
  }
  return true;
}

// Called once at each quarter rollover (Phase 1 hook): advance every in-flight task;
// complete those whose time is up — restore the KPI axis, free the crew, award XP for
// the work — and lift downtime from any plant with no job left. Mutates fleet + crews.
export function resolveQuarterTasks(S){
  const tasks = S.tasks || [];
  const done = [];
  for (const t of tasks){
    t.quartersLeft -= 1;
    if (t.quartersLeft > 0) continue;                   // still in flight (multi-quarter job)
    const u = S.fleet.find(x => x.id === t.unitId);
    const crew = S.crews.find(c => c.id === t.crewId);
    if (u && u.kpis){
      // v5 Phase 7: restore toward the axis's attainable max (u.caps), not a flat 100 — a
      // specialized plant is maintained back up to its upgraded level, not erased to base.
      const ceiling = u.caps?.[t.axis] ?? 100;
      u.kpis[t.axis] = Math.min(ceiling, u.kpis[t.axis] + taskRestore(TASKS[t.name], crew));
      u.condition = Math.min(u.kpis.reliability, u.kpis.efficiency, u.kpis.output, u.kpis.flexibility);
    }
    if (crew){ crew.assignment = null; gainXP(crew, CFG.v5.crews.xpPerTask); } // crews level through use
    done.push(t);
  }
  S.tasks = tasks.filter(t => !done.includes(t));
  // lift downtime from any plant that no longer has a job in the shop
  for (const u of S.fleet){
    if (u.maintDown && !S.tasks.some(t => t.unitId === u.id)){
      u.maintDown = false;
      if (u.status === "maint") u.status = u.ctrl ? "off" : "online"; // re-arms from its commit dial
    }
  }
  return done.length;
}
