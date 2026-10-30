// Unit tests for v5.1 Phase 3 CONTRACTOR QUEUE (no DOM). Run: `npm test`.
// Pins the rolling upgrade queue: queuing deducts cash once and spawns one job; the tier (and
// the raised cap) lands only after the lead time (you pay to WAIT, not to HAVE); the queue runs
// on its OWN labor (never the maintenance crew pool); caps raise the restorable ceiling without
// granting decay immunity; and the whole thing is pure/deterministic.
import { createGame } from "../src/live/sim.js";
import { CFG } from "../src/live/config.js";
import { queueUpgrade, tickContractor, contractorLoad } from "../src/live/contractor.js";
import { upgradeCost, axisTierValue, canUpgrade } from "../src/live/progression.js";
import { degradeKPIs } from "../src/live/kpi.js";

// deterministic createGame (freshWeather draws Math.random)
Math.random = () => 0.5;

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const up = CFG.v5_1.upgrade;
const thermal = S => S.fleet.find(u => u.tiers);
const tickDays = (S, days) => { for (let i = 0; i < days; i++) tickContractor(S, 24); };

// 1) Nine tiers, steepening cost; tier 9 is the cap; nine tiers ~2–3× the start.
{
  const S = createGame(); S.cash = 1e12;
  const u = thermal(S);
  const costs = [];
  for (let t = 0; t < up.tierMax; t++){ u.tiers.output = t; costs.push(upgradeCost(u, "output")); }
  const geometric = costs.every((c, i) => i === 0 || near(c, costs[i - 1] * up.costGrowth, 1)); // ±1 for per-tier rounding
  check("upgradeCost rises geometrically per tier", geometric, costs.map(c => Math.round(c)).join(","));
  u.tiers.output = up.tierMax;
  check("tier 9 is the cap (canUpgrade false, cost Infinity)", !canUpgrade(S, u.id, "output") && upgradeCost(u, "output") === Infinity);
  const topMult = axisTierValue(up.tierMax) / up.base;
  check("nine tiers lift the cap to ~2–3× the start", topMult >= 2 && topMult <= 3, `${topMult.toFixed(2)}×`);
}

// 2) Queue deducts cash once + spawns one job; a second queue for the same axis is refused.
{
  const S = createGame(); S.cash = 1e9;
  const u = thermal(S);
  const cost = upgradeCost(u, "reliability"), cash0 = S.cash;
  const job = queueUpgrade(S, u.id, "reliability");
  check("queueUpgrade returns a job with the right toTier + leadDays",
    job && job.toTier === 1 && job.daysLeft === up.leadDays && job.axis === "reliability");
  check("it deducts exactly the cost once", near(cash0 - S.cash, cost), `−$${cash0 - S.cash}`);
  check("exactly one job is in flight", contractorLoad(S) === 1);
  const dup = queueUpgrade(S, u.id, "reliability");
  check("a second queue for the same axis is refused", dup === null && contractorLoad(S) === 1);
  check("the tier has NOT applied yet (still waiting)", u.tiers.reliability === 0 && u.caps.reliability === up.base);
}

// 3) Rolling completion applies the tier + raises the cap; before completion nothing changes.
{
  const S = createGame(); S.cash = 1e9;
  const u = thermal(S);
  queueUpgrade(S, u.id, "output");
  tickDays(S, up.leadDays - 1);
  check("before the lead time elapses the cap is unchanged", u.tiers.output === 0 && u.caps.output === up.base);
  check("the job is still in flight", contractorLoad(S) === 1);
  tickDays(S, 1); // crosses the lead time
  check("on completion the tier applies", u.tiers.output === 1);
  check("the cap raises to the tier value", u.caps.output === axisTierValue(1), `cap ${u.caps.output}`);
  check("the completed job leaves the queue", contractorLoad(S) === 0);
}

// 4) Separate labor — a fully-booked crew pool never slows or blocks an upgrade.
{
  const S = createGame(); S.cash = 1e9;
  const u = thermal(S);
  S.crews.forEach(c => c.assignment = { busy: true }); // every crew booked
  const crewsBefore = JSON.stringify(S.crews);
  const job = queueUpgrade(S, u.id, "flexibility");
  check("an upgrade queues with every crew booked", !!job && contractorLoad(S) === 1);
  const d0 = job.daysLeft;
  tickContractor(S, 24);
  check("the upgrade progresses despite a full crew pool", job.daysLeft < d0, `${d0} → ${job.daysLeft}`);
  check("tickContractor never touches S.crews", JSON.stringify(S.crews) === crewsBefore);
}

// 5) Caps gate KPIs, not decay immunity — a raised cap can still be worn below.
{
  const S = createGame(); S.cash = 1e9;
  const u = thermal(S);
  queueUpgrade(S, u.id, "output");
  tickDays(S, up.leadDays);
  const cap = u.caps.output;
  check("the upgrade raised the restorable ceiling", cap === axisTierValue(1) && cap > up.base);
  u.kpis.output = cap;                                   // sitting at the new cap
  for (let i = 0; i < 40; i++) degradeKPIs(u, { loadFrac: 1, push: 1 }, 0.2); // sustained hard push
  check("degradation still pulls the live KPI below the raised cap", u.kpis.output < cap, `kpi ${u.kpis.output.toFixed(1)} < cap ${cap}`);
}

// 6) Determinism / purity — identical inputs → identical jobs + caps.
{
  const run = () => {
    Math.random = () => 0.5;
    const S = createGame(); S.cash = 1e9;
    const u = thermal(S);
    queueUpgrade(S, u.id, "output");
    queueUpgrade(S, u.id, "efficiency");
    tickDays(S, up.leadDays);
    return { tiers: JSON.stringify(u.tiers), caps: JSON.stringify(u.caps), load: contractorLoad(S) };
  };
  const a = run(), b = run();
  check("identical inputs → identical tiers + caps + queue", JSON.stringify(a) === JSON.stringify(b));
}

console.log(failed === 0 ? "\nAll contractor tests passed." : `\n${failed} contractor test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
