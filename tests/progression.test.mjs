// Unit tests for v5 Phase 7 PROGRESSION (no DOM). Run: `npm test`.
// Pins the three growth lanes — cash specialization (per-axis caps + steepening cost),
// RP ceiling-raises (hard-ceiling lift, capped at axisMax), and ⚡ perks with the
// growth-tier automation gate — plus the two automation behaviours and the cross-module
// seams (KPI curves read past 100; maintenance restores toward the raised cap).
import { createGame } from "../src/live/sim.js";
import { CFG } from "../src/live/config.js";
import {
  upgradeCost, applyUpgrade, canUpgrade, axisHardCeiling,
  ceilingCost, raiseCeiling, canRaiseCeiling,
  PERKS, unlockPerk, canUnlockPerk, automationTier, isAutomationUnlocked,
  autoMaintenancePlan, dispatchAssist,
} from "../src/live/progression.js";
import { outputFactor, heatRateMult, effectiveMax, degradeKPIs } from "../src/live/kpi.js";
import { resolveQuarterTasks, scheduleTask } from "../src/live/maint.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const up = CFG.v5.upgrade;
const thermal = S => S.fleet.find(u => u.caps);

// 1) createGame seeds per-axis caps at base on thermal plants only
{
  const S = createGame();
  const t = thermal(S);
  check("thermal plants seed all four caps at base", t && ["reliability","efficiency","output","flexibility"].every(a => t.caps[a] === up.base), JSON.stringify(t.caps));
  const renew = S.fleet.find(u => u.kind === "renew");
  check("renewables carry no caps (no specialization)", !renew || !renew.caps);
  check("createGame seeds empty capCeil + perks", JSON.stringify(S.capCeil) === "{}" && JSON.stringify(S.perks) === "{}");
}

// 2) upgradeCost steepens with each step taken on an axis
{
  const S = createGame();
  const u = thermal(S);
  const c0 = upgradeCost(S, u, "output");
  check("first axis upgrade costs cost0", near(c0, up.cost0), `$${c0}`);
  u.caps.output += up.step;                       // simulate one step taken
  const c1 = upgradeCost(S, u, "output");
  check("the next step costs costGrowth× more", near(c1, up.cost0 * up.costGrowth), `$${c0} → $${c1}`);
}

// 3) applyUpgrade raises the cap, bumps the live KPI, deducts cash; refused when short
{
  const S = createGame(); S.cash = 1e9;
  const u = thermal(S);
  const cost = upgradeCost(S, u, "output"), cash0 = S.cash;
  const ok = applyUpgrade(S, u.id, "output");
  check("applyUpgrade raises the cap one step", ok && u.caps.output === up.base + up.step);
  check("applyUpgrade bumps the live KPI toward the new cap", u.kpis.output === up.base + up.step, `output ${u.kpis.output}`);
  check("applyUpgrade deducts exactly the cost", near(cash0 - S.cash, cost), `−$${cash0 - S.cash}`);

  const S2 = createGame(); S2.cash = 10;           // can't afford
  const u2 = thermal(S2);
  check("applyUpgrade refused with too little cash", !applyUpgrade(S2, u2.id, "output") && u2.caps.output === up.base);
  check("canUpgrade mirrors affordability", !canUpgrade(S2, u2.id, "output"));
}

// 4) Cash alone reaches baseCeiling, then is refused (RP is the only way past)
{
  const S = createGame(); S.cash = 1e9;
  const u = thermal(S);
  const ceil = axisHardCeiling(S, u.tech, "reliability");
  check("hard ceiling with no research is baseCeiling", ceil === up.baseCeiling, `${ceil}`);
  let guard = 0;
  while (u.caps.reliability < ceil && guard++ < 50) applyUpgrade(S, u.id, "reliability");
  check("cash upgrades reach baseCeiling", u.caps.reliability === up.baseCeiling);
  check("a further cash upgrade is refused at the ceiling", !applyUpgrade(S, u.id, "reliability") && u.caps.reliability === up.baseCeiling);
}

// 5) KPI effect curves read PAST 100 (specialization is a real edge), and degrade clamps
//    to the per-axis cap rather than snapping back to 100
{
  check("outputFactor > 1 above 100", outputFactor(120) > 1 && outputFactor(100) === 1, `${outputFactor(120).toFixed(3)}`);
  check("heatRateMult < 1 above 100 (cheaper fuel)", heatRateMult(120) < 1 && heatRateMult(100) === 1, `${heatRateMult(120).toFixed(3)}`);
  const S = createGame(); const u = thermal(S);
  u.caps.output = 130; u.kpis.output = 130;
  check("effectiveMax exceeds nameplate for a specialized plant", effectiveMax(u) > u.cap, `${Math.round(effectiveMax(u))} vs ${u.cap}`);
  degradeKPIs(u, { loadFrac: 1, push: 1 }, 0.1);   // a wear tick
  check("degrade clamps to the raised cap, not 100", u.kpis.output > 100 && u.kpis.output <= 130, `output ${u.kpis.output.toFixed(2)}`);
}

