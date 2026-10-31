// Unit tests for PROGRESSION (v5 Phase 7, reworked by v5.1 Phase 3). Run: `npm test`.
// Pins the reworked growth model: four parallel 9-tier cash ladders per plant (tiers drive the
// per-axis caps via axisTierValue; geometric cost; tier 9 is the cap at ~2–3× base), the KPI
// effect curves reading past 100, maintenance restoring toward the raised cap, and the SURVIVING
// ⚡ perk lane (roster / research-branch / growth-tier-gated automation). The instant cash
// specialization + RP family-ceiling lanes are retired (see contractor.test.mjs for the queue).
import { createGame } from "../src/live/sim.js";
import { CFG } from "../src/live/config.js";
import {
  upgradeCost, canUpgrade, axisTierValue, upgradeTierMax,
  PERKS, unlockPerk, canUnlockPerk, automationTier, isAutomationUnlocked,
  autoMaintenancePlan,
} from "../src/live/progression.js";
import { queueUpgrade } from "../src/live/contractor.js";
import { outputFactor, heatRateMult, effectiveMax, degradeKPIs } from "../src/live/kpi.js";
import { queueMaint, tickMaint } from "../src/live/maint.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const up = CFG.v5_1.upgrade;
const thermal = S => S.fleet.find(u => u.tiers);

// 1) createGame seeds per-axis tiers at 0 (caps at base) on thermal plants only
{
  const S = createGame();
  const t = thermal(S);
  check("thermal plants seed all four tiers at 0", t && ["reliability","efficiency","output","flexibility"].every(a => t.tiers[a] === 0), JSON.stringify(t.tiers));
  check("thermal plants seed all four caps at base", t && ["reliability","efficiency","output","flexibility"].every(a => t.caps[a] === up.base));
  const renew = S.fleet.find(u => u.kind === "renew");
  check("renewables carry no tiers (no upgrades)", !renew || !renew.tiers);
  check("createGame seeds empty perks + contractor queue", JSON.stringify(S.perks) === "{}" && Array.isArray(S.contractor) && S.contractor.length === 0);
}

// 2) The ladder: nine tiers, geometric cost, tier 9 ≈ 2–3× base
{
  const S = createGame();
  const u = thermal(S);
  check("axisTierValue(0) === base", axisTierValue(0) === up.base);
  const topMult = axisTierValue(upgradeTierMax) / up.base;
  check("tier 9 lands at ~2–3× base", topMult >= 2 && topMult <= 3, `${topMult.toFixed(2)}×`);
  check("first tier costs costBase", near(upgradeCost(u, "output"), up.costBase), `$${upgradeCost(u, "output")}`);
  u.tiers.output = 1;
  check("the next tier costs costGrowth× more", near(upgradeCost(u, "output"), up.costBase * up.costGrowth), `$${upgradeCost(u, "output")}`);
  u.tiers.output = upgradeTierMax;
  check("cost is Infinity at the cap (tier 9)", upgradeCost(u, "output") === Infinity);
  check("canUpgrade false at the cap", !canUpgrade(S, u.id, "output"));
}

// 3) canUpgrade mirrors affordability, the cap, and an in-flight queue
{
  const S = createGame(); S.cash = 1e9;
  const u = thermal(S);
  check("canUpgrade true when affordable + untiered + unqueued", canUpgrade(S, u.id, "output"));
  const S2 = createGame(); S2.cash = 10;
  const u2 = thermal(S2);
  check("canUpgrade false when short on cash", !canUpgrade(S2, u2.id, "output"));
}

