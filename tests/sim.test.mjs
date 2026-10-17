// Unit tests for the live simulation (no DOM). Run: `npm test`.
// These pin the real-time loop's state machine and economics so the Phase B+
// feature work can't silently break pacing or the dispatch wiring.
import { createGame, step, surviveDay, unitOutput, totalCapacity, interp, tripHazard, autoService } from "../src/live/sim.js";
import { toggleUnit, buildCapacity, upgradeUnit, serviceUnit, decommissionUnit } from "../src/live/actions.js";
import { CFG, UPGRADE, upgradeCost, serviceCost, salvageValue } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 1) Fresh game state
let S = createGame();
check("fresh game: day 1, not running, not over", S.day === 1 && !S.running && !S.over);
check("fresh game: 9 units, carbon 0, starting cash", S.fleet.length === 9 && S.carbon === 0 && S.cash === CFG.startCash);

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

// 8) Build capacity: spends cash, grows the fleet, adds the block's MW
S = createGame();
const fleet0 = S.fleet.length, cash0 = S.cash;
let res = buildCapacity(S, "coal");
check("build adds a unit and charges cash", res.ok && S.fleet.length === fleet0 + 1 && S.cash < cash0,
  `fleet ${fleet0}→${S.fleet.length}, cash ${cash0}→${S.cash}`);
const built = S.fleet[S.fleet.length - 1];
check("built unit carries tech, tier 1, online", built.tech === "coal" && built.tier === 1 && built.status === "online");

// 9) Build is gated by cash
S = createGame(); S.cash = 0;
res = buildCapacity(S, "nuclear");
check("build refused without cash", !res.ok && S.fleet.length === 9);

// 10) Upgrade: tier up, capacity up, trip rate + standby cost down, cash spent
S = createGame();
const nucU = S.fleet.find(u => u.id === "nuc");
const cap0 = nucU.cap, fail0 = nucU.fail, spin0 = nucU.spin, before = S.cash;
res = upgradeUnit(S, "nuc");
check("upgrade raises tier to 2", res.ok && nucU.tier === 2);
check("upgrade raises capacity", nucU.cap > cap0, `${cap0}→${nucU.cap} MW`);
check("upgrade lowers trip rate and standby cost", nucU.fail < fail0 && nucU.spin < spin0);
check("upgrade charges the tier cost", near(before - S.cash, upgradeCost(1), 1e-6), "$" + (before - S.cash));

// 11) Upgrade stops at max tier
S = createGame(); S.cash = 1e9;
const pk = S.fleet.find(u => u.id === "pk1");
while ((pk.tier || 1) < UPGRADE.maxTier) upgradeUnit(S, "pk1");
res = upgradeUnit(S, "pk1");
check("upgrade refused past max tier", !res.ok && pk.tier === UPGRADE.maxTier, "tier " + pk.tier);

// 12) Wear drives trip hazard: a worn plant trips more than a healthy one
S = createGame();
const u100 = { fail: 0.02, condition: 100 }, u0 = { fail: 0.02, condition: 0 };
check("tripHazard rises with wear", tripHazard(u0, 1) > tripHazard(u100, 1),
  `${tripHazard(u100, 1).toFixed(4)} → ${tripHazard(u0, 1).toFixed(4)}/s`);
check("worn hazard = (1+wearTripK)× healthy", near(tripHazard(u0, 1), tripHazard(u100, 1) * (1 + CFG.wearTripK), 1e-9));

// 13) Condition degrades while a plant generates
S = createGame();
const nucW = S.fleet.find(u => u.id === "nuc"); nucW.fail = 0; // isolate wear from random trips
step(S, 2.0);
check("online plant wears down", nucW.condition < 100, nucW.condition.toFixed(1) + "%");

// 14) Service: pulls offline, costs cash, then restores condition
S = createGame();
const colA = S.fleet.find(u => u.id === "colA"); colA.condition = 40;
const cashA = S.cash, expCost = serviceCost(colA);
let sres = serviceUnit(S, "colA");
check("service pulls the unit offline and charges cash", sres.ok && colA.status === "service" && near(cashA - S.cash, expCost, 1e-6),
  "$" + (cashA - S.cash) + " for a 40% plant");
colA.serviceTimer = 0.05; // nearly done
step(S, 0.3);
check("service completes at 100% condition, back online", colA.condition > 99 && colA.status === "online",
  colA.condition.toFixed(1) + "% / " + colA.status);

// 15) Service is gated by cash
S = createGame(); S.cash = 0;
const colB = S.fleet.find(u => u.id === "colB"); colB.condition = 20;
sres = serviceUnit(S, "colB");
check("service refused without cash", !sres.ok && colB.status === "online");

// ---- Phase C meta: scoring, milestones, skills, modifiers ----
const meta = await import("../src/live/meta.js");

