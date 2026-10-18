// Unit tests for the in-run research tree (v3, PR A1). No DOM. Run: `npm test`.
// Pins RP gating, the effect-modifier math, and that researching spends RP and
// is idempotent — so Phase B can build the four branches on a stable core.
import { researchById, canResearch, doResearch, computeResearchMods } from "../src/live/research.js";
import { createGame, step } from "../src/live/sim.js";
import { setRdFunding, researchNode, upgradeUnit } from "../src/live/actions.js";
import { CFG, UPGRADE } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 1) Neutral mods when nothing is researched
const n0 = computeResearchMods({});
check("no research → neutral mods", n0.wearMult === 1 && n0.upgradeCapBonus === 0 && n0.smrUnlocked === false);

// 2) Each node's effect lands in the mods
check("buff-wear → −15% wear", computeResearchMods({ "buff-wear": true }).wearMult === 0.85);
check("amp-upgrades → +10% upgrade cap bonus", computeResearchMods({ "amp-upgrades": true }).upgradeCapBonus === 0.10);
check("unlock-smr → SMR flag set", computeResearchMods({ "unlock-smr": true }).smrUnlocked === true);

// 3) canResearch gates on RP
let S = createGame();
S.rp = 0;
check("can't research with no RP", !canResearch(S, "buff-wear"));
S.rp = 1000;
check("can research with enough RP", canResearch(S, "buff-wear"));
check("unknown node is never researchable", !canResearch(S, "no-such-node"));

// 4) doResearch spends RP, records the node, recomputes rmods, and is idempotent
S = createGame(); S.rp = 1000;
const cost = researchById("buff-wear").rpCost;
let r = doResearch(S, "buff-wear");
check("research spends exactly the node cost", r.ok && near(1000 - S.rp, cost, 1e-9), `−${1000 - S.rp} RP`);
check("research records the node and updates rmods", S.research["buff-wear"] === true && S.rmods.wearMult === 0.85);
const rpAfter = S.rp;
r = doResearch(S, "buff-wear");
check("researching the same node twice is refused (no double-spend)", !r.ok && S.rp === rpAfter);

// 5) RP accrues from R&D funding (net cash also carries revenue; assert RP side)
S = createGame(); S.running = true;
setRdFunding(S, 5000);         // $5k/game-hour
const rp0 = S.rp;
step(S, 1.0);                  // 24/secondsPerDay game-hours elapse
check("funding R&D converts cash into RP", S.rp > rp0, `+${(S.rp - rp0).toFixed(1)} RP`);

// 6) RP accrual matches the configured rate (deterministic: funded $ × rpPerDollar)
S = createGame(); S.running = true;
setRdFunding(S, 10000);
const dtH = 24 / CFG.secondsPerDay;
step(S, 1.0);
check("RP ≈ funded $ × rpPerDollar", near(S.rp, 10000 * dtH * CFG.rpPerDollar, 1e-6), `${S.rp.toFixed(3)} RP`);

// 8) funding is clamped to the configured max and to ≥ 0
S = createGame();
setRdFunding(S, 1e9);
check("funding clamps to rdFundingMax", S.rdFunding === CFG.rdFundingMax, "$" + S.rdFunding);
setRdFunding(S, -50);
check("funding clamps to ≥ 0", S.rdFunding === 0);

// 9) can't fund more RP than the cash on hand
S = createGame(); S.running = true; S.cash = 100;
setRdFunding(S, CFG.rdFundingMax);
step(S, 1.0);
check("near-broke grid can't overdraw cash into RP", S.cash >= 0, "$" + Math.round(S.cash));

// 10) research is blocked once the run is over
S = createGame(); S.rp = 1e6; S.over = true;
r = researchNode(S, "buff-wear");
check("research refused after the run ends", !r.ok && !S.research["buff-wear"]);

// 11) the upgrade-amp node actually increases the capacity gain of a Mk upgrade
S = createGame(); S.cash = 1e9;
const baseUnit = S.fleet.find(u => u.id === "colA");
const capBefore = baseUnit.cap;
upgradeUnit(S, "colA"); // no research yet
const plainGain = baseUnit.cap / capBefore;
S = createGame(); S.cash = 1e9; S.research = { "amp-upgrades": true };
S.rmods = computeResearchMods(S.research);
const unit2 = S.fleet.find(u => u.id === "colA");
const cap2 = unit2.cap;
upgradeUnit(S, "colA");
const ampedGain = unit2.cap / cap2;
check("Modular Upgrades amplifies the Mk capacity gain", ampedGain > plainGain,
  `${plainGain.toFixed(3)}× → ${ampedGain.toFixed(3)}× (base ${UPGRADE.capMult}×)`);

// 12) researched wear buff slows condition loss vs. an unresearched run
S = createGame(); const uA = S.fleet.find(u => u.id === "nuc"); uA.fail = 0;
step(S, 3.0);
const wornPlain = 100 - uA.condition;
S = createGame(); S.research = { "buff-wear": true }; S.rmods = computeResearchMods(S.research);
const uB = S.fleet.find(u => u.id === "nuc"); uB.fail = 0;
step(S, 3.0);
const wornBuffed = 100 - uB.condition;
check("Condition Monitoring slows wear", wornBuffed < wornPlain, `${wornPlain.toFixed(2)}% → ${wornBuffed.toFixed(2)}% lost`);

// ---- B3: storage + demand-response research effects ----

// 13) Storage nodes buff the battery mods
check("storage-power → +30% discharge power", computeResearchMods({ "storage-power": true }).battCapMult === 1.30);
check("storage-depth → +50% energy depth", computeResearchMods({ "storage-depth": true }).battEnergyMult === 1.50);
check("storage-recharge → +50% recharge rate", computeResearchMods({ "storage-recharge": true }).battRechargeMult === 1.50);

// 14) Demand-response shave is tiered, smart-grid deepening it
check("demand-response → 6% shave", computeResearchMods({ "demand-response": true }).demandShave === 0.06);
check("smart-grid → 12% shave", computeResearchMods({ "demand-response": true, "smart-grid": true }).demandShave === 0.12);

// 15) smart-grid is gated behind demand-response (the first real prereq)
S = createGame(); S.rp = 1e6;
check("smart-grid blocked without its prereq", !canResearch(S, "smart-grid"));
let pr = doResearch(S, "smart-grid");
check("doResearch refuses smart-grid until demand-response is done", !pr.ok && !S.research["smart-grid"]);
doResearch(S, "demand-response");
check("smart-grid researchable once demand-response is owned", canResearch(S, "smart-grid"));

// ---- B4: transmission mods + generation unlocks ----

// 16) Transmission nodes buff running costs / ramp
check("grid-efficiency → −15% spin cost", computeResearchMods({ "grid-efficiency": true }).spinMult === 0.85);
check("fast-ramp → −20% peaker spin-up", computeResearchMods({ "fast-ramp": true }).startTimeMult === 0.80);

// 17) Generation unlock flags are independent; one CCS node covers coal & gas
{
  const m = computeResearchMods({ "unlock-geo": true, "unlock-ccs": true });
  check("unlock-geo/ccs set their flags, smr stays locked", m.geoUnlocked && m.ccsUnlocked && !m.smrUnlocked);
}

console.log(failed === 0 ? "\nAll research tests passed." : `\n${failed} research test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
