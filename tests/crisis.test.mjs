// Unit tests for v5 Phase 8 CRISIS toolkit (no DOM). Run: `npm test`.
// Pins the mid-quarter escape hatch: load-shed dodges the shortfall at an earned,
// scaled cost cheaper than the blackout it averts; demand response is gated strictly
// on prep and cools down; a telegraphed trip auto-pauses so the tools are reachable.
import { createGame, step, totalCapacity } from "../src/live/sim.js";
import { loadShedTiers, triggerLoadShed, canDemandRespond, triggerDemandResponse } from "../src/live/crisis.js";
import { computeResearchMods } from "../src/live/research.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}

// Determinism: pin the global noise stream and suppress the live jitter/spike layer.
Math.random = () => 0.5;

// Build a modest, tier-coverable shortfall: settle the fleet, then set the peak just
// above capacity at the demand-shape peak hour (18:00 → 1.00) so residential shed clears it.
function shortGrid(overCap = 1.15){
  const S = createGame(); S.calm = true; S.running = true;
  step(S, 0.05);                              // settle unit states (commit dials arm)
  const cap = totalCapacity(S);
  S.peak = Math.round(cap * overCap);
  S.t = 18;                                   // DEMAND_SHAPE peak → demand ≈ peak
  return { S, cap };
}

// 1) Load-shed dodges the shortfall (and applies the standing hit)
{
  const { S } = shortGrid(1.15);
  step(S, 0.02);
  const brownBefore = S.brownout;
  const sat0 = S.satisfaction;
  const r = triggerLoadShed(S, "residential");
  S.t = 18; step(S, 0.02);
  check("without a shed the grid browns out", brownBefore === true);
  check("load-shed cuts the tier and clears the shortfall", r.ok && S.brownout === false, `shed ${r.mw} MW`);
  check("load-shed takes the satisfaction hit now", S.satisfaction < sat0, `${sat0.toFixed(1)} → ${S.satisfaction.toFixed(1)}`);
  check("the fine is booked into the quarter log (settles at the review)", S.quarterLog.shedFines > 0, `$${S.quarterLog.shedFines}`);
}

// 2) Shed is controlled, not free — and a shed that averts the blackout costs less than
//    the blackout it prevents (the unserved-load cost it dodges exceeds the fine it pays).
//    Compared over exactly the shed window (~shedWindow gh), demand held at the peak hour.
{
  const WIN = CFG.v5.crisis.shedWindow;                 // run each arm for one shed window
  const dt = 0.5, dtH = 24 * dt / CFG.secondsPerDay, steps = Math.round(WIN / dtH);
  const runArm = shed => {
    const { S } = shortGrid(1.15);
    S.t = 18; step(S, 0.02);                             // land the shortfall
    const sat0 = S.satisfaction;
    const log0 = S.quarterLog.shortfallMWh;
    if (shed) triggerLoadShed(S, "residential");
    for (let i = 0; i < steps; i++){ S.t = 18; step(S, dt); }
    return { unservedMWh: S.quarterLog.shortfallMWh - log0, satDrop: sat0 - S.satisfaction, fine: S.quarterLog.shedFines };
  };
  const A = runArm(false), B = runArm(true);
  const avertedCost = (A.unservedMWh - B.unservedMWh) * CFG.v5_3.market.voll; // v5.3: forced unserved now costs VOLL, not the retired unservedPenalty
  check("shedding averts unserved load", A.unservedMWh > B.unservedMWh, `${A.unservedMWh.toFixed(0)} → ${B.unservedMWh.toFixed(0)} MWh`);
  check("the averted blackout cost exceeds the shed's fine (a genuine lesser evil)",
    avertedCost > B.fine, `$${Math.round(avertedCost)} averted vs $${B.fine} fine`);
  check("the blackout costs more satisfaction than the controlled shed", A.satDrop > B.satDrop, `${A.satDrop.toFixed(1)} vs ${B.satDrop.toFixed(1)}`);
  check("a bigger tier carries a bigger penalty (scales with the tier)",
    CFG.v5.crisis.shedTiers[2].satHit > CFG.v5.crisis.shedTiers[0].satHit && CFG.v5.crisis.shedTiers[2].fine > CFG.v5.crisis.shedTiers[0].fine);
}

// 3) Demand response gates on prep, fires once, then cools down
{
  const S = createGame(); S.calm = true; S.running = true;
  check("DR refused without the research branch", !canDemandRespond(S));
  const r0 = triggerDemandResponse(S);
  check("triggerDemandResponse is a no-op unprepared", !r0.ok && !S.dr);

  S.rmods = computeResearchMods({ "demand-response": true });   // secure the branch ahead
  check("DR available once the branch is secured", canDemandRespond(S));
  const r1 = triggerDemandResponse(S);
  check("DR fires: shave active + cooldown started", r1.ok && S.dr.shave === CFG.v5.crisis.drShave && S.drCooldown > 0);
  check("DR can't be spammed (unavailable while active / cooling down)", !canDemandRespond(S));
  // window ends but the cooldown still holds → still refused (one-shot per window)
  S.dr = null;
  check("still on cooldown after the window ends", S.drCooldown > 0 && !canDemandRespond(S));

  // the tiers surface resolved MW for the UI
  const tiers = loadShedTiers({ ...S, demand: 1000 });
  check("loadShedTiers resolves each tier's MW from load", tiers.length === 3 && tiers[0].mw === Math.round(CFG.v5.crisis.shedTiers[0].frac * 1000));
}

// 4) A telegraphed trip auto-pauses so the tools are reachable
{
  const S = createGame(); S.calm = true; S.running = true;
  step(S, 0.05);                              // settle
  const u = S.fleet.find(x => x.id === "nuc"); // a firm plant on the hazard path
  u.kpis.reliability = 5; u.fail = 1e9;        // make a strain certain this tick
  S.clock.autoPaused = false;
  step(S, 1.0);
  check("a straining plant enters the telegraphed-trip state", u.status === "strained", u.status);
  check("the telegraphed trip auto-pauses the clock", S.clock.autoPaused === true);
}

console.log(failed === 0 ? "\nAll crisis tests passed." : `\n${failed} crisis test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