// 4) KPI effect curves read PAST 100 (a raised tier is a real edge), degrade clamps to the cap
{
  check("outputFactor > 1 above 100", outputFactor(120) > 1 && outputFactor(100) === 1, `${outputFactor(120).toFixed(3)}`);
  check("heatRateMult < 1 above 100 (cheaper fuel)", heatRateMult(120) < 1 && heatRateMult(100) === 1, `${heatRateMult(120).toFixed(3)}`);
  check("the tier-9 cap is readable by the curves (heatRateMult stays positive)", heatRateMult(axisTierValue(upgradeTierMax)) > 0, `${heatRateMult(axisTierValue(upgradeTierMax)).toFixed(3)}`);
  const S = createGame(); const u = thermal(S);
  u.caps.output = 130; u.kpis.output = 130;
  check("effectiveMax exceeds nameplate for an upgraded plant", effectiveMax(u) > u.cap, `${Math.round(effectiveMax(u))} vs ${u.cap}`);
  degradeKPIs(u, { loadFrac: 1, push: 1 }, 0.1);   // a wear tick
  check("degrade clamps to the raised cap, not 100", u.kpis.output > 100 && u.kpis.output <= 130, `output ${u.kpis.output.toFixed(2)}`);
}

// 5) Maintenance restores toward the RAISED cap, not a flat 100 (cap→restore seam intact)
{
  const S = createGame(); S.cash = 1e9;
  const u = thermal(S);
  u.caps.output = 130; u.kpis.output = 95;          // upgraded, worn a little below the raised cap
  const crew = S.crews.find(c => !c.assignment);
  const job = queueMaint(S, u.id, "output", crew.id);
  check("a rolling maintenance job queues + books the plant offline", !!job && u.maintDown);
  for (let i = 0; i < 60 && S.maintQueue.length; i++) tickMaint(S, 24); // age it to completion
  check("restore climbs past 100 toward the raised cap", u.kpis.output > 100 && u.kpis.output <= 130, `output ${u.kpis.output.toFixed(1)}`);
}

// 6) Perks survive: ⚡ spend, roster bump, research-branch unlock; automation gated by growth tier
{
  const S = createGame(); S.zap = 100;
  const z0 = S.zap, rc0 = S.rosterCap;
  check("unlockPerk(roster) spends ⚡ and raises the roster ceiling",
    unlockPerk(S, "roster") && S.zap === z0 - PERKS.roster.cost && S.rosterCap === rc0 + 1);
  check("buying the same perk twice is refused", !unlockPerk(S, "roster"));
  check("research-branch perk flips the research gate",
    unlockPerk(S, "advgen") && S.researchUnlocked.advgen === true);

  const F = createGame(); F.zap = 100;
  check("fresh grid is automation tier 0", automationTier(F) === 0);
  check("auto-maint (tier 2) is locked on a fresh grid", !isAutomationUnlocked(F, "autoMaint") && !canUnlockPerk(F, "autoMaint"));
  check("unlockPerk refuses a growth-locked automation perk even with ⚡", !unlockPerk(F, "autoMaint") && !F.perks.autoMaint);
  F.calendar.year = 3;
  while (F.fleet.length < 15) F.fleet.push({ id: "x" + F.fleet.length, kind: "firm", cap: 10 });
  check("a big, mature grid reaches automation tier 2", automationTier(F) === 2);
  check("auto-maint unlockable once the grid has grown into it", canUnlockPerk(F, "autoMaint") && unlockPerk(F, "autoMaint"));
}

// 7) Automation behaviours — auto-maintenance plans within the review; dispatch assist opens
//    unpinned bands and never touches a pinned plant (and is RNG-free)
{
  const A = createGame(); A.cash = 1e9;
  check("autoMaintenancePlan is a no-op without the perk", autoMaintenancePlan(A).length === 0);
  A.perks.autoMaint = true;
  const u = thermal(A); u.kpis.output = 55;
  const planned = autoMaintenancePlan(A);
  check("autoMaintenancePlan queues the neediest plant", planned.length >= 1 && A.maintQueue.some(j => j.unitId === u.id) && u.maintDown);
}

console.log(failed === 0 ? "\nAll progression tests passed." : `\n${failed} progression test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
