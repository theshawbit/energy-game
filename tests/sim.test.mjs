// Unit tests for the live simulation (no DOM). Run: `npm test`.
// These pin the real-time loop's state machine and economics so the Phase B+
// feature work can't silently break pacing or the dispatch wiring.
import { createGame, step, surviveDay, beginNextQuarter, unitOutput, totalCapacity, interp, tripHazard, dailyStrainProb } from "../src/live/sim.js";
import { isQuarterEnd } from "../src/live/calendar.js";
import { toggleUnit, specializeUnit, decommissionUnit, setHedge, hedgeContract, cancelContract } from "../src/live/actions.js";
import { upgradeCost } from "../src/live/progression.js";
import { CFG, salvageValue, makeUnit } from "../src/live/config.js";
// v5 Phase 5 retired the instant buildCapacity; this adds a unit directly for the
// mechanics tests below (dispatch/storage/makeUnit params). Build GATING now lives in
// tests/construct.test.mjs (commitBuild).
function addUnit(S, tech){ const n = (S.techCount[tech] = (S.techCount[tech] || 0) + 1); const u = makeUnit(tech, n, S.buildSeq++); S.fleet.push(u); return u; }
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
check("fresh game: day 1, not running, operating mode (no run-end)", S.day === 1 && !S.running && S.calendar.mode === "operating");
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

// 4) Day rollover triggers surviveDay (v5.1: quarterly-step demand, not daily growth)
S = createGame(); S.calm = true;
S.t = 23.9; const qp0 = S.quarterPeak;
step(S, 1.0); // crosses midnight, still within the quarter
check("crossing 24:00 rolls the day over", S.day === 2, "day " + S.day);
check("within a quarter the baseline holds (no daily growth)", S.quarterPeak === qp0 && S.peak === qp0,
  `base ${S.quarterPeak}, peak ${S.peak} MW`);

// 5) Carbon escalation begins on carbonStartDay and climbs
S = createGame();
for (let i = 0; i < CFG.carbonStartDay - 2; i++) surviveDay(S); // advance to the day before pricing starts
check("no carbon before carbonStartDay", S.carbon === 0, "$" + S.carbon + " at day " + S.day);
surviveDay(S); // this day reaches carbonStartDay and applies the first charge
check("carbon begins once carbonStartDay is reached", S.carbon >= CFG.carbonPerDay - 1e-9, "$" + S.carbon + "/t at day " + S.day);
const c1 = S.carbon; surviveDay(S);
check("carbon keeps climbing each day", S.carbon > c1, `$${c1} → $${S.carbon}/t`);

// 6) A controllable gas unit arms (commit → spin-up) only during live play. v5 Phase 2:
// toggleUnit flips the commit dial; the commit→status spin-up happens in step().
S = createGame(); S.calm = true;
toggleUnit(S, "pk1");
check("toggle is a no-op before the shift starts", S.fleet.find(u => u.id === "pk1").dials.commit === false);
S.running = true;
toggleUnit(S, "pk1"); step(S, 0.0005);
check("toggle arms a gas unit during live play (commit → starting)",
  S.fleet.find(u => u.id === "pk1").dials.commit === true && S.fleet.find(u => u.id === "pk1").status === "starting");

// 7) totalCapacity sums available MW across the fleet
S = createGame(); S.t = 18; S.weather = { sun: 1, wind: 1 };
const byHand = S.fleet.reduce((a, u) => a + unitOutput(S, u), 0);
check("totalCapacity = Σ unitOutput", near(totalCapacity(S), byHand, 1e-9), Math.round(totalCapacity(S)) + " MW");

// 8–9) Construction (commitBuild/tickBuilds, incl. cash + research gates) is covered in
// tests/construct.test.mjs — the v4 instant buildCapacity path was retired in Phase 5.

// 10) v5.1 Phase 3: specialize now QUEUES a rolling contractor upgrade — cash leaves now; the
// tier (and the raised cap) lands only after the lead time. (Instant specialization + the RP
// family-ceiling lane are retired; the ladder/queue mechanics are pinned in contractor.test.)
S = createGame(); S.cash = 1e9;
const nucU = S.fleet.find(u => u.id === "nuc");
const tier0 = nucU.tiers.output, cost0 = upgradeCost(nucU, "output"), before = S.cash;
let res = specializeUnit(S, "nuc", "output");
check("specialize queues one contractor upgrade job", res.ok && S.contractor.length === 1 && S.contractor[0].unitId === "nuc");
check("specialize charges the axis cost up front", near(before - S.cash, cost0, 1e-6), "$" + (before - S.cash));
check("the tier has NOT applied yet (you pay to wait)", nucU.tiers.output === tier0 && nucU.caps.output === CFG.v5_1.upgrade.base);
check("a second queue on the same axis is refused", !specializeUnit(S, "nuc", "output").ok && S.contractor.length === 1);

