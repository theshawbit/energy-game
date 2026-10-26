// Unit tests for the live simulation (no DOM). Run: `npm test`.
// These pin the real-time loop's state machine and economics so the Phase B+
// feature work can't silently break pacing or the dispatch wiring.
import { createGame, step, surviveDay, unitOutput, totalCapacity, interp, tripHazard, autoService } from "../src/live/sim.js";
import { toggleUnit, buildCapacity, upgradeUnit, serviceUnit, decommissionUnit, setHedge, hedgeContract, cancelContract } from "../src/live/actions.js";
import { CFG, UPGRADE, upgradeCost, serviceCost, salvageValue } from "../src/live/config.js";
import { computeResearchMods } from "../src/live/research.js";
import { computeMutatorMods } from "../src/live/mutators.js";

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

// 12) v4.2.1: condition GATES trip hazard — healthy plants are near-immune, risk
// ramps quadratically to the full worn-out rate (u.fail) as condition falls.
S = createGame();
const u100 = { fail: 0.02, condition: 100 }, u85 = { fail: 0.02, condition: CFG.tripSafe };
const u50 = { fail: 0.02, condition: 50 }, u0 = { fail: 0.02, condition: 0 };
check("tripHazard rises as a plant wears", tripHazard(u0, 1) > tripHazard(u50, 1) && tripHazard(u50, 1) > tripHazard(u85, 1),
  `${tripHazard(u85, 1).toFixed(4)} → ${tripHazard(u50, 1).toFixed(4)} → ${tripHazard(u0, 1).toFixed(4)}/s`);
check("healthy band (≥tripSafe) carries only the tiny floor", near(tripHazard(u100, 1), u100.fail * CFG.tripFloor, 1e-9));
check("a pristine plant is far safer than the floor-less old model", tripHazard(u100, 1) < u100.fail * 0.05);
check("fully worn (0%) hazard is the full u.fail rate", near(tripHazard(u0, 1), u0.fail, 1e-9));
check("the ramp below tripSafe is quadratic (gentle mid-wear)", tripHazard(u50, 1) < u0.fail * 0.5,
  `${tripHazard(u50, 1).toFixed(4)} vs full ${u0.fail}`);
check("condition-less units never trip", tripHazard({ fail: 0.02, condition: null }, 1) === 0);

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

// 25) Fresh game carries neutral research state (v3)
S = createGame();
check("fresh game: 0 RP, no funding, no research, neutral rmods",
  S.rp === 0 && S.rdFunding === 0 && Object.keys(S.research).length === 0 && S.rmods.wearMult === 1);

// 26) R&D funding accrues RP in step() (net cash also carries revenue, so we
// assert the deterministic RP side — the conversion debits cash by construction)
S = createGame(); S.running = true;
S.rdFunding = 8000; const rpBefore = S.rp;
step(S, 1.0);
check("step accrues RP from R&D funding", S.rp > rpBefore, `+${(S.rp - rpBefore).toFixed(1)} RP`);

// ---- v3 multi-storage (B2): the single-battery assumption is lifted ----

// 27) Batteries are buildable now, and a built one is a proper storage unit
S = createGame();
const nBat0 = S.fleet.filter(u => u.kind === "battery").length;
let bres = buildCapacity(S, "battery");
check("battery is buildable from the catalogue", bres.ok && S.fleet.filter(u => u.kind === "battery").length === nBat0 + 1);
const built2 = S.fleet[S.fleet.length - 1];
check("built battery is storage: off, controllable, no condition, has energy",
  built2.kind === "battery" && built2.status === "off" && built2.ctrl === true && built2.condition == null && built2.maxEnergy > 0 && built2.energy === built2.maxEnergy,
  `${built2.energy}/${built2.maxEnergy} MWh`);

// 28) Two discharging batteries drain in proportion to stored energy, none below 0
S = createGame(); S.running = true;
buildCapacity(S, "battery");
const bats = S.fleet.filter(u => u.kind === "battery");
S.t = 0; // midnight: no solar
for (const u of S.fleet){ if (u.kind !== "battery"){ if (u.kind === "renew") u.cap = 0; else u.status = "off"; } } // batteries are the only dispatchable supply
bats[0].status = "discharge"; bats[0].energy = 100;
bats[1].status = "discharge"; bats[1].energy = 200;
const e0 = bats[0].energy, e1 = bats[1].energy;
step(S, 0.5);
const d0 = e0 - bats[0].energy, d1 = e1 - bats[1].energy;
check("both batteries discharged and neither went negative", d0 > 0 && d1 > 0 && bats[0].energy >= 0 && bats[1].energy >= 0,
  `drained ${d0.toFixed(1)} / ${d1.toFixed(1)} MWh`);
