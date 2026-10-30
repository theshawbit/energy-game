// Unit tests for v5.1 Phase 4 — ROLLING maintenance (src/live/maint.js) and its sim wiring.
// A maint job is queued any day, reserves a crew from the pool (the maintenance-only limiter),
// resolves on a rolling daysLeft independent of quarter boundaries, and on completion restores
// the worked axis toward u.caps (Phase 3's upgraded ceiling), levels + frees the crew, and lifts
// the plant's downtime. The quarter-end batch (resolveQuarterTasks/Task{quartersLeft}) is retired.
import { queueMaint, tickMaint, cancelTask, maintCost, axisRestore, maintThroughput } from "../src/live/maint.js";
import { queueUpgrade, tickContractor } from "../src/live/contractor.js";
import { promote } from "../src/live/crews.js";
import { createGame, surviveDay } from "../src/live/sim.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
Math.random = () => 0.5; // deterministic createGame (freshWeather)
const m = CFG.v5_1.maint;
const firm = S => S.fleet.find(u => u.kind === "firm");
const freeCrew = S => S.crews.find(c => !c.assignment);
// age the queue day-by-day until it drains (bounded)
const runToDone = (S) => { for (let i = 0; i < 60 && (S.maintQueue || []).length; i++) tickMaint(S, 24); };

// 1) Queue reserves a crew + deducts cash; a busy crew or an already-queued axis is refused.
{
  const S = createGame(); S.cash = 1e7;
  const u = firm(S); u.kpis.output = 55;
  const crew = freeCrew(S);
  const cash0 = S.cash, cost = maintCost(u, "output");
  const job = queueMaint(S, u.id, "output", crew.id);
  check("queueMaint pushes one job with the axis + a rolling daysLeft", job && job.axis === "output" && job.daysLeft >= m.leadDays && S.maintQueue.length === 1);
  check("it deducts maintCost up front", near(cash0 - S.cash, cost), `$${cash0 - S.cash}`);
  check("it reserves the crew + books the plant offline", crew.assignment === job.id && u.maintDown === true);
  const dupAxis = queueMaint(S, u.id, "output", freeCrew(S)?.id);
  check("a second job on the same axis is refused", dupAxis === null && S.maintQueue.length === 1);
  const busy = queueMaint(S, firm(S) === u ? u.id : u.id, "reliability", crew.id); // crew already assigned
  check("a busy crew can't take another job", busy === null);
}

// 2) Rolling completion restores toward the cap (never past), then frees the crew.
{
  const S = createGame(); S.cash = 1e7;
  const u = firm(S); u.kpis.reliability = 40; const cap = u.caps.reliability;
  const crew = freeCrew(S); crew.trade = "reliability"; // on-trade
  const job = queueMaint(S, u.id, "reliability", crew.id);
  const expect = Math.min(cap, 40 + axisRestore("reliability", crew));
  runToDone(S);
  check("the axis is restored toward the cap by crew effectiveness", near(u.kpis.reliability, expect), `rel ${u.kpis.reliability.toFixed(1)} vs ${expect.toFixed(1)}`);
  check("restore never exceeds the cap", u.kpis.reliability <= cap);
  check("the crew is freed + downtime lifted", crew.assignment === null && u.maintDown === false);
  check("the completed job leaves the queue", S.maintQueue.length === 0);
}

// 3) Soft specialization — an on-trade crew restores more than an off-trade crew, same job.
{
  const mk = (trade) => {
    const S = createGame(); S.cash = 1e7;
    const u = firm(S); u.kpis.output = 40;
    const crew = freeCrew(S); crew.trade = trade; crew.level = 1;
    queueMaint(S, u.id, "output", crew.id);
    runToDone(S);
    return u.kpis.output;
  };
  const on = mk("output"), off = mk("reliability");
  check("an on-trade crew restores more than an off-trade crew", on > off, `on ${on.toFixed(1)} vs off ${off.toFixed(1)}`);
  check("both are allowed (off-trade still restores)", off > 40);
}

