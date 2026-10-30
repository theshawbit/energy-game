// ============================================================
// CONSTRUCTION (v5 Phase 5) — new plants become multi-quarter lead-time capital
// projects, committed at the quarter-end review. A project produces NOTHING until it
// comes online (gas fast, nuclear slow). There's no hard cap on concurrent builds, but
// push past the comfortable count and projects SLIP — a slipped quarter makes no
// progress and pays an overrun. Under a steepening demand curve a delayed plant is a
// brownout, so `forecastDemand` makes building ahead a real planning skill.
//
// Pure over `S` (+ an injected `rng` for slip, so tests are deterministic). A completed
// build enters the fleet via config.makeUnit (fresh Phase 3 KPIs, Phase 2 dials, a
// Phase 9 / v4.2 plantName). Retires the v4 instant `buildCapacity` path.
// ============================================================
import { CFG, BUILD, BUILD_GATE, makeUnit } from "./config.js";

// The buildable catalogue: capital cost + MW from BUILD, lead-time from CFG.v5.build.
// Only techs with a configured lead-time are buildable as projects.
export const BUILDABLES = Object.fromEntries(
  Object.entries(BUILD)
    .filter(([tech]) => CFG.v5.build.leadTimes[tech] != null)
    .map(([tech, b]) => [tech, { tech, label: b.label, mw: b.mw, cost: b.cost, leadQuarters: CFG.v5.build.leadTimes[tech] }])
);

// The overextension soft-cap: slip PROBABILITY as a function of how many builds are
// already in flight. At/below the comfortable count → 0; beyond it, rising, capped so
// even a huge queue eventually finishes. No hard ceiling ever blocks a commit. Pure.
export function concurrencySlip(nActive){
  const c = CFG.v5.build;
  const extra = Math.max(0, nActive - c.comfortable);
  return Math.min(c.slipMaxProb, extra * c.slipPerExtra);
}

// Commit capital at the quarter-end to start a build. Refused outside planning, if the
// tech is ungated/unaffordable. Deducts the capital up front and queues a Build whose
// slipRisk is locked from the concurrency at commit (a build into a crowded queue is
// riskier). Returns the Build, or null.
export function commitBuild(S, tech){
  if (S.calendar?.mode !== "planning") return null;     // quarter-end only
  const spec = BUILDABLES[tech]; if (!spec) return null;
  const gate = BUILD_GATE[tech]; if (gate && !(S.rmods?.[gate])) return null; // research-gated
  if (S.cash < spec.cost) return null;
  S.cash -= spec.cost;
  const build = {
    id: "build" + (S.buildSeqV5 = (S.buildSeqV5 || 0) + 1),
    tech, cost: spec.cost, mw: spec.mw,
    quartersLeft: spec.leadQuarters,
    slipRisk: concurrencySlip((S.builds || []).length),  // locked from the queue it joined
    slips: 0,
  };
  (S.builds = S.builds || []).push(build);
  return build;
}

// Advance every in-flight project one quarter at the rollover. A build rolls its slip:
// on a slip it makes NO progress this quarter and pays an overrun charge; otherwise it
// advances. On reaching 0 it leaves the queue and a live unit joins the fleet (fresh
// KPIs + default dials + a proper name). `rng` is injected for determinism. Mutates
// S.builds, S.cash, S.fleet. Returns the list of completed builds.
export function tickBuilds(S, rng = Math.random){
  const builds = S.builds || [];
  const done = [];
  for (const b of builds){
    if (b.slipRisk > 0 && rng() < b.slipRisk){
      b.slips += 1;
      S.cash -= Math.round(b.cost * CFG.v5.build.overrunRate);  // the overrun bites
    } else {
      b.quartersLeft -= 1;                                       // a clean quarter of progress
    }
    if (b.quartersLeft <= 0){
      const n = (S.techCount[b.tech] = (S.techCount[b.tech] || 0) + 1);
      const u = makeUnit(b.tech, n, S.buildSeq++);               // enters the fleet live
      S.fleet.push(u);
      b.unit = u;
      done.push(b);
    }
  }
  S.builds = builds.filter(b => !done.includes(b));
  return done;
}

// Project the steepening peak demand `quartersAhead` quarters out — the honest forecast
// the build panel reads to warn "you'll be short in Q+N". Pure read of peakGrowth +
// the calendar's quarter length. (The absurd daily-growth constant is retuned in Phase 6.)
export function forecastDemand(S, quartersAhead){
  const days = quartersAhead * CFG.v5.daysPerQuarter;
  return Math.round(S.peak * Math.pow(S.peakGrowth, days));
}