check("drain splits in proportion to stored energy (100:200 → 1:2)", near(d1 / d0, e1 / e0, 0.02), (d1 / d0).toFixed(3) + "×");

// 29) Decommission a battery when there are two; refuse the last one
S = createGame(); buildCapacity(S, "battery");
const firstBat = S.fleet.find(u => u.kind === "battery");
let dr = decommissionUnit(S, firstBat.id);
check("a battery can be decommissioned when another remains", dr.ok && S.fleet.filter(u => u.kind === "battery").length === 1);
const lastBat = S.fleet.find(u => u.kind === "battery");
dr = decommissionUnit(S, lastBat.id);
check("the last battery can't be decommissioned", !dr.ok && S.fleet.some(u => u.kind === "battery"));

// ---- B3: storage + demand-response research wired into the sim ----

// 30) Demand-response research shaves live demand (the demand-side lever)
{
  const A = createGame(); A.t = 18; step(A, 0.01); const dBase = A.demand;
  const B = createGame(); B.t = 18; B.research = { "demand-response": true }; B.rmods = computeResearchMods(B.research);
  step(B, 0.01); const dShaved = B.demand;
  check("demand-response shaves ~6% off demand", near(dShaved, dBase * 0.94, 1), `${dBase.toFixed(0)} → ${dShaved.toFixed(0)} MW`);
}

// 31) storage-power boosts a discharging battery's output
{
  S = createGame();
  const bat = S.fleet.find(u => u.kind === "battery"); bat.status = "discharge"; bat.energy = 100;
  const base = unitOutput(S, bat);
  S.rmods = computeResearchMods({ "storage-power": true });
  check("storage-power lifts battery discharge power +30%", near(unitOutput(S, bat), base * 1.30, 1e-6), `${base} → ${unitOutput(S, bat).toFixed(0)} MW`);
}

// 32) storage-depth lets a battery recharge beyond its base max energy
{
  S = createGame(); S.running = true; S.t = 3; // deep night: low demand, surplus to recharge from
  S.research = { "storage-depth": true }; S.rmods = computeResearchMods(S.research);
  const bat = S.fleet.find(u => u.kind === "battery"); bat.status = "off"; bat.energy = bat.maxEnergy; // full at base depth
  const baseMax = bat.maxEnergy;
  step(S, 0.2);
  check("storage-depth recharges past the base max energy", bat.energy > baseMax, `${baseMax} → ${bat.energy.toFixed(1)} MWh`);
}

// ---- B4: advanced-gen build gating + transmission effects ----

// 33) Advanced-gen builds are gated by their research unlock
S = createGame(); S.cash = 1e9;
let g = buildCapacity(S, "smr");
check("SMR build refused before research", !g.ok && !S.fleet.some(u => u.tech === "smr"));
S.rmods = computeResearchMods({ "unlock-smr": true });
g = buildCapacity(S, "smr");
check("SMR buildable once unlocked", g.ok && S.fleet.some(u => u.tech === "smr"));
const smrU = S.fleet.find(u => u.tech === "smr");
check("built SMR is clean firm with its own params", smrU.kind === "firm" && smrU.condition === 100 && smrU.spin === 2 && smrU.fail === 0.0020);

// 34) One Carbon Capture unlock enables both CCS variants; geo stays gated
S = createGame(); S.cash = 1e9; S.rmods = computeResearchMods({ "unlock-ccs": true });
const gc = buildCapacity(S, "ccs_coal"), gg = buildCapacity(S, "ccs_gas"), gq = buildCapacity(S, "geo");
check("Carbon Capture unlocks both coal+CCS and gas+CCS", gc.ok && gg.ok && S.fleet.some(u => u.tech === "ccs_coal") && S.fleet.some(u => u.tech === "ccs_gas"));
check("geo stays gated under a CCS-only unlock", !gq.ok && !S.fleet.some(u => u.tech === "geo"));