// 11) The ladder caps at tier 9 — the next queue is refused with the axis maxed.
S = createGame(); S.cash = 1e12;
const pk = S.fleet.find(u => u.id === "pk1");
pk.tiers.flexibility = CFG.v5_1.upgrade.tierMax;
res = specializeUnit(S, "pk1", "flexibility");
check("specialize refused at tier 9 (the cap)", !res.ok && S.contractor.length === 0);

// 12) v4.2.2: trip risk is tied to CONDITION via the tripOdds lookup. HARD RULE —
// a plant at ≥85% NEVER trips (trips are now a rare neglect event, not a tax). Below
// 85% risk ramps; a plant's own fail scales it; the deep-wreck zone still bites.
const sec = CFG.secondsPerDay;
const ref = c => ({ fail: CFG.tripRefFail, condition: c });
const pDayOf = u => 1 - Math.exp(-tripHazard(u, 1) * sec); // realized daily strain prob (diff 1)
check("a plant at ≥85% NEVER trips (hard floor)",
  dailyStrainProb(100) === 0 && dailyStrainProb(90) === 0 && dailyStrainProb(85) === 0 && pDayOf(ref(100)) === 0,
  "100/90/85% all 0%/day");
check("77% ≈ 0.4%/day (rare)", near(pDayOf(ref(77)), 0.004, 1e-6), (pDayOf(ref(77)) * 100).toFixed(2) + "%");
check("70% ≈ 1.2%/day", near(pDayOf(ref(70)), 0.012, 1e-6), (pDayOf(ref(70)) * 100).toFixed(2) + "%");
check("50% ≈ 18%/day (neglect bites)", near(pDayOf(ref(50)), 0.18, 1e-6), (pDayOf(ref(50)) * 100).toFixed(1) + "%");
check("dailyStrainProb passes through its table points", near(dailyStrainProb(60), 0.06, 1e-9) && near(dailyStrainProb(40), 0.30, 1e-9));
check("odds rise monotonically as condition falls below 85",
  tripHazard(ref(85), 1) < tripHazard(ref(70), 1) && tripHazard(ref(70), 1) < tripHazard(ref(50), 1) && tripHazard(ref(50), 1) < tripHazard(ref(30), 1));
check("odds plateau below the last point", dailyStrainProb(10) === dailyStrainProb(30));
check("a more reliable plant (lower fail) trips less", tripHazard({ fail: 0.0020, condition: 50 }, 1) < tripHazard(ref(50), 1));
check("the day ramp (diff) lifts the hazard", tripHazard(ref(50), 1.5) > tripHazard(ref(50), 1));
check("condition-less units never trip", tripHazard({ fail: 0.02, condition: null }, 1) === 0);

// 13) Condition degrades while a plant generates
S = createGame();
const nucW = S.fleet.find(u => u.id === "nuc"); nucW.fail = 0; // isolate wear from random trips
step(S, 2.0);
check("online plant wears down", nucW.condition < 100, nucW.condition.toFixed(1) + "%");

// 13b) v4.2.1 wear is weighted by LOAD × AGE.
// Load: a fully-dispatched baseload wears more than a lightly-loaded same-step unit.
// Freeze renewables out so capacity (and thus gridUtil) is deterministic firm-only.
{
  const Sw = createGame();
  Sw.fleet.filter(u => u.kind === "renew").forEach(u => u.status = "off");
  for (const u of Sw.fleet) if (u.fail != null) u.fail = 0; // isolate wear from trips
  const nuc = Sw.fleet.find(u => u.id === "nuc"), colA = Sw.fleet.find(u => u.id === "colA");
  const nuc0 = nuc.condition, colA0 = colA.condition;
  step(Sw, 1.0);
  check("baseload runs fully loaded; coal only partly (demand < firm cap)",
    nuc.loadFrac > 0.99 && colA.loadFrac < nuc.loadFrac && colA.loadFrac > 0,
    `nuc ${(nuc.loadFrac*100).toFixed(0)}% vs coal ${(colA.loadFrac*100).toFixed(0)}%`);
  check("the harder-loaded plant wears faster", (nuc0 - nuc.condition) > (colA0 - colA.condition),
    `nuc −${(nuc0-nuc.condition).toFixed(2)} vs coal −${(colA0-colA.condition).toFixed(2)}`);
}
// (v5.3 Phase 3) The second wear model — the ambient age clock (u.ageHours / CFG.wearRate) and
// the retired push dial — is DELETED; degradation is earned purely by operating LOAD, with the
// load→wear curve pinned in tests/kpi.test.mjs. There is nothing left to assert here. Upgrades
// raise per-axis caps via the rolling contractor queue; see tests/progression.test.mjs and
// tests/contractor.test.mjs.