// 16) Skills modify a fresh game's starting conditions
S = createGame({ reserves: 2 });
check("Grid Reserves adds starting cash", S.cash === CFG.startCash + 80000, "$" + S.cash);
S = createGame({ battery: 1 });
const batU = S.fleet.find(u => u.id === "bat");
check("Battery Science grows the battery", batU.cap > 120 && batU.maxEnergy > 240, `${batU.cap} MW / ${batU.maxEnergy} MWh`);
S = createGame({ efficiency: 2 });
check("Efficiency Drive slows demand growth", S.peakGrowth < CFG.peakGrowth, S.peakGrowth.toFixed(3));

// 17) computeMods is neutral with no skills
const m0 = meta.computeMods({});
check("no skills → neutral mods", m0.startCashBonus === 0 && m0.wearMult === 1 && m0.battMult === 1);

// 18) Milestones trigger at their thresholds
S = createGame(); S.peak = 1000; S.cash = 0;
let nm = meta.newMilestones(S);
check("peak milestone fires at threshold", nm.some(m => m.id === "p900") && !nm.some(m => m.id === "p1200"),
  nm.map(m => m.id).join(","));
S.milestonesHit = ["p900"];
check("already-hit milestones aren't repeated", !meta.newMilestones(S).some(m => m.id === "p900"));

// 19) Scoring rewards survival; currency is always ≥ 1
const weak = meta.scoreRun({ day: 1, peak: 780, cash: 0, upAcc: 1, downAcc: 1, milestonesHit: [] });
const strong = meta.scoreRun({ day: 8, peak: 1400, cash: 500000, upAcc: 10, downAcc: 0, milestonesHit: ["p900", "p1200"] });
check("more survival → higher score", strong.score > weak.score, `${weak.score} → ${strong.score}`);
check("currency award is at least 1", meta.currencyFor(0) >= 1 && meta.currencyFor(strong.score) >= 1);

// 20) Buying skills spends currency, caps at max, refuses when broke
const prof = { currency: 20, skills: {}, best: {} };
check("buy a skill deducts currency and records the level", meta.buySkill(prof, "reserves") && prof.skills.reserves === 1 && prof.currency === 15);
prof.currency = 0;
check("buy refused when broke", !meta.buySkill(prof, "maintenance") && !prof.skills.maintenance);
const prof2 = { currency: 9999, skills: {}, best: {} };
const sk = meta.SKILLS.find(s => s.id === "faststart");
for (let i = 0; i < sk.max; i++) meta.buySkill(prof2, "faststart");
check("buy refused past max level", !meta.buySkill(prof2, "faststart") && prof2.skills.faststart === sk.max);

// 21) Decommission: removes the unit and refunds salvage; battery is protected
S = createGame();
const colAd = S.fleet.find(u => u.id === "colA");
const n0 = S.fleet.length, cash0d = S.cash, salv = salvageValue(colAd);
let dres = decommissionUnit(S, "colA");
check("decommission removes the unit and refunds salvage", dres.ok && S.fleet.length === n0 - 1 && !S.fleet.some(u => u.id === "colA") && near(S.cash - cash0d, salv, 1e-6),
  `fleet ${n0}→${S.fleet.length}, +$${S.cash - cash0d}`);
dres = decommissionUnit(S, "bat");
check("battery cannot be decommissioned", !dres.ok && S.fleet.some(u => u.id === "bat"));

// 22) Service Manager modifier is off without the skill, on with it
check("no Service Manager by default", meta.computeMods({}).autoServiceAt === 0);
check("Service Manager unlocks an auto-service threshold", meta.computeMods({ servicemgr: 2 }).autoServiceAt > 0);

// 23) autoService pulls a worn OFFLINE plant without risking capacity
S = createGame({ servicemgr: 3 }); S.cash = 1e6;
const pkR = S.fleet.find(u => u.id === "pk1"); // a reserve peaker, offline
pkR.condition = 20;                            // well below the lvl-3 threshold (70)
S.autoSvcAcc = 5;                              // force the once-per-hour check to fire
autoService(S, 1);
check("Service Manager auto-services a worn reserve plant", pkR.status === "service", pkR.status);

// 24) autoService won't pull an online plant when it would cause a shortfall
S = createGame({ servicemgr: 3 }); S.cash = 1e6;
const nucS = S.fleet.find(u => u.id === "nuc"); nucS.condition = 10;
S.capacity = 600; S.demand = 590; S.autoSvcAcc = 5; // only 10 MW margin, nuclear is 250 MW
autoService(S, 1);
check("Service Manager won't pull an online plant into a shortfall", nucS.status === "online", nucS.status);

console.log(failed === 0 ? "\nAll sim tests passed." : `\n${failed} sim test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