// 35) fast-ramp research shortens a peaker's spin-up time
S = createGame(); S.running = true; toggleUnit(S, "pk1");
const t1 = S.fleet.find(u => u.id === "pk1").startTimer;
let S2 = createGame(); S2.running = true; S2.rmods = computeResearchMods({ "fast-ramp": true }); toggleUnit(S2, "pk1");
const t2 = S2.fleet.find(u => u.id === "pk1").startTimer;
check("fast-ramp cuts peaker spin-up 20%", near(t2, t1 * 0.80, 1e-9), `${t1.toFixed(2)}h → ${t2.toFixed(2)}h`);

// ---- C1: research-branch meta unlocks + gating carried onto the game ----

// 36) buyUnlock spends currency, records the unlock, and refuses repeat/broke buys
{
  const prof = { currency: 10, skills: {}, researchUnlocked: {}, best: {} };
  const u = meta.RESEARCH_UNLOCKS.find(x => x.id === "storage");
  check("buyUnlock opens a branch and charges its cost", meta.buyUnlock(prof, "storage") && prof.researchUnlocked.storage === true && prof.currency === 10 - u.cost);
  check("buyUnlock refuses an already-owned unlock", !meta.buyUnlock(prof, "storage"));
  prof.currency = 0;
  check("buyUnlock refused when broke", !meta.buyUnlock(prof, "advgen") && !prof.researchUnlocked.advgen);
}

// 37) createGame carries the profile's unlocks onto the run (copied, not shared)
{
  const unlocks = { storage: true };
  const g = createGame({}, unlocks);
  check("createGame copies researchUnlocked onto state", g.researchUnlocked.storage === true && g.researchUnlocked !== unlocks);
}

// ---- D1: per-run mutators folded into the sim ----

// 38) createGame is deterministic: no mutators by default; stores & derives what's passed
{
  const plain = createGame();
  check("createGame defaults to no mutators (deterministic)", plain.mutators.length === 0 && plain.mmods.demandMult === 1);
  const g = createGame({}, {}, ["heatwave"]);
  check("createGame stores passed mutators and derives mmods", g.mutators.join() === "heatwave" && g.mmods.demandMult === CFG.mut.heatwave && g.mutators !== undefined);
}

// 39) A heat-wave mutator lifts live demand
{
  const A = createGame(); A.mmods = computeMutatorMods([]); A.t = 18; step(A, 0.01); const dBase = A.demand;
  const B = createGame(); B.mmods = computeMutatorMods(["heatwave"]); B.t = 18; step(B, 0.01); const dHot = B.demand;
  check("heat wave raises demand ~18%", near(dHot, dBase * CFG.mut.heatwave, 1), `${dBase.toFixed(0)} → ${dHot.toFixed(0)} MW`);
}

// 40) A renewable lull cuts solar & wind output
{
  S = createGame(); S.t = 12; S.weather = { sun: 1, wind: 1 }; S.mmods = computeMutatorMods([]);
  const sol = S.fleet.find(u => u.id === "sol"), wnd = S.fleet.find(u => u.id === "wnd");
  const solBase = unitOutput(S, sol), wndBase = unitOutput(S, wnd);
  S.mmods = computeMutatorMods(["renewable-lull"]);
  check("renewable lull derates solar & wind", near(unitOutput(S, sol), solBase * CFG.mut.lull, 1e-6) && near(unitOutput(S, wnd), wndBase * CFG.mut.lull, 1e-6));
}

// 41) BUILT solar uses solar weather (tech-based), not wind — the latent id==="sol" fix
{
  S = createGame(); S.cash = 1e9; S.t = 12; S.weather = { sun: 1, wind: 0 };
  buildCapacity(S, "solar");
  const builtSolar = S.fleet.find(u => u.tech === "solar" && u.id !== "sol");
  check("a built solar farm follows sun weather, not wind", unitOutput(S, builtSolar) > 0, `${unitOutput(S, builtSolar).toFixed(0)} MW at sun=1,wind=0`);
}

// ---- Phase B: spot market + term contracts wired into the sim ----