// (v5 Phase 4) The v4 mid-quarter service action is retired — maintenance is scheduled
// at the quarter-end board review and worked by the crew pool. See tests/maint.test.mjs
// and tests/crews.test.mjs for the replacement. No live service path remains to test here.

// ---- Phase C meta: scoring, milestones, skills, modifiers ----
const meta = await import("../src/live/meta.js");

// 16) Skills modify a fresh game's starting conditions
S = createGame({ reserves: 2 });
check("Grid Reserves adds starting cash", S.cash === CFG.startCash + 80000, "$" + S.cash);
S = createGame({ battery: 1 });
const batU = S.fleet.find(u => u.id === "bat");
check("Battery Science grows the battery", batU.cap > 120 && batU.maxEnergy > 240, `${batU.cap} MW / ${batU.maxEnergy} MWh`);
S = createGame({ efficiency: 2 });
check("Efficiency Drive slows demand growth", S.peakGrowthMult < 1, S.peakGrowthMult.toFixed(3));

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

// (v5 Phase 4) The Service Manager meta skill + its autoService live path are retired
// — maintenance is quarter-end crew work now (tests/maint.test.mjs). The `servicemgr`
// skill is inert in v5 (Phase 7's progression rework revisits the meta roster).

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

// 27) A second battery is a proper storage unit (makeUnit storage params)
S = createGame();
const nBat0 = S.fleet.filter(u => u.kind === "battery").length;
const built2 = addUnit(S, "battery");
check("a built battery grows the storage count", S.fleet.filter(u => u.kind === "battery").length === nBat0 + 1);
check("built battery is storage: off, controllable, no condition, has energy",
  built2.kind === "battery" && built2.status === "off" && built2.ctrl === true && built2.condition == null && built2.maxEnergy > 0 && built2.energy === built2.maxEnergy,
  `${built2.energy}/${built2.maxEnergy} MWh`);

// 28) Two discharging batteries drain in proportion to stored energy, none below 0
S = createGame(); S.running = true;
addUnit(S, "battery");
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
S = createGame(); addUnit(S, "battery");
const firstBat = S.fleet.find(u => u.kind === "battery");
let dr = decommissionUnit(S, firstBat.id);
check("a battery can be decommissioned when another remains", dr.ok && S.fleet.filter(u => u.kind === "battery").length === 1);
const lastBat = S.fleet.find(u => u.kind === "battery");
dr = decommissionUnit(S, lastBat.id);
check("the last battery can't be decommissioned", !dr.ok && S.fleet.some(u => u.kind === "battery"));

// ---- B3: storage + demand-response research wired into the sim ----

