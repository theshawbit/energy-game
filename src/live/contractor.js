// ============================================================
// CONTRACTOR (v5.1 Phase 3) — the rolling UPGRADE queue: the FAST capacity channel that
// answers rising demand between builds. Queuing a plant upgrade commits the cash up front and
// spawns an `UpgradeJob` that resolves on a rolling calendar (`daysLeft`), drawing a DEDICATED
// contractor line — never the maintenance crew pool (Phase 4). Maintenance and upgrades
// therefore run truly in parallel; the only limiter on upgrades is cash + tier gating + lead
// time. On completion the job raises `u.tiers[axis]` and recomputes `u.caps[axis]` (the
// attainable max maintenance restores toward) — you pay to WAIT for a higher ceiling, not to
// have it instantly, and degradation still pulls the live KPI below it.
//
// Pure over `S` (no DOM, no RNG). sim.step ages the queue each tick via tickContractor.
// ============================================================
import { CFG } from "./config.js";
import { AXES, axisTierValue, upgradeCost, canUpgrade } from "./progression.js";

// Queue the next tier on a plant's axis: deduct the cost once, push one UpgradeJob with the
// target tier and the configured lead time. Refused (null) when not eligible (unaffordable,
// already at tier 9, already queued for that axis, or not a thermal plant). Mutates S.cash /
// S.contractor.
export function queueUpgrade(S, unitId, axis){
  const u = typeof unitId === "object" ? unitId : S.fleet.find(x => x.id === unitId);
  if (!u || !u.tiers || !AXES.includes(axis)) return null;
  if (!canUpgrade(S, u.id, axis)) return null;
  const cost = upgradeCost(u, axis, S.rmods); // honour the Modular Upgrades research discount
  const toTier = (u.tiers[axis] ?? 0) + 1;
  S.cash -= cost;
  const job = { id: (S.contractorSeq = (S.contractorSeq || 0) + 1), unitId: u.id, axis, toTier,
                cost, daysLeft: CFG.v5_1.upgrade.leadDays };
  (S.contractor ||= []).push(job);
  return job;
}

// Age every in-flight upgrade job by dtH game-hours. On completion (daysLeft ≤ 0) apply the
// tier: set u.tiers[axis] = toTier and recompute u.caps[axis] from the ladder, then drop the
// job. Never touches S.crews (separate labor). Pure mutation of S. Returns the number of jobs
// that completed this tick (v5.1 Phase 5: the daily brief tallies rolling completions).
export function tickContractor(S, dtH){
  const q = S.contractor;
  if (!q || !q.length || dtH <= 0) return 0;
  const dDays = dtH / 24;                                  // game-hours → calendar days
  for (const job of q) job.daysLeft -= dDays;
  const done = q.filter(j => j.daysLeft <= 0);
  for (const job of done){
    const u = S.fleet.find(x => x.id === job.unitId);
    if (u && u.tiers){
      u.tiers[job.axis] = job.toTier;
      (u.caps ||= {})[job.axis] = axisTierValue(job.toTier); // raise the attainable max (not the live KPI)
    }
  }
  if (done.length) S.contractor = q.filter(j => j.daysLeft > 0);
  return done.length;
}

// In-flight upgrade jobs — the brief's readout + the hook for any future overextension soft-cap.
export function contractorLoad(S){ return (S.contractor || []).length; }