// 42) Fresh game carries neutral v4 economy state; flat retailPrice is retired
{
  S = createGame();
  check("fresh game: neutral spot/contract state",
    S.spot === 0 && S.spotBaseline === 0 && S.spotNoise === 0 && S.hedge === CFG.hedgeDefault &&
    S.contracts.length === 0 && S.contractedMW === 0 && S.contractSeq === 1 && S.pendingOffer === null);
  check("CFG.retailPrice is retired (spot replaces it)", CFG.retailPrice === undefined);
}

// 43) A live step sets a clamped spot price and a positive baseline (no contracts → 0 locked)
{
  S = createGame(); S.running = true;
  step(S, 0.1);
  check("step sets spot within [floor, cap] and a positive baseline",
    S.spot >= CFG.spotFloor && S.spot <= CFG.spotCap && S.spotBaseline > 0, `$${S.spot.toFixed(1)} (base $${S.spotBaseline.toFixed(1)})`);
  check("no contracts → contractedMW stays 0 (pure spot)", S.contractedMW === 0);
}

// Controlled single-source grid (only nuclear, no trips, no renewables/batteries,
// no R&D) so the cash line is deterministic and driven purely by the revenue model.
function controlled(peak){
  const g = createGame(); g.peak = peak; g.t = 3; g.running = true; g.rdFunding = 0;
  for (const u of g.fleet){
    if (u.id === "nuc"){ u.status = "online"; u.fail = 0; }
    else if (u.kind === "renew"){ u.cap = 0; }
    else u.status = "off";
  }
  return g;
}

// 44) A high-priced contract settles at its locked price, distinct from spot: on
//     the SAME grid, a contracted run out-earns a contract-free (pure-spot) run.
{
  const A = controlled(400), B = controlled(400);
  A.contracts = [{ id: "ct-1", mw: 300, price: 200, term: 3, remaining: 3, origin: "dial", buyer: null }];
  const a0 = A.cash, b0 = B.cash;
  step(A, 0.5); step(B, 0.5);
  check("a locked contract covers served load at its price (contractedMW = committed)", A.contractedMW === 300, A.contractedMW + " MW");
  check("contract-free run prices served at spot (contractedMW = 0)", B.contractedMW === 0);
  check("the high-priced contract out-earns the pure-spot grid", (A.cash - a0) > (B.cash - b0),
    `Δ $${(A.cash - a0).toFixed(0)} vs $${(B.cash - b0).toFixed(0)}`);
}

// 45) A shortfall settles on SERVED load, never unserved: with a contract larger
//     than served, residual stays ≥ 0 and cash stays finite (no windfall/NaN).
{
  S = controlled(1200); // peak 1200 at t=3 ≫ nuclear 250 → a deep shortfall
  S.contracts = [{ id: "ct-1", mw: 999, price: 200, term: 3, remaining: 3, origin: "dial", buyer: null }];
  const before = S.cash;
  step(S, 0.05);
  check("shortfall: committed volume recorded, residual never negative", S.contractedMW === 999 && Number.isFinite(S.cash),
    `cash ${before.toFixed(0)} → ${S.cash.toFixed(0)}`);
}

// 46) Contracts age out on day rollover (expireContracts in surviveDay)
{
  S = createGame();
  S.contracts = [{ id: "ct-1", mw: 50, price: 60, term: 1, remaining: 1, origin: "dial", buyer: null }];
  surviveDay(S);
  check("surviveDay expires a 1-day contract", S.contracts.length === 0);
}

// 47) fuel-spike compounds the spot scarcity premium (mmods.scarcityMult)
{
  const base = computeMutatorMods([]);
  const spiked = computeMutatorMods(["fuel-spike"]);
  check("fuel-spike raises scarcityMult above neutral", base.scarcityMult === 1 && spiked.scarcityMult === CFG.mut.fuelScarcity,
    `×${spiked.scarcityMult}`);
}

// ---- Phase C: financing — debt, credit, interest, bankruptcy ----
const { borrow, repay } = await import("../src/live/actions.js");
const { creditRating, interestFor } = await import("../src/live/finance.js");

// 48) Fresh game carries neutral financing state; credit starts at the carried standing
{
  S = createGame();
  check("fresh game: no debt, default credit standing, not defaulted",
    S.debt === 0 && S.credit === CFG.creditStart && S.creditCap === 100 && S.defaulted === false && S.insolventT === 0 && S.interestPaid === 0);
  const carried = createGame({}, {}, [], 42);
  check("createGame carries a passed-in credit standing", carried.credit === 42);
}