// 6) raiseCeiling: RP lifts the family hard ceiling by ceilingStep up to axisMax; steepens
{
  const S = createGame(); S.rp = 1e6;
  const u = thermal(S);
  const c0 = ceilingCost(S, u.tech, "output");
  check("first ceiling raise costs ceilingCost0", near(c0, up.ceilingCost0), `${c0} RP`);
  const rp0 = S.rp;
  check("raiseCeiling succeeds and spends RP", raiseCeiling(S, u.tech, "output") && near(rp0 - S.rp, c0));
  check("hard ceiling lifted by ceilingStep", axisHardCeiling(S, u.tech, "output") === up.baseCeiling + up.ceilingStep);
  check("next raise costs ceilingGrowth× more", ceilingCost(S, u.tech, "output") === Math.round(up.ceilingCost0 * up.ceilingGrowth), `${ceilingCost(S, u.tech, "output")} RP`);
  // climb to axisMax, then refuse
  let guard = 0;
  while (canRaiseCeiling(S, u.tech, "output") && guard++ < 50) raiseCeiling(S, u.tech, "output");
  check("ceiling stops at axisMax", axisHardCeiling(S, u.tech, "output") === up.axisMax, `${axisHardCeiling(S, u.tech, "output")}`);
  check("raiseCeiling refused at axisMax", !raiseCeiling(S, u.tech, "output"));
  const S2 = createGame(); S2.rp = 1;               // no RP
  check("raiseCeiling refused with too little RP", !raiseCeiling(S2, thermal(S2).tech, "output"));
}

// 7) Maintenance restores toward the RAISED cap, not a flat 100
{
  const S = createGame(); S.cash = 1e9; S.calendar.mode = "planning";
  const u = thermal(S);
  u.caps.output = 130; u.kpis.output = 95;          // specialized, worn a little below the raised cap
  const crew = S.crews.find(c => !c.assignment);
  const t = scheduleTask(S, u.id, "output", crew.id);
  check("a maintenance task schedules in planning mode", !!t && u.maintDown);
  t.quartersLeft = 1;                               // make it resolve on the next rollover
  resolveQuarterTasks(S);
  check("restore climbs past 100 toward the raised cap", u.kpis.output > 100 && u.kpis.output <= 130, `output ${u.kpis.output.toFixed(1)}`);
}

// 8) Perks: ⚡ spend, roster bump, research-branch unlock; automation gated by growth tier
{
  const S = createGame(); S.zap = 100;
  const z0 = S.zap, rc0 = S.rosterCap;
  check("unlockPerk(roster) spends ⚡ and raises the roster ceiling",
    unlockPerk(S, "roster") && S.zap === z0 - PERKS.roster.cost && S.rosterCap === rc0 + 1);
  check("buying the same perk twice is refused", !unlockPerk(S, "roster"));
  check("research-branch perk flips the research gate",
    unlockPerk(S, "advgen") && S.researchUnlocked.advgen === true);

  // automation gate: a fresh grid (small fleet, year 1) sits at tier 0
  const F = createGame(); F.zap = 100;
  check("fresh grid is automation tier 0", automationTier(F) === 0);
  check("auto-maint (tier 2) is locked on a fresh grid", !isAutomationUnlocked(F, "autoMaint") && !canUnlockPerk(F, "autoMaint"));
  check("unlockPerk refuses a growth-locked automation perk even with ⚡", !unlockPerk(F, "autoMaint") && !F.perks.autoMaint);
  // grow the grid into tier 2 (fleet ≥ 15 AND year ≥ 3 per CFG.v5.perks.tiers)
  F.calendar.year = 3;
  while (F.fleet.length < 15) F.fleet.push({ id: "x" + F.fleet.length, kind: "firm", cap: 10 });
  check("a big, mature grid reaches automation tier 2", automationTier(F) === 2);
  check("auto-maint unlockable once the grid has grown into it", canUnlockPerk(F, "autoMaint") && unlockPerk(F, "autoMaint"));
}

// 9) Automation behaviours — auto-maintenance plans within the review; dispatch assist
//    opens unpinned bands and never touches a pinned plant (and is RNG-free)
{
  // auto-maintenance: no-op without the perk
  const A = createGame(); A.cash = 1e9; A.calendar.mode = "planning";
  check("autoMaintenancePlan is a no-op without the perk", autoMaintenancePlan(A).length === 0);
  // with the perk: a worn plant + a free crew → a scheduled task
  A.perks.autoMaint = true;
  const u = thermal(A); u.kpis.output = 55;          // a clear deficit on one axis
  const planned = autoMaintenancePlan(A);
  check("autoMaintenancePlan schedules the neediest plant", planned.length >= 1 && A.tasks.some(t => t.unitId === u.id) && u.maintDown);

  // dispatch assist: opens an unpinned committed thermal band to its legal max, skips pinned
  const D = createGame(); D.perks.dispatchAssist = true;
  const firm = D.fleet.filter(x => (x.kind === "firm" || x.kind === "gas") && x.dials && x.dials.commit);
  check("there are committed thermal plants to assist", firm.length >= 1);
  const a = firm[0], b = firm[1] || firm[0];
  a.dials.bandMax = 1; a.pin = true;                 // pinned → must be left alone
  b.dials.bandMax = 1; b.pin = false;                // unpinned → opened to effectiveMax
  const n = dispatchAssist(D);
  check("pinned plant's band is untouched", a.dials.bandMax === 1);
  check("unpinned plant's band opens to effectiveMax", near(b.dials.bandMax, effectiveMax(b)) && n >= 1, `bandMax ${Math.round(b.dials.bandMax)}`);
  // determinism: a second pass changes nothing further
  const b2 = b.dials.bandMax; dispatchAssist(D);
  check("dispatchAssist is deterministic (idempotent on a steady fleet)", b.dials.bandMax === b2);
}

console.log(failed === 0 ? "\nAll progression tests passed." : `\n${failed} progression test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
