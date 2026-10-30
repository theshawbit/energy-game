// Unit tests for v5.1 Phase 5 — the DAILY BRIEF (src/live/brief.js) + its sim wiring.
// The brief is a blocking-but-skippable daily beat: at a day boundary the sim opens it (gated on
// S.briefEnabled) UNLESS the player has armed auto-advance AND nothing demands attention. It is a
// read + schedule surface onto the two rolling queues (maintenance crews + contractor upgrades);
// builds are surfaced but committed only at the quarter review. step no-ops outside "operating".
import { shouldInterrupt, briefSummary, openBrief, closeBrief } from "../src/live/brief.js";
import { createGame, step, surviveDay } from "../src/live/sim.js";
import { queueMaint } from "../src/live/maint.js";
import { queueUpgrade } from "../src/live/contractor.js";
import { commitBuild } from "../src/live/construct.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
Math.random = () => 0.5; // deterministic createGame (freshWeather)
const b = CFG.v5_1.brief;

// A calm, comfortable grid where NO brief exception fires: ample headroom, cash well over the
// floor, a pristine stability bar, no completed jobs, no auto-pause.
function quiet(){
  const S = createGame(); S.calm = true;
  S.capacity = 1200; S.peak = 780; S.cash = 500000;
  S.jobsDone = 0; S.stability.hp = 0; S.clock.autoPaused = false;
  return S;
}

// 1) Quiet day auto-advances — no exception + armed, the boundary does NOT open the brief.
{
  const S = quiet(); S.briefEnabled = true; S.autoAdvance = true;
  S.calendar.dayInQuarter = 3;                 // mid-quarter: a normal boundary, not the review
  check("no exception on a comfortable grid", shouldInterrupt(S) === false);
  surviveDay(S);
  check("a quiet armed day stays operating (brief skipped)", S.calendar.mode === "operating", S.calendar.mode);
  check("the completion tally is consumed", (S.jobsDone || 0) === 0);
}

// 2) Exceptions interrupt — each trigger independently flips shouldInterrupt + opens the brief.
{
  const land = quiet(); land.jobsDone = 1;
  check("a landed rolling job interrupts", shouldInterrupt(land) === true);
  const paused = quiet(); paused.clock.autoPaused = true;
  check("a crisis auto-pause interrupts", shouldInterrupt(paused) === true);
  const tight = quiet(); tight.capacity = tight.peak;  // 0% headroom
  check("tight headroom interrupts", shouldInterrupt(tight) === true);
  const broke = quiet(); broke.cash = b.cashFloor - 1;
  check("cash under the floor interrupts", shouldInterrupt(broke) === true);
  const danger = quiet(); danger.stability.hp = Math.ceil(danger.stability.max * (b.stabilityDanger + 0.05));
  check("the stability danger band interrupts", shouldInterrupt(danger) === true);

  // … and the boundary actually opens the brief when armed but an exception fires.
  const S = quiet(); S.briefEnabled = true; S.autoAdvance = true; S.jobsDone = 1;
  S.calendar.dayInQuarter = 4;
  surviveDay(S);
  check("an exception opens the brief + clears auto-advance", S.calendar.mode === "brief" && S.autoAdvance === false);
}

// 3) Brief is a READ + schedule surface — briefSummary reports both queues + demand/forecast,
//    purely; quick-add routes through queueMaint / queueUpgrade (what the panel's buttons call).
{
  const S = quiet(); S.cash = 1e7;
  const u = S.fleet.find(x => x.kind === "firm"); u.kpis.output = 50;
  const crew = S.crews.find(c => !c.assignment);
  check("queueMaint (the brief's maint quick-add) lands a job", !!queueMaint(S, u.id, "output", crew.id));
  const thermal = S.fleet.find(x => x.tiers);
  check("queueUpgrade (the brief's upgrade quick-add) lands a job", !!queueUpgrade(S, thermal.id, "reliability"));
  const snap = JSON.stringify(S);
  const sum = briefSummary(S);
  check("briefSummary reports both rolling queues", sum.maintQueue.length === 1 && sum.contractorQueue.length === 1);
  check("briefSummary reports demand + the next-quarter forecast",
    sum.demand.peak === S.peak && sum.demand.capacity === S.capacity && sum.forecast.nextQuarter >= sum.forecast.thisQuarter);
  check("briefSummary does NOT mutate S (pure read)", JSON.stringify(S) === snap);
}

// 4) Builds are SURFACED, not committed here — the brief lists in-flight builds + a forecast
//    nudge, but committing is a planning-only action (commitBuild refuses outside the review).
{
  const S = quiet(); S.cash = 1e9;
  S.builds = [{ id: "build1", tech: "gas", mw: 200, quartersLeft: 2, slipRisk: 0, slips: 0 }];
  const sum = briefSummary(S);
  check("briefSummary surfaces in-flight builds", sum.builds.length === 1 && sum.builds[0].mw === 200);
  check("the brief carries a forward forecast nudge", sum.forecast.nextQuarter > 0);
  S.calendar.mode = "brief";
  check("committing a build is refused from the brief (review-only)", commitBuild(S, "gas") === null);
}

// 5) Advance re-arms — openBrief enters/clears, closeBrief + re-arming resumes auto-skip; the
//    loop never strands the player in a frozen brief.
{
  const S = quiet(); S.briefEnabled = true;
  openBrief(S);
  check("openBrief enters brief mode + clears auto-advance", S.calendar.mode === "brief" && S.autoAdvance === false);
  check("openBrief holds the clock", S.clock.speed === 0 && S.clock.autoPaused === true);
  S.autoAdvance = true; closeBrief(S);           // the "Advance" action: re-arm, then close
  check("closeBrief resumes operating + a running clock", S.calendar.mode === "operating" && S.clock.speed === 1 && !S.clock.autoPaused);
  S.calendar.dayInQuarter = 6; surviveDay(S);
  check("re-armed auto-advance skips the next quiet day", S.calendar.mode === "operating");
}

// 6) Mode exclusivity — step no-ops in "brief" and "planning"; only "operating" advances.
{
  const S = quiet(); S.running = true;
  S.calendar.mode = "brief";
  const t0 = S.t, d0 = S.day;
  const ended = step(S, 1.0);
  check("step no-ops in brief mode", ended === false && S.t === t0 && S.day === d0);
  S.calendar.mode = "planning";
  step(S, 1.0);
  check("step no-ops in planning mode", S.t === t0);
  S.calendar.mode = "operating";
  step(S, 1.0);
  check("step advances only in operating mode", S.t !== t0);
}

console.log(failed === 0 ? "\nAll brief tests passed." : `\n${failed} brief test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