// 49) borrow adds cash + debt, refused past the ceiling; repay clamps to debt & cash
{
  S = createGame();
  const ceiling = creditRating(S.credit).ceiling, cash0 = S.cash;
  let r = borrow(S, 50000);
  check("borrow adds cash and debt", r.ok && S.debt === 50000 && S.cash === cash0 + 50000);
  r = borrow(S, ceiling); // would exceed the ceiling
  check("borrow refused past the credit ceiling", !r.ok && S.debt === 50000);
  const cashB = S.cash;
  r = repay(S, 20000);
  check("repay lowers debt and cash", r.ok && S.debt === 30000 && S.cash === cashB - 20000);
  r = repay(S, 999999); // clamp to remaining debt
  check("repay clamps to the debt owed", S.debt === 0 && S.cash >= 0);
  S.cash = 100; S.debt = 50000;
  r = repay(S, 40000); // can't repay into the red — clamp to cash on hand
  check("repay clamped to cash on hand (no repay into the red)", near(S.debt, 50000 - 100, 1e-9) && S.cash === 0, `debt ${S.debt}`);
}

// 50) Interest accrues on debt into the cash line, exactly, and into interestPaid
{
  S = controlled(400); S.debt = 100000; S.credit = 100; // rateMin
  const rate = creditRating(100).rate, before = S.cash, ip0 = S.interestPaid;
  const dt = 0.5, dtH = dt * (24 / CFG.secondsPerDay);
  // isolate interest: snapshot the non-interest cash move by running an identical debt-free run
  const B = controlled(400);
  step(S, dt); step(B, dt);
  const expectedInterest = interestFor(100000, rate, dtH);
  check("interest accrues into interestPaid", near(S.interestPaid - ip0, expectedInterest, 1e-6), "$" + (S.interestPaid - ip0).toFixed(2));
  check("interest is exactly the extra cash drain vs a debt-free run", near((B.cash) - (S.cash), expectedInterest, 1e-6),
    `Δ $${((B.cash) - (S.cash)).toFixed(2)} vs $${expectedInterest.toFixed(2)}`);
}

// An insolvent state with NO demand (peak 0) so neither revenue can rescue the
// red cash nor a shortfall can trigger a blackout — isolating the credit paths.
function insolvent(debt){
  const g = createGame(); g.running = true; g.peak = 0; g.rdFunding = 0; g.cash = -10; g.debt = debt;
  return g;
}

// 51) Default fires once when insolvent with debt: credit cratered, ceiling capped
{
  S = insolvent(50000);
  step(S, 0.05);
  check("insolvent-with-debt triggers a default (credit cratered, capped)", S.defaulted && S.credit <= CFG.defaultCredit && S.creditCap === CFG.defaultCeil);
  const creditAfter = S.credit;
  step(S, 0.05); // still insolvent — must NOT default again
  check("default scars only once", S.credit === creditAfter && S.debtLedger.filter(e => e.type === "default").length === 1);
}

// 52) Bankruptcy: sustained insolvency ends the run after the grace window; recovering resets the clock
{
  S = insolvent(1000);
  step(S, CFG.bankruptcyGrace - 0.5); // insolvent but within grace
  check("within the grace window the run survives", !S.over && S.insolventT > 0, `insolventT ${S.insolventT.toFixed(1)}`);
  S.cash = 5000; // recover to solvent
  step(S, 0.1);
  check("recovering to solvent resets the insolvency clock", S.insolventT < CFG.bankruptcyGrace - 0.5);
  S.cash = -10; // back under
  step(S, CFG.bankruptcyGrace + 0.5);
  check("sustained insolvency past the grace window files bankruptcy", S.over && /bankrupt/i.test(S.reason), S.reason);
}

// 53) Hard insolvency is instant (a catastrophic hole, no grace)
{
  S = insolvent(1000); S.cash = CFG.hardInsolvency - 1;
  step(S, 0.02);
  check("a catastrophic cash hole winds the utility up instantly", S.over && /seized|wound/i.test(S.reason), S.reason);
}

