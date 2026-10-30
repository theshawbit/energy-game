// ============================================================
// MAINTENANCE (v5 Phase 4, reworked by v5.1 Phase 4) — ROLLING, cash-funded KPI repair
// drawing the crew pool. Reverses the quarter-end-only batch: a plant failing on day 5 no
// longer waits until day 22. You queue a maint job any day (via the Phase 5 brief); it draws
// a crew from the pool (the maintenance-ONLY limiter — upgrades use the separate contractor
// line, Phase 3), reserves it, and resolves on a rolling `daysLeft` independent of quarter
// boundaries. On completion it restores the worked axis's live KPI back toward u.caps[axis]
// (which Phase 3's tiers raise — maintenance fights decay, upgrades raise the ceiling), levels
// the crew, and frees it. The plant is OFFLINE (maintDown) while in the shop — the teeth, now
// measured in days not a whole quarter.
//
// Pure over `S` (no DOM, no RNG). sim.step ages the queue each tick via tickMaint. All numbers
// come from CFG.v5_1.maint / CFG.v5.maint (axis/label) / CFG.v5.crews (crew effectiveness).
// ============================================================
import { CFG } from "./config.js";
import { tradeModifier, gainXP } from "./crews.js";

// The per-KPI task catalogue (axis + label per task), kept from Phase 4 so the UI copy tunes
// centrally. The rolling cost + duration + restore now come from CFG.v5_1.maint.
export const TASKS = Object.fromEntries(
  Object.entries(CFG.v5.maint.tasks).map(([name, t]) => [name, { name, ...t }])
);

// The one task that restores a given axis (overhaul→reliability, etc.). 1:1.
function taskForAxis(axis){ return Object.values(TASKS).find(t => t.axis === axis) || null; }

// The attainable max a maint job restores an axis toward (Phase 3's upgraded cap; base if none).
function axisCap(u, axis){ return u.caps?.[axis] ?? 100; }

// How many KPI points a crew repairs on an axis: the axis base restore × the crew's level
// mastery × the on/off-trade modifier. On-trade, high-level crews restore the most; an
// off-trade crew still helps (never 0). Pure.
export function axisRestore(axis, crew){
  const base = CFG.v5_1.maint.restore[axis] ?? 40;
  if (!crew) return base;
  const levelFactor = 1 + (crew.level - 1) * CFG.v5.crews.levelEdge;
  return base * levelFactor * tradeModifier(crew, axis);
}

// The cash cost to queue a restore on `u`'s `axis`: a floor + a per-point charge on how far the
// axis has decayed below its cap (a near-dead plant costs more). Pure.
export function maintCost(u, axis){
  const m = CFG.v5_1.maint;
  const deficit = Math.max(0, axisCap(u, axis) - (u.kpis?.[axis] ?? 100));
  return Math.round(m.costBase + m.costPerPoint * deficit);
}

// The rolling duration of a job: a base lead time + a severity bump scaling with the deficit
// (as a fraction of the axis cap), so nursing a badly-decayed plant takes longer. Pure.
function maintDays(u, axis){
  const m = CFG.v5_1.maint;
  const cap = axisCap(u, axis);
  const deficit = Math.max(0, cap - (u.kpis?.[axis] ?? 100));
  const sev = cap > 0 ? Math.min(1, deficit / cap) : 0;
  return m.leadDays + Math.round(m.severityDays * sev);
}

// Queue a ROLLING maintenance job: axis picks the task, crewId the worker. Refused if the
// unit/crew is invalid, the crew is busy, the axis is already queued on that plant, the plant is
// already in the shop, or cash is short. On success it books the cost, reserves the crew, marks
// the plant offline, and returns the MaintJob. No quarter gating — queue it any day.
export function queueMaint(S, unitId, axis, crewId){
  const task = taskForAxis(axis); if (!task) return null;
  const u = S.fleet.find(x => x.id === unitId); if (!u || !u.kpis) return null;
  const crew = S.crews.find(c => c.id === crewId); if (!crew || crew.assignment) return null;
  if (u.maintDown) return null;                                 // one job per plant at a time
  if ((S.maintQueue || []).some(j => j.unitId === unitId && j.axis === axis)) return null;
  const cost = maintCost(u, axis);
  if (S.cash < cost) return null;
  S.cash -= cost;
  const job = { id: "maint" + (S.maintSeq = (S.maintSeq || 0) + 1), name: task.name, axis, unitId, crewId,
                daysLeft: maintDays(u, axis), cost };
  (S.maintQueue ||= []).push(job);
  crew.assignment = job.id;
  u.maintDown = true;                                           // offline while in the shop (the teeth)
  return job;
}

// Cancel a queued maint job before it resolves (refund, free the crew, re-open the plant if it
// has no other job in the shop). Mutates S.
export function cancelTask(S, jobId){
  const q = S.maintQueue || [];
  const idx = q.findIndex(j => j.id === jobId);
  if (idx < 0) return false;
  const job = q[idx];
  S.cash += job.cost;                                           // refund the booked cost
  const crew = S.crews.find(c => c.id === job.crewId); if (crew) crew.assignment = null;
  q.splice(idx, 1);
  if (!q.some(j => j.unitId === job.unitId)){
    const u = S.fleet.find(x => x.id === job.unitId);
    if (u){ u.maintDown = false; if (u.status === "maint") u.status = u.ctrl ? "off" : "online"; }
  }
  return true;
}

// Age every in-flight maint job by dtH game-hours. On completion (daysLeft ≤ 0): restore the
// worked axis toward its cap by the crew's effectiveness, level the crew for the work, free it,
// lift downtime from the plant (if it has no other job), and drop the job. Mutates fleet + crews.
export function tickMaint(S, dtH){
  const q = S.maintQueue;
  if (!q || !q.length || dtH <= 0) return 0;
  const dDays = dtH / 24;                                       // game-hours → calendar days
  for (const job of q) job.daysLeft -= dDays;
  const done = q.filter(j => j.daysLeft <= 0);
  for (const job of done){
    const u = S.fleet.find(x => x.id === job.unitId);
    const crew = S.crews.find(c => c.id === job.crewId);
    if (u && u.kpis){
      const cap = axisCap(u, job.axis);
      u.kpis[job.axis] = Math.min(cap, u.kpis[job.axis] + axisRestore(job.axis, crew)); // toward the cap, never past
      u.condition = Math.min(u.kpis.reliability, u.kpis.efficiency, u.kpis.output, u.kpis.flexibility);
    }
    if (crew){ crew.assignment = null; gainXP(crew, CFG.v5.crews.xpPerTask); } // crews level through use
  }
  if (done.length){
    S.maintQueue = q.filter(j => j.daysLeft > 0);
    for (const u of S.fleet){
      if (u.maintDown && !S.maintQueue.some(j => j.unitId === u.id)){
        u.maintDown = false;
        if (u.status === "maint") u.status = u.ctrl ? "off" : "online"; // re-arms from its commit dial
      }
    }
  }
  return done.length;
}

// Free crews — the live maintenance throughput, for the brief's readout.
export function maintThroughput(S){ return (S.crews || []).filter(c => !c.assignment).length; }
