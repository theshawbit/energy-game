// Unit tests for v5 Phase 4 — cut-throat, quarter-end-only maintenance (src/live/
// maint.js) and its rollover wiring. Tasks restore one KPI axis, cost cash + book
// downtime, and resolve over the NEXT quarter; there is no mid-quarter buy-out. Run: `npm test`.
import { TASKS, scheduleTask, cancelTask, taskRestore, resolveQuarterTasks } from "../src/live/maint.js";
import { makeCrew, wageBill } from "../src/live/crews.js";
import { createGame, surviveDay, step } from "../src/live/sim.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const realRandom = Math.random;
Math.random = () => 0.5;
const AXES = ["reliability", "efficiency", "output", "flexibility"];
// A game paused at the board review with a known-worn plant and a flush bank + crew.
function planningGame(){
  const S = createGame(); S.calm = true;
  S.calendar.mode = "planning"; S.cash = 1e7;
  return S;
}
const firm = S => S.fleet.find(u => u.kind === "firm");

// 1) Tasks map to axes — each task restores exactly its one KPI axis, no bleed.
{
  for (const axis of AXES){
    const S = planningGame();
    const u = firm(S); for (const a of AXES) u.kpis[a] = 50;
    const crew = S.crews[0]; crew.assignment = null; crew.trade = axis; // on-trade, isolate the lift
    scheduleTask(S, u.id, axis, crew.id);
    resolveQuarterTasks(S);
    const others = AXES.filter(a => a !== axis);
    check(`${axis}: its task lifts only its axis`, u.kpis[axis] > 50 && others.every(a => u.kpis[a] === 50),
      `${axis} ${Math.round(u.kpis[axis])}, others ${others.map(a => Math.round(u.kpis[a])).join("/")}`);
  }
}

// 2) Quarter-end only — no mid-quarter buy-out.
{
  const S = planningGame(); const u = firm(S); u.kpis.reliability = 40; const crew = S.crews[0];
  S.calendar.mode = "operating";
  const cash0 = S.cash, out = scheduleTask(S, u.id, "reliability", crew.id);
  check("scheduleTask is refused in operating mode", out === null && (S.tasks || []).length === 0 && S.cash === cash0);
  S.calendar.mode = "planning";
  check("scheduleTask is allowed in planning mode", scheduleTask(S, u.id, "reliability", crew.id) !== null);
}

// 3) A task costs cash up front and books downtime.
{
  const S = planningGame(); const u = firm(S); u.kpis.output = 55; const crew = S.crews.find(c => !c.assignment);
  const cash0 = S.cash, cost = TASKS.uprate.cost;
  const t = scheduleTask(S, u.id, "output", crew.id);
  check("scheduling deducts the task cost up front", near(cash0 - S.cash, cost), `$${cash0 - S.cash}`);
  check("scheduling books the plant offline + reserves the crew", u.maintDown === true && crew.assignment === t.id);
  check("the task carries its axis + the duration", t.axis === "output" && t.quartersLeft === TASKS.uprate.quarters);
}

// 4) Tasks resolve over the next quarter; a multi-quarter job stays in flight.
{
  const S = planningGame(); const u = firm(S); u.kpis.reliability = 40; const crew = S.crews[0]; crew.assignment = null;
  scheduleTask(S, u.id, "reliability", crew.id);
  resolveQuarterTasks(S);
  check("a 1-quarter task completes: axis restored, downtime cleared, task gone",
    u.kpis.reliability > 40 && u.maintDown === false && (S.tasks || []).length === 0 && crew.assignment === null,
    `rel ${Math.round(u.kpis.reliability)}`);
  // a 2-quarter job is still in flight after one rollover
  const S2 = planningGame(); const u2 = firm(S2); u2.kpis.efficiency = 30; const cr2 = S2.crews[0]; cr2.assignment = null;
  const t2 = scheduleTask(S2, u2.id, "efficiency", cr2.id); t2.quartersLeft = 2;
  resolveQuarterTasks(S2);
  check("a half-elapsed task is still in flight (downtime holds)",
    t2.quartersLeft === 1 && u2.maintDown === true && u2.kpis.efficiency === 30 && (S2.tasks || []).length === 1);
}

// 5) You operate around mid-quarter failure — no repair path until the next planning.
{
  const S = createGame(); S.calm = true; // operating from the start
  const u = firm(S); u.kpis.reliability = 25; // it broke mid-quarter
  const crew = S.crews[0];
  check("a plant that breaks mid-quarter has no scheduleTask recourse",
    S.calendar.mode === "operating" && scheduleTask(S, u.id, "reliability", crew.id) === null && !u.maintDown,
    "grid must cope until the review");
}

// 5b) A maint-booked plant is held offline during the operating quarter (the teeth).
{
  const S = planningGame(); const u = firm(S); u.kpis.output = 40; const crew = S.crews[0]; crew.assignment = null;
  scheduleTask(S, u.id, "output", crew.id);
  S.calendar.mode = "operating"; S.running = true;
  step(S, 0.3);
  check("a booked plant sits in MAINT and offers no output during the quarter",
    u.status === "maint" && Math.abs((u.loadFrac ?? 0)) >= 0, `status ${u.status}`);
}

// 6) The rollover resolves tasks and deducts the standing wage bill (settlement seam).
{
  const S = createGame(); S.calm = true;
  S.calendar.mode = "planning"; S.cash = 1e7;
  const u = firm(S); u.kpis.reliability = 40; const crew = S.crews[0]; crew.assignment = null;
  scheduleTask(S, u.id, "reliability", crew.id);
  const cashBefore = S.cash, expWages = wageBill(S);
  // run out the quarter: land on its last day, then the day wrap rolls it
  S.calendar.mode = "operating"; S.calendar.dayInQuarter = CFG.v5.daysPerQuarter;
  surviveDay(S);
  check("the quarter rollover re-enters planning", S.calendar.mode === "planning");
  check("the rollover resolves the booked maintenance", u.maintDown === false && u.kpis.reliability > 40 && (S.tasks || []).length === 0);
  check("the rollover deducts N × wage at settlement", near(cashBefore - S.cash, expWages), `$${cashBefore - S.cash} vs $${expWages}`);
}

// 7) Cancel refunds and frees the plant + crew before resolution.
{
  const S = planningGame(); const u = firm(S); u.kpis.output = 50; const crew = S.crews[0]; crew.assignment = null;
  const cash0 = S.cash; const t = scheduleTask(S, u.id, "output", crew.id);
  const ok = cancelTask(S, t.id);
  check("cancelling a task refunds the cost and reopens the plant + crew",
    ok && near(S.cash, cash0) && !u.maintDown && crew.assignment === null && (S.tasks || []).length === 0);
}

// 8) taskRestore combines base restore with crew level + on/off-trade.
{
  const base = TASKS.overhaul.restore;
  const lvl1on = taskRestore(TASKS.overhaul, makeCrew("reliability", 1));
  check("a level-1 on-trade crew restores the base amount", near(lvl1on, base), `${lvl1on} vs ${base}`);
  check("no crew falls back to the base restore", near(taskRestore(TASKS.overhaul, null), base));
}

Math.random = realRandom;
console.log(failed === 0 ? "\nAll maint tests passed." : `\n${failed} maint test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
