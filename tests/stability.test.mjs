// Unit tests for v5.1 Phase 2 FAIL-STATE & GRID-STABILITY HP BAR (no DOM). Run: `npm test`.
// Pins the RELATIONSHIPS the design locks, not the balance numbers: a true capacity shortfall
// (every lever exhausted) fills full-rate; a dispatch shortfall (a move remained) fills the
// slower half-rate; served hours drain slower than either fill; topping out ends the run and
// freezes step(); the verdict heals a strong quarter and damages a weak one; and the roguelite
// restart hands back a fresh grid while the profile keeps its banked ⚡, skills, and records.
import { createGame, step } from "../src/live/sim.js";
import { classifyShortfall, tickStability, applyVerdictToStability } from "../src/live/stability.js";
import { restartRun } from "../src/live/persist.js";
import { CFG } from "../src/live/config.js";

// Pin global randomness BEFORE any createGame (createGame draws Math.random at construction
// for freshWeather) so the suite is deterministic.
Math.random = () => 0.5;

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const S_cfg = CFG.v5_1.stability;

// A minimal state carrying only what the classifier/ticker read. hp starts mid-bar so a fill
// and a drain are both observable.
function freshS(over = {}) {
  return {
    over: false, reason: null,
    stability: { hp: 50, max: S_cfg.max, fillPaused: true, fillMult: 1, lastShortfall: "none" },
    fleet: [], demand: 0, capacity: 0,
    shed: null, dr: null, drCooldown: 0, rmods: {},
    peak: 100,
    ...over,
  };
}

// 1) Capacity shortfall fills full-rate. Every lever exhausted: no dispatchable fleet, DR
//    ungated (no rmods.demandShave), load-shed already active (so no tier remains) — still short.
{
  const S = freshS({ demand: 100, capacity: 50, shed: { tLeft: 4, mw: 20 } });
  check("classifyShortfall → capacity when every lever is exhausted", classifyShortfall(S) === "capacity");
  const before = S.stability.hp;
  tickStability(S, S.capacity, S.demand, 1); // 1 game-hour
  check("capacity shortfall fills at fillCapacity", Math.abs((S.stability.hp - before) - S_cfg.fillCapacity) < 1e-9,
    `+${(S.stability.hp - before).toFixed(2)} vs fillCapacity ${S_cfg.fillCapacity}`);
  check("fill records the cause", S.stability.lastShortfall === "capacity");
}

// 2) Dispatch shortfall fills half-rate. Short, but a lever remains (load-shed NOT active → a
//    tier is still available to cut). Classifies "dispatch" and fills slower than capacity.
{
  const S = freshS({ demand: 100, capacity: 50 }); // shed null → a tier remains
  check("classifyShortfall → dispatch when a lever remains", classifyShortfall(S) === "dispatch");
  const before = S.stability.hp;
  tickStability(S, S.capacity, S.demand, 1);
  const got = S.stability.hp - before;
  check("dispatch shortfall fills at fillDispatch", Math.abs(got - S_cfg.fillDispatch) < 1e-9,
    `+${got.toFixed(2)} vs fillDispatch ${S_cfg.fillDispatch}`);
  check("dispatch fill < capacity fill (never killed while a move exists)", S_cfg.fillDispatch < S_cfg.fillCapacity);
}

// 3) Clean hours drain, slower than fill. Served (supply ≥ demand) decreases hp by drainRate,
//    and drainRate < fillCapacity so a flickering grid nets upward over a fill/drain cycle.
{
  const S = freshS({ demand: 50, capacity: 100 });
  check("classifyShortfall → none when served", classifyShortfall(S) === "none");
  const before = S.stability.hp;
  tickStability(S, S.capacity, S.demand, 1);
  const drop = before - S.stability.hp;
  check("served hour drains at drainRate", Math.abs(drop - S_cfg.drainRate) < 1e-9,
    `-${drop.toFixed(2)} vs drainRate ${S_cfg.drainRate}`);
  check("drain < fillCapacity (grid nets up when flickering)", S_cfg.drainRate < S_cfg.fillCapacity);
  check("drain pauses the fill flag", S.stability.fillPaused === true);
}

// 4) Top-out ends the run; subsequent step() calls no-op.
{
  const S = freshS({ demand: 100, capacity: 0, shed: { tLeft: 9, mw: 50 } });
  S.stability.hp = S_cfg.max - S_cfg.fillCapacity; // one capacity tick from the top
  tickStability(S, S.capacity, S.demand, 1);
  check("topping out sets S.over", S.over === true);
  check("topping out sets S.reason = grid-collapse", S.reason === "grid-collapse");
  check("hp clamps at max", S.stability.hp === S_cfg.max);
  // a real game frozen: step() must no-op once over
  const G = createGame(); G.over = true; G.reason = "grid-collapse";
  const t0 = G.t, day0 = G.day;
  const ended = step(G, 1);
  check("step() returns false (no end signal) while over", ended === false);
  check("step() no-ops while over (clock frozen)", G.t === t0 && G.day === day0);
}

// 5) Verdict couples both ways — a pure function of the Verdict's 0..1 grade.
{
  const strong = freshS(); const hp0 = strong.stability.hp;
  applyVerdictToStability(strong, { grade: 0.95 });
  check("a strong verdict heals the bar", strong.stability.hp < hp0, `${hp0} → ${strong.stability.hp}`);
  check("a strong verdict resets the fill accelerator", strong.stability.fillMult === 1);

  const weak = freshS(); const hp1 = weak.stability.hp;
  applyVerdictToStability(weak, { grade: 0.05 });
  check("a weak verdict damages the bar", weak.stability.hp > hp1, `${hp1} → ${weak.stability.hp}`);
  check("a weak verdict raises the fill accelerator", weak.stability.fillMult > 1,
    `fillMult ${weak.stability.fillMult.toFixed(2)}`);

  const par = freshS(); const hp2 = par.stability.hp;
  applyVerdictToStability(par, { grade: S_cfg.verdictPar });
  check("a par verdict neither heals nor harms", Math.abs(par.stability.hp - hp2) < 1e-9);
}

// 6) Restart is roguelite — fresh grid, profile persists (banked ⚡, skills) and gains records.
{
  const profile = {
    currency: 50, skills: { foo: 1 }, researchUnlocked: {}, economyUnlocked: {},
    credit: { standing: 70 }, best: { days: 0, score: 0, peak: 0 }, records: {},
  };
  // a run with something worth banking
  const S = createGame(profile.skills, profile.researchUnlocked);
  S.day = 30; S.runStartDay = 1; S.peakNetWorth = 999999; S.over = true; S.reason = "grid-collapse";

  const fresh = restartRun(S, profile);
  check("restart hands back a FRESH grid (over cleared)", fresh.over === false);
  check("fresh grid is at baseline demand", fresh.quarterPeak === CFG.startPeak && fresh.day === 1);
  check("fresh grid's stability bar is empty", fresh.stability && fresh.stability.hp === 0);
  check("profile keeps banked ⚡", profile.currency === 50);
  check("profile keeps purchased skills", profile.skills.foo === 1);
  check("profile GAINS this run's longevity record", (profile.records.longevity?.value || 0) >= 30,
    `longevity ${profile.records.longevity?.value}`);
  check("profile GAINS this run's net-worth record", (profile.records.netWorth?.value || 0) === 999999);
}

console.log(failed === 0 ? "\nAll stability tests passed." : `\n${failed} stability test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