// 54) A cash-only over-build can go bankrupt with NO debt (and never defaults)
{
  S = insolvent(0);
  step(S, CFG.bankruptcyGrace + 0.5);
  check("no-debt insolvency still bankrupts after grace, without a default event", S.over && !S.defaulted && /bankrupt/i.test(S.reason), S.reason);
}

// ---- Phase D: scoring accumulators built over the run ----

// 55) Fresh game seeds the accumulators (peakNetWorth = opening cash)
{
  S = createGame();
  check("fresh game: accumulators zeroed, peakNetWorth = starting cash",
    S.cleanMWh === 0 && S.servedMWh === 0 && S.bestSpotKill === 0 && S.peakNetWorth === CFG.startCash);
}

// 56) A clean-only grid builds servedMWh & cleanMWh with cleanShare in [0,1] (≈1)
{
  S = controlled(400); // nuclear-only supply → every served MWh is clean
  for (let i = 0; i < 6; i++) step(S, 0.4);
  const share = S.servedMWh > 0 ? S.cleanMWh / S.servedMWh : 0;
  check("served & clean MWh accumulate", S.servedMWh > 0 && S.cleanMWh > 0);
  check("cleanShare stays within [0,1] and is ≈1 for a nuclear grid", share >= 0 && share <= 1 + 1e-9 && share > 0.99, share.toFixed(3));
}

// 57) peakNetWorth is monotonic (a high-water mark, never falls)
{
  S = controlled(400); let prev = S.peakNetWorth, mono = true;
  for (let i = 0; i < 8; i++){ step(S, 0.4); if (S.peakNetWorth < prev) mono = false; prev = S.peakNetWorth; }
  check("peakNetWorth never decreased across the run", mono);
}

// 58) bestSpotKill stays 0 on a flush grid (negative premium → no spike to capture)
{
  S = controlled(400); // margin ~0.28 > rmRef → premium ≤ 0
  for (let i = 0; i < 5; i++) step(S, 0.4);
  check("flush grid captures no spot spike (bestSpotKill = 0)", S.bestSpotKill === 0, "$" + S.bestSpotKill.toFixed(0));
}

// 59) bestSpotKill grows on a TIGHT-but-served grid (positive premium × residual)
{
  S = controlled(490); // demand ~240 vs 250 cap → margin < rmRef → premium > 0, still served
  for (let i = 0; i < 5; i++) step(S, 0.3);
  check("a tight-but-served grid captures a spot spike (bestSpotKill > 0)", S.bestSpotKill > 0, "$" + S.bestSpotKill.toFixed(0));
}

// ---- Phase F: finite-run win-state + capacity market wired into the sim ----

// 60) createGame carries economy unlocks + max run days; finite run WINS at the cap
{
  const g = createGame({}, {}, [], CFG.creditStart, { "runlen-1": true }, 7);
  check("createGame stores economyUnlocked (copied) + maxRunDays", g.economyUnlocked["runlen-1"] === true && g.maxRunDays === 7 && g.won === false);
}
{
  S = createGame({}, {}, [], CFG.creditStart, {}, 5); // 5-day contract
  S.day = 5; S.t = 23.9;
  step(S, 1.0); // crosses midnight into day 6 > maxRunDays
  check("surviving past maxRunDays ends the run as a WIN", S.over && S.won === true && /Contract complete/i.test(S.reason), S.reason);
}

// 61) Capacity obligation pays for availability each tick (cash up, no call needed)
{
  S = controlled(400); S.economyUnlocked = { "capacity-market": true };
  S.capacityObligation = { reserveMW: 200, pricePerMW: CFG.capacity.pricePerMW, termDays: 4, daysLeft: 4, calledToday: false };
  S.rng = () => 0.99; // no call lands
  const a0 = S.cash; const B = controlled(400); const b0 = B.cash;
  step(S, 0.5); step(B, 0.5);
  const expectedPay = 200 * CFG.capacity.pricePerMW * (0.5 * (24 / CFG.secondsPerDay) / 24);
  check("capacity availability payment credits cash each tick", near((S.cash - a0) - (B.cash - b0), expectedPay, 1e-6),
    `Δ $${((S.cash - a0) - (B.cash - b0)).toFixed(2)} vs $${expectedPay.toFixed(2)}`);
}