// 4) Crew is the maintenance bottleneck — and ONLY maintenance (upgrades run in parallel).
{
  const S = createGame(); S.cash = 1e9;
  S.crews.forEach(c => c.assignment = { busy: true });     // every crew booked
  const u = firm(S); u.kpis.output = 50;
  check("no maint job starts with every crew busy", queueMaint(S, u.id, "output", S.crews[0].id) === null && (S.maintQueue || []).length === 0);
  check("maintThroughput reports zero free crews", maintThroughput(S) === 0);
  // meanwhile a contractor upgrade (Phase 3, separate labor) still progresses
  const up = queueUpgrade(S, u.id, "reliability");
  const d0 = up.daysLeft; tickContractor(S, 24);
  check("an upgrade progresses despite a fully-booked crew pool", up.daysLeft < d0, `${d0} → ${up.daysLeft}`);
}

// 5) XP + promotion still work off the rolling queue.
{
  const S = createGame(); S.cash = 1e7; S.zap = CFG.v5.crews.promoteCost;
  const u = firm(S); u.kpis.efficiency = 50;
  const crew = freeCrew(S); const xp0 = crew.xp;
  queueMaint(S, u.id, "efficiency", crew.id);
  runToDone(S);
  check("a completed job grants the crew XP", crew.xp === xp0 + CFG.v5.crews.xpPerTask, `xp ${crew.xp}`);
  const cap0 = crew.levelCap;
  check("⚡ promote raises the level ceiling", promote(S, crew.id) && crew.levelCap === cap0 + CFG.v5.crews.promoteCapBump);
}

// 6) No quarter gating — a job queued mid-quarter survives a rollover; the rollover does no batch.
{
  const S = createGame(); S.calm = true; S.cash = 1e7;
  const u = firm(S); u.kpis.output = 45; const crew = freeCrew(S);
  check("queueMaint works in operating mode (no planning gate)", S.calendar.mode === "operating" && !!queueMaint(S, u.id, "output", crew.id));
  const job = S.maintQueue[0], days0 = job.daysLeft, kpi0 = u.kpis.output;
  // drive a quarter boundary via surviveDay (which does NOT tick the rolling queue)
  S.calendar.dayInQuarter = CFG.v5.daysPerQuarter;
  surviveDay(S);
  check("the quarter rolled into the board review", S.calendar.mode === "planning");
  check("the rollover performed NO maintenance batch (job unchanged, axis unrestored)",
    S.maintQueue.length === 1 && near(S.maintQueue[0].daysLeft, days0) && u.kpis.output === kpi0 && u.maintDown === true);
  // ticking across the boundary still completes it
  runToDone(S);
  check("the job completes across the quarter boundary (restored, crew freed)",
    u.kpis.output > kpi0 && crew.assignment === null && u.maintDown === false);
}

// 7) Cancel refunds and frees the plant + crew before completion.
{
  const S = createGame(); S.cash = 1e7;
  const u = firm(S); u.kpis.output = 50; const crew = freeCrew(S);
  const cash0 = S.cash; const job = queueMaint(S, u.id, "output", crew.id);
  const ok = cancelTask(S, job.id);
  check("cancelling refunds the cost and reopens the plant + crew",
    ok && near(S.cash, cash0) && !u.maintDown && crew.assignment === null && S.maintQueue.length === 0);
}

// 8) maintCost scales with the deficit below the cap (a near-dead plant costs more).
{
  const S = createGame();
  const u = firm(S);
  u.kpis.output = u.caps.output;      // no deficit → floor only
  const floor = maintCost(u, "output");
  u.kpis.output = u.caps.output - 50; // a big deficit
  const deep = maintCost(u, "output");
  check("maintCost is the floor at no deficit", floor === m.costBase);
  check("maintCost rises with the deficit", deep > floor, `$${floor} → $${deep}`);
}

console.log(failed === 0 ? "\nAll maint tests passed." : `\n${failed} maint test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
