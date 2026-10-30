// Unit tests for v5 Phase 5 — lead-time construction (src/live/construct.js). New
// plants are multi-quarter capital projects committed at the quarter-end review; they
// produce nothing until online, slip when the queue is overstuffed, and the forecast
// makes building ahead a real skill. Deterministic via an injected rng. Run: `npm test`.
import { BUILDABLES, commitBuild, concurrencySlip, tickBuilds, forecastDemand } from "../src/live/construct.js";
import { createGame, totalCapacity } from "../src/live/sim.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const NO_SLIP = () => 1;   // rng ≥ any slipRisk → never slips
const ALL_SLIP = () => 0;  // rng < any positive slipRisk → always slips
const nameplate = S => S.fleet.reduce((a, u) => a + u.cap, 0);
function planningGame(){ const S = createGame(); S.calm = true; S.calendar.mode = "planning"; S.cash = 1e8; return S; }

// 1) Commit deducts capital and queues a build.
{
  const S = planningGame();
  const cash0 = S.cash, spec = BUILDABLES.peaker;
  const b = commitBuild(S, "peaker");
  check("commit deducts the capital cost", cash0 - S.cash === spec.cost, `$${cash0 - S.cash}`);
  check("commit queues a Build with quartersLeft = the tech's lead-time",
    !!b && S.builds.length === 1 && b.quartersLeft === spec.leadQuarters && b.tech === "peaker",
    `${b.quartersLeft}Q`);
}

// 2) Quarter-end only — no commit while operating.
{
  const S = planningGame(); S.calendar.mode = "operating";
  const cash0 = S.cash, out = commitBuild(S, "peaker");
  check("commitBuild is refused in operating mode", out === null && (S.builds || []).length === 0 && S.cash === cash0);
}

// 3) A build produces nothing until it comes online.
{
  const S = planningGame();
  const fleet0 = S.fleet.length, cap0 = totalCapacity(S);
  commitBuild(S, "nuclear");
  check("an in-flight build adds no fleet unit and no capacity",
    S.fleet.length === fleet0 && totalCapacity(S) === cap0 && S.builds.length === 1);
}

// 4) Completion adds a live, dispatchable unit with fresh KPIs + dials + a name.
{
  const S = planningGame();
  const fleet0 = S.fleet.length;
  commitBuild(S, "peaker"); // lead 1
  const done = tickBuilds(S, NO_SLIP);
  const u = S.fleet[S.fleet.length - 1];
  check("completion removes the Build and appends a fleet unit",
    done.length === 1 && S.builds.length === 0 && S.fleet.length === fleet0 + 1);
  check("the new unit has fresh KPIs, default dials, and a proper name",
    u.kind === "gas" && u.kpis && u.kpis.reliability === 100 && u.dials && typeof u.dials.commit === "boolean" && /\w/.test(u.name),
    u.name);
}

// 5) Lead-times differ by tech — gas fast, nuclear slow, from the same commit quarter.
{
  const S = planningGame();
  commitBuild(S, "peaker");  // lead 1
  commitBuild(S, "nuclear"); // lead 4
  tickBuilds(S, NO_SLIP); // Q+1
  check("gas lands after its short lead-time", S.fleet.some(u => u.tech === "peaker" && u.kind === "gas") && S.builds.length === 1,
    `${S.builds.length} still building`);
  check("nuclear is still in flight after one quarter", S.builds[0].tech === "nuclear" && S.builds[0].quartersLeft === 3);
  tickBuilds(S, NO_SLIP); tickBuilds(S, NO_SLIP); tickBuilds(S, NO_SLIP); // Q+4 total
  check("nuclear lands after its long lead-time", S.builds.length === 0 && S.fleet.some(u => u.tech === "nuclear" && u.id.startsWith("nuclear-")));
}