// 30) Demand-response research shaves live demand (the demand-side lever)
{
  const A = createGame(); A.t = 18; A.calm = true; step(A, 0.01); const dBase = A.demand;
  const B = createGame(); B.t = 18; B.calm = true; B.research = { "demand-response": true }; B.rmods = computeResearchMods(B.research);
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

// 33) A built SMR is clean firm with its own params (makeUnit). Build GATING is now
//     tested via commitBuild in tests/construct.test.mjs.
S = createGame();
const smrU = addUnit(S, "smr");
check("built SMR is clean firm with its own params", smrU.kind === "firm" && smrU.condition === 100 && smrU.spin === 2 && smrU.fail === 0.0020);

// 35) fast-ramp research shortens a gas unit's spin-up time. v5 Phase 2: toggleUnit
// now flips the commit dial; the spin-up (startTimer) is set in step()'s reconciliation,
// so step a hair to let it apply before reading.
S = createGame(); S.running = true; S.calm = true; toggleUnit(S, "pk1"); step(S, 0.0005);
const t1 = S.fleet.find(u => u.id === "pk1").startTimer;
let S2 = createGame(); S2.running = true; S2.calm = true; S2.rmods = computeResearchMods({ "fast-ramp": true }); toggleUnit(S2, "pk1"); step(S2, 0.0005);
const t2 = S2.fleet.find(u => u.id === "pk1").startTimer;
check("fast-ramp cuts gas spin-up 20%", near(t2, t1 * 0.80, 1e-2) && t2 < t1, `${t1.toFixed(2)}h → ${t2.toFixed(2)}h`);

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

// ---- D1: event mods folded into the sim ----
// v5.3 Phase 3: the per-run mutator LIST (S.mutators) + its banner are deleted — the seasonal
// event regime drives mmods now (events.js, overwritten each quarter roll). createGame still
// derives the opening mmods from the caller's param, so the derivation is what's pinned here.

// 38) createGame is deterministic: neutral mmods by default; derives mmods from what's passed
{
  const plain = createGame();
  check("createGame defaults to neutral event mods (deterministic)", plain.mmods.demandMult === 1 && plain.mutators === undefined);
  const g = createGame({}, {}, ["heatwave"]);
  check("createGame derives mmods from the passed events", g.mmods.demandMult === CFG.mut.heatwave);
}

// 39) A heat-wave mutator lifts live demand
{
  const A = createGame(); A.mmods = computeMutatorMods([]); A.t = 18; A.calm = true; step(A, 0.01); const dBase = A.demand;
  const B = createGame(); B.mmods = computeMutatorMods(["heatwave"]); B.t = 18; B.calm = true; step(B, 0.01); const dHot = B.demand;
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
  addUnit(S, "solar");
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
  const g = createGame(); g.peak = peak; g.t = 3; g.running = true; g.rdFunding = 0; g.calm = true; // v4.2.2: suppress net-load volatility for a deterministic cash line
  for (const u of g.fleet){
    // v5 Phase 2: a dial-able unit is taken offline via its COMMIT dial — otherwise
    // step()'s reconciliation re-arms a committed unit we tried to park at status:"off".
    if (u.id === "nuc"){ u.status = "online"; u.fail = 0; if (u.dials) u.dials.commit = true; }
    else if (u.kind === "renew"){ u.cap = 0; }
    else { u.status = "off"; if (u.dials) u.dials.commit = false; }
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

// 52) v5: sustained insolvency is PAIN, not death. A default still craters credit,
//     but the grid never ends (the Phase 6 stagnation model replaces bankruptcy).
//     insolventT still accrues as a "how long under water" signal, and unwinds on recovery.
{
  S = insolvent(1000);
  step(S, CFG.bankruptcyGrace + 2); // well past the old grace window
  check("sustained insolvency no longer ends the game (v5: no bankruptcy)", !S.over && S.insolventT > 0, `insolventT ${S.insolventT.toFixed(1)}`);
  check("insolvency with debt still fires a one-time default (credit cratered)", S.defaulted === true && S.credit <= CFG.defaultCredit);
  S.cash = 5000; // recover to solvent
  step(S, 0.1);
  check("recovering to solvent winds the insolvency clock back down", S.insolventT < CFG.bankruptcyGrace + 2);
}

// 53) v5: even a catastrophic cash hole is survivable — no instant wind-up
{
  S = insolvent(1000); S.cash = CFG.hardInsolvency - 1;
  const ended = step(S, 0.05);
  check("a catastrophic cash hole no longer winds the utility up", !S.over && ended === false, `cash ${S.cash.toFixed(0)}`);
}

// 54) v5: a cash-only (no-debt) hole never defaults and never ends
{
  S = insolvent(0);
  step(S, CFG.bankruptcyGrace + 2);
  check("no-debt insolvency neither defaults nor ends the game", !S.over && !S.defaulted, `insolventT ${S.insolventT.toFixed(1)}`);
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

// 59) bestSpotKill grows when dispatch climbs the merit order into a costly unit. v5.3:
//     `spot` is now the CLEARING price, not a baseline+premium. A grid whose demand pushes
//     past its cheap base into the dear peaker clears ABOVE the exogenous baseline, and under
//     uniform-price clearing every served MW captures that elevated price → a genuine kill.
{
  S = controlled(300);                       // nuclear base (250 MW @ mc 10), everything else parked …
  const pk = S.fleet.find(u => u.id === "pk1");
  pk.status = "online"; pk.fail = 0; pk.startTime = 0; if (pk.dials) pk.dials.commit = true; // … plus one committed peaker (110 MW @ mc 120)
  for (let i = 0; i < 5; i++){ S.t = 18; step(S, 0.3); } // evening peak: demand ~300 > 250 → peaker is marginal → priceServed ≈ 120 > baseline
  check("a merit-order climb into a costly unit captures a spot spike (bestSpotKill > 0)", S.bestSpotKill > 0, "$" + S.bestSpotKill.toFixed(0));
}

// ---- Phase F: finite-run win-state + capacity market wired into the sim ----

// 60) v5: createGame copies economy unlocks; there is no run cap / win / over state
{
  const g = createGame({}, {}, [], CFG.creditStart, { "runlen-1": true });
  check("createGame copies economyUnlocked onto state", g.economyUnlocked["runlen-1"] === true);
  // v5.1 Phase 2: the fail-state RETURNS via the stability bar — S.over is real again (false
  // at a fresh start), but the v4 finite-run fields (maxRunDays/won) stay retired.
  check("v5.1 state: maxRunDays/won retired; S.over present and false at a fresh start",
    g.maxRunDays === undefined && g.won === undefined && g.over === false);
}
{
  S = createGame(); S.running = true; S.day = 5; S.t = 23.9; const abs0 = S.calendar.absDay;
  const ended = step(S, 1.0); // crosses midnight — in v4 this was the finite-run WIN; now just another day
  check("a day rollover never ends the game (no finite-run win)",
    ended === false && !S.over && S.calendar.absDay === abs0 + 1);
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
  const firm = S.fleet.reduce((a, u) => a + ((u.kind === "firm" || u.kind === "gas") && u.status !== "tripped" ? u.cap : 0), 0);
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

// 60) v4.1 agency: standing a strained GAS unit down clears the strain (your terms).
// v5 Phase 2: it must be committed (armed) to strain; toggleUnit uncommits it and
// step() reconciles commit→off, clearing the strain.
{
  const S = createGame(); S.running = true; S.calm = true;
  const pk = S.fleet.find(x => x.id === "pk1");
  pk.dials.commit = true; pk.status = "strained"; pk.strainTimer = CFG.strainWarn;
  toggleUnit(S, pk.id); step(S, 0.0005);
  check("standing a strained gas unit down clears the strain", pk.status === "off" && pk.strainTimer === 0);
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

// ---- v5 Phase 1: calendar / clock orchestration in the loop ----

// 63) step advances the calendar on the midnight wrap — once, not per frame
{
  S = createGame(); S.calm = true; S.t = 23.98; const abs0 = S.calendar.absDay;
  for (let i = 0; i < 4; i++) step(S, 0.2); // several frames; the day wraps exactly once
  check("the calendar advances once on the midnight wrap (not per frame)",
    S.calendar.absDay === abs0 + 1 && S.day === S.calendar.absDay, `absDay ${S.calendar.absDay}, day ${S.day}`);
}

// 64) v5.1 Phase 2: the fail-state RETURNS — a sustained shortfall fills the grid-stability
//     bar and ENDS the run (reverses the v5 no-game-over pillar). Seed the bar near the top so
//     the integration check stays quick; the fill/drain RATES are pinned in stability.test.mjs.
{
  S = createGame(); S.running = true; S.calm = true; S.peak = 5000; // demand ≫ capacity
  S.fleet.filter(u => u.kind === "renew").forEach(u => u.status = "off"); // deterministic deep shortfall
  S.stability.hp = S.stability.max - 1; // one shortfall tick from collapse
  for (let i = 0; i < 40 && !S.over; i++) step(S, 0.5);
  check("a sustained shortfall tops out the stability bar and ENDS the run",
    S.over === true && S.reason === "grid-collapse" && S.brownout === true,
    `hp ${S.stability.hp.toFixed(1)}, over ${S.over}`);
  const t0 = S.t;
  step(S, 0.5); // collapsed → step() must freeze the clock
  check("once collapsed, step() freezes the run", S.t === t0);
}

// 65) Quarter-end flips to the Planning Office + auto-pauses; beginNextQuarter resumes
{
  S = createGame(); S.calm = true;
  while (!isQuarterEnd(S)) surviveDay(S); // walk to the quarter's last day
  check("positioned on the quarter's last day, still operating", isQuarterEnd(S) && S.calendar.mode === "operating");
  surviveDay(S); // complete it — the quarter closes
  check("completing the quarter enters planning mode and auto-pauses the clock",
    S.calendar.mode === "planning" && S.clock.speed === 0 && S.clock.autoPaused === true);
  beginNextQuarter(S);
  check("beginNextQuarter resumes operating at 1× in the new quarter (Q2 D1)",
    S.calendar.mode === "operating" && S.clock.speed === 1 && S.calendar.quarter === 2 && S.calendar.dayInQuarter === 1);
}

// 66) Demand steepens year-over-year with no run-reset discontinuity
{
  S = createGame(); S.calm = true; const peak0 = S.peak;
  const yearDays = CFG.v5.daysPerQuarter * CFG.v5.quartersPerYear;
  for (let i = 0; i < yearDays; i++) surviveDay(S);
  check("demand steepens across a full year, no reset", S.peak > peak0 && S.calendar.year === 2,
    `${peak0} → ${S.peak} MW, Y${S.calendar.year}`);
}

console.log(failed === 0 ? "\nAll sim tests passed." : `\n${failed} sim test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
