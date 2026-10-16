// Unit tests for the live simulation (no DOM). Run: `npm test`.
// These pin the real-time loop's state machine and economics so the Phase B+
// feature work can't silently break pacing or the dispatch wiring.
import { createGame, step, surviveDay, unitOutput, totalCapacity, interp } from "../src/live/sim.js";
import { toggleUnit } from "../src/live/actions.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 1) Fresh game state
let S = createGame();
check("fresh game: day 1, not running, not over", S.day === 1 && !S.running && !S.over);
check("fresh game: 9 units, carbon 0, cash 0", S.fleet.length === 9 && S.carbon === 0 && S.cash === 0);

// 2) unitOutput respects status and weather
S = createGame();
S.t = 12; S.weather = { sun: 1, wind: 1 };
const nuc = S.fleet.find(u => u.id === "nuc");
check("nuclear online outputs full cap", near(unitOutput(S, nuc), 250, 1e-9));
nuc.status = "off";
check("nuclear off outputs 0", unitOutput(S, nuc) === 0);
const sol = S.fleet.find(u => u.id === "sol");
check("solar scales with cf·weather at noon", near(unitOutput(S, sol), 220 * interp(sol.cf, 12) * 1, 1e-9), (unitOutput(S, sol)).toFixed(1) + " MW");

// 3) step advances the clock by game-hours and sets live readouts
S = createGame();
const t0 = S.t;
step(S, 1.0); // 1 real second → 24/secondsPerDay game-hours
check("step advances clock by dt·(24/secondsPerDay)", near(S.t - t0, 24 / CFG.secondsPerDay, 1e-9), (S.t - t0).toFixed(3) + "h");
check("step computes a demand > 0", S.demand > 0, Math.round(S.demand) + " MW");
check("step sets a sensible clearing price (coal baseload marginal)", S.price >= 0 && S.price <= 300, "$" + Math.round(S.price));

// 4) Day rollover triggers surviveDay (demand peak grows)
S = createGame();
S.t = 23.9; const peak0 = S.peak;
step(S, 1.0); // crosses midnight
check("crossing 24:00 rolls the day over", S.day === 2, "day " + S.day);
check("surviving a day raises the demand peak", S.peak > peak0, `${peak0} → ${S.peak} MW`);

// 5) Carbon escalation begins on carbonStartDay and climbs
S = createGame();
for (let i = 0; i < CFG.carbonStartDay - 2; i++) surviveDay(S); // advance to the day before pricing starts
check("no carbon before carbonStartDay", S.carbon === 0, "$" + S.carbon + " at day " + S.day);
surviveDay(S); // this day reaches carbonStartDay and applies the first charge
check("carbon begins once carbonStartDay is reached", S.carbon >= CFG.carbonPerDay - 1e-9, "$" + S.carbon + "/t at day " + S.day);
const c1 = S.carbon; surviveDay(S);
check("carbon keeps climbing each day", S.carbon > c1, `$${c1} → $${S.carbon}/t`);

// 6) A controllable peaker arms (off → starting) only during live play
S = createGame();
toggleUnit(S, "pk1");
check("toggle is a no-op before the shift starts", S.fleet.find(u => u.id === "pk1").status === "off");
S.running = true;
toggleUnit(S, "pk1");
check("toggle arms a peaker during live play (off → starting)", S.fleet.find(u => u.id === "pk1").status === "starting");

// 7) totalCapacity sums available MW across the fleet
S = createGame(); S.t = 18; S.weather = { sun: 1, wind: 1 };
const byHand = S.fleet.reduce((a, u) => a + unitOutput(S, u), 0);
check("totalCapacity = Σ unitOutput", near(totalCapacity(S), byHand, 1e-9), Math.round(totalCapacity(S)) + " MW");

console.log(failed === 0 ? "\nAll sim tests passed." : `\n${failed} sim test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