// 6) Overextension raises slip risk — soft-cap, no hard ceiling.
{
  const c = CFG.v5.build;
  check("slip is ~0 at/below the comfortable count", concurrencySlip(0) === 0 && concurrencySlip(c.comfortable) === 0);
  check("slip rises beyond the comfortable count", concurrencySlip(c.comfortable + 1) > 0 && concurrencySlip(c.comfortable + 3) > concurrencySlip(c.comfortable + 1));
  check("slip is capped (even a huge queue finishes)", concurrencySlip(999) === c.slipMaxProb);
  const S = planningGame();
  const first = commitBuild(S, "peaker");                 // into an empty queue
  for (let i = 0; i < c.comfortable + 2; i++) commitBuild(S, "peaker");
  const crowded = S.builds[S.builds.length - 1];
  check("a build committed into a crowded queue carries a higher slipRisk",
    first.slipRisk === 0 && crowded.slipRisk > 0, `first ${first.slipRisk} vs crowded ${crowded.slipRisk}`);
}

// 7) A slip delays and overruns; no hard cap blocks a commit.
{
  const S = planningGame();
  const b = commitBuild(S, "coal"); b.slipRisk = 1; // force a slip
  const cash0 = S.cash, ql0 = b.quartersLeft;
  tickBuilds(S, ALL_SLIP);
  check("a slip makes no progress (delays completion) and charges the overrun",
    b.quartersLeft === ql0 && b.slips === 1 && cash0 - S.cash === Math.round(b.cost * CFG.v5.build.overrunRate),
    `ql ${ql0}→${b.quartersLeft}, −$${cash0 - S.cash}`);
  // a clean quarter DOES progress
  const S2 = planningGame(); const b2 = commitBuild(S2, "coal"); const q0 = b2.quartersLeft;
  tickBuilds(S2, NO_SLIP);
  check("a clean quarter advances the build", b2.quartersLeft === q0 - 1);
  // no hard cap: a huge queue still accepts commits
  const S3 = planningGame();
  for (let i = 0; i < 12; i++) commitBuild(S3, "peaker");
  check("no hard cap ever blocks a commit", S3.builds.length === 12 && commitBuild(S3, "peaker") !== null);
}

// 8) Forecast flags a coming shortfall — build ahead or brown out.
{
  const S = planningGame();
  check("the forecast steepens with the horizon",
    forecastDemand(S, 0) === S.peak && forecastDemand(S, 2) > forecastDemand(S, 1) && forecastDemand(S, 4) > forecastDemand(S, 2));
  check("forecast peak outgrows current capacity within the horizon (short in Q+N)",
    forecastDemand(S, 2) > nameplate(S), `Q+2 ${forecastDemand(S, 2)} MW vs cap ${nameplate(S)} MW`);
}

// 9) Determinism — a pinned rng gives identical slip outcomes across runs.
{
  const mkRng = seq => { let i = 0; return () => seq[i++ % seq.length]; };
  const run = () => {
    const S = planningGame();
    const b = commitBuild(S, "coal"); b.slipRisk = 0.5;
    const rng = mkRng([0, 1, 0, 1]); // slip, clean, slip, clean
    tickBuilds(S, rng); tickBuilds(S, rng); tickBuilds(S, rng);
    return { ql: b.quartersLeft, slips: b.slips, cash: S.cash };
  };
  const a = run(), b = run();
  check("identical pinned rng → identical slip outcomes",
    a.ql === b.ql && a.slips === b.slips && a.cash === b.cash, `ql ${a.ql}, slips ${a.slips}`);
}

// 10) Commit respects research gates and cash (ported from the retired buildCapacity path).
{
  const S = planningGame();
  check("an advanced-gen build is refused before its research unlock", commitBuild(S, "smr") === null && S.builds.length === 0);
  S.rmods = { smrUnlocked: true };
  check("…and allowed once unlocked", commitBuild(S, "smr") !== null && S.builds.length === 1);
  const S2 = planningGame(); S2.rmods = { ccsUnlocked: true };
  check("one Carbon Capture unlock enables both CCS variants; geo stays gated",
    commitBuild(S2, "ccs_coal") !== null && commitBuild(S2, "ccs_gas") !== null && commitBuild(S2, "geo") === null);
  const S3 = planningGame(); S3.cash = 0;
  check("commit is refused without the capital", commitBuild(S3, "peaker") === null && S3.builds.length === 0);
}

console.log(failed === 0 ? "\nAll construct tests passed." : `\n${failed} construct test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