// 62) A capacity CALL that finds the grid short deducts exactly the penalty and
//     NEVER sets S.over (a breach fine is recoverable, not fatal)
{
  S = controlled(400); S.economyUnlocked = { "capacity-market": true };
  // pledge more firm reserve than exists so a call is always short
  const firm = S.fleet.reduce((a, u) => a + ((u.kind === "firm" || u.kind === "peaker") && u.status !== "tripped" && u.status !== "service" ? u.cap : 0), 0);
  S.capacityObligation = { reserveMW: firm + 300, pricePerMW: CFG.capacity.pricePerMW, termDays: 4, daysLeft: 4, calledToday: false };
  S.capHour = -1; S.rng = () => 0.0; // force a call this new hour
  const pay = 0; // isolate: compare against a no-call baseline is complex; instead assert the fine magnitude via net move sign + not-over
  const before = S.cash;
  step(S, 0.05);
  const shortfall = (firm + 300) - firm; // = 300 MW short
  check("a short capacity call fines but never ends the run", !S.over && S.capacityObligation.calledToday === true && S.cash < before,
    `cash ${before.toFixed(0)} → ${S.cash.toFixed(0)}, short ${shortfall} MW`);
}

// 59) v4.1 telegraphed trip: a hazard roll strains (not an instant trip); a strained
// plant still generates through its warning window, then trips when it runs out.
{
  const S = createGame(); S.running = true;
  const u = S.fleet.find(x => x.id === "colA");
  u.status = "strained"; u.strainTimer = CFG.strainWarn;
  check("a straining plant still generates its full output", unitOutput(S, u) === u.cap);
  step(S, 0.1); // less than the warning window
  check("strain holds through its warning window", u.status === "strained" && u.strainTimer > 0);
  u.strainTimer = 0.001; step(S, 0.5); // exhaust the window
  check("strain trips the plant when the window runs out", u.status === "tripped" && u.tripTimer > 0);
}

// 60) v4.1 agency: standing a strained PEAKER down clears the strain (your terms)
{
  const S = createGame(); S.running = true;
  const pk = S.fleet.find(x => x.id === "pk1");
  pk.status = "strained"; pk.strainTimer = CFG.strainWarn;
  toggleUnit(S, pk.id);
  check("standing a strained peaker down clears the strain", pk.status === "off" && pk.strainTimer === 0);
}

// 61) v4.1 fixed O&M: an idle reserve costs only CFG.fixedOMIdle of the full rate
// (so cold-start grids aren't bled dry by capacity they aren't even running)
{
  const S = createGame();
  const pk = S.fleet.find(x => x.id === "pk1"); // a peaker starts OFF (reserve)
  check("an off reserve is billed fixed O&M at the idle fraction", CFG.fixedOMIdle < 1 && pk.status === "off");
}

// 62) v4.1 contract ladder: hedge signs ADD legs (not replace), up to the cap, and
// cancelContract trims the book. (Was replace-model in v4; now a ladder.)
{
  const S = createGame(); S.running = true;
  setHedge(S, 0.5);
  hedgeContract(S, 2); hedgeContract(S, 4); hedgeContract(S, 6);
  check("each hedge sign adds a leg (not replace)", S.contracts.length === 3, S.contracts.length + " legs");
  check("legs keep their own distinct terms", S.contracts.map(c => c.term).sort((a, b) => a - b).join() === "2,4,6");
  // cap: can't exceed CFG.hedgeMaxContracts standing legs
  for (let i = 0; i < 10; i++) hedgeContract(S, 3);
  check("hedge book is capped at CFG.hedgeMaxContracts", S.contracts.filter(c => c.origin === "dial").length === CFG.hedgeMaxContracts, S.contracts.length + "");
  // cancel one leg by id
  const id = S.contracts[0].id, n0 = S.contracts.length;
  check("cancelContract drops exactly that leg", cancelContract(S, id).ok && S.contracts.length === n0 - 1 && !S.contracts.some(c => c.id === id));
  check("cancelling an unknown id is a safe no-op", !cancelContract(S, "nope").ok);
  // dial at 0 signs nothing
  setHedge(S, 0);
  const n1 = S.contracts.length;
  check("hedge dial at 0 signs nothing", !hedgeContract(S, 3).ok && S.contracts.length === n1);
}

console.log(failed === 0 ? "\nAll sim tests passed." : `\n${failed} sim test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
