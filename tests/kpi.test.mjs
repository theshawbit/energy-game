// Unit tests for v5 Phase 3 — the four KPI axes + the degradation keystone
// (src/live/kpi.js) and its wiring into the sim. Wear is EARNED by operating style,
// never ambient; degradeKPIs is pure/RNG-free. Run: `npm test`.
import { freshKPIs, degradeKPIs, effectiveMax, heatRateMult, minStableLoad, revenueCoeffs } from "../src/live/kpi.js";
import { applyDials } from "../src/live/dispatch.js";
import { createGame, step, tripHazard, dailyStrainProb } from "../src/live/sim.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const realRandom = Math.random;
Math.random = () => 0.5;
function freshGame(){ const S = createGame(); S.calm = true; S.running = true; return S; }
const kpiUnit = (over = {}) => ({ cap: 100, kind: "firm", mc: 35, kpis: { ...freshKPIs(), ...over } });

// 1) Fresh fleet is all-100 on the four axes; renewables carry no kpis.
{
  const S = createGame();
  const dispatchables = S.fleet.filter(u => u.kind === "firm" || u.kind === "gas");
  const all100 = dispatchables.every(u => u.kpis && u.kpis.reliability === 100 && u.kpis.efficiency === 100 && u.kpis.output === 100 && u.kpis.flexibility === 100);
  check("fresh dispatchables are all-100 across the four axes", all100 && dispatchables.length > 0);
  check("renewables carry no kpis (exempt, like v4 condition==null)", S.fleet.filter(u => u.kind === "renew").every(u => u.kpis == null));
}

// 2) High load wears Reliability & Output (v5.3: at the intrinsic loadStress, no push dial),
//    not Efficiency/Flexibility.
{
  const u = kpiUnit();
  degradeKPIs(u, { loadFrac: 0.95 }, 24);
  check("sustained high load drops Reliability & Output", u.kpis.reliability < 98 && u.kpis.output < 99,
    `rel ${u.kpis.reliability.toFixed(1)} out ${u.kpis.output.toFixed(1)}`);
  check("…but leaves Efficiency & Flexibility ~untouched", u.kpis.efficiency > 99.9 && u.kpis.flexibility === 100);
}

// 3) Part-load erodes Efficiency; reliability/output barely move.
{
  const u = kpiUnit();
  degradeKPIs(u, { loadFrac: 0.2 }, 24);
  check("part-load erodes Efficiency", u.kpis.efficiency < 97, `eff ${u.kpis.efficiency.toFixed(1)}`);
  check("…reliability/output barely move at part-load", u.kpis.reliability > 99.9 && u.kpis.output > 99.9);
}

// 4) A START beats up Flexibility & nicks Reliability; efficiency/output steady. v5.3: the
//    band-ramp wear event is retired, so a start is the only cycling hit left.
{
  const u = kpiUnit();
  degradeKPIs(u, { loadFrac: 0.5, started: true }, 0.01);
  check("a start drops Flexibility and nicks Reliability", u.kpis.flexibility < 98 && u.kpis.reliability < 100,
    `flex ${u.kpis.flexibility.toFixed(1)} rel ${u.kpis.reliability.toFixed(1)}`);
  check("…efficiency/output steady under a start", u.kpis.efficiency > 99.9 && u.kpis.output > 99.9);
}

// 5) Output KPI derates capacity, and applyDials offers the derated max.
{
  const u = kpiUnit({ output: 50 });
  const em = effectiveMax(u);
  check("effectiveMax at output 50 is below cap by the configured factor", em < u.cap && near(em, 100 * (CFG.v5.kpiCurve.outputMin + (1 - CFG.v5.kpiCurve.outputMin) * 0.5)), `${em} MW`);
  u.dials = { commit: true };
  check("applyDials offers the Output-derated max (full available capacity)", near(applyDials(u).max, em), `offered ${applyDials(u).max}`);
}

// 6) Efficiency KPI re-prices — heatRateMult rises as efficiency falls, and step
//    charges more fuel for a low-efficiency fleet (engine clearing untouched).
{
  check("heatRateMult rises as efficiency falls", heatRateMult(100) === 1 && heatRateMult(50) > 1 && heatRateMult(0) > heatRateMult(50));
  const A = freshGame(), B = freshGame();
  for (const u of B.fleet) if (u.kpis) u.kpis.efficiency = 40; // a thoroughly inefficient fleet
  for (let i = 0; i < 6; i++){ step(A, 0.3); step(B, 0.3); }
  check("a low-efficiency fleet drains more cash (fuel surcharge)", B.cash < A.cash - 1, `A $${Math.round(A.cash)} vs B $${Math.round(B.cash)}`);
}

// 7) Reliability gates trips — the v4 trip curve, now keyed to the reliability axis.
{
  const immune = tripHazard({ kpis: { reliability: 100 }, fail: CFG.tripRefFail }, 1);
  const mid = tripHazard({ kpis: { reliability: 50 }, fail: CFG.tripRefFail }, 1);
  const expectMid = -Math.log(1 - dailyStrainProb(50)) / CFG.secondsPerDay; // ratio 1 at fail==tripRefFail
  check("a 100-reliability plant is near-immune to trips", immune === 0);
  check("mid-band reliability is punishing and matches the v4 curve", mid > 0 && near(mid, expectMid, 1e-9), `${mid.toExponential(2)}`);
}

// 8) Flexibility sets agility — ramp speed + min stable load stay pure functions. v5.3: the
//    output band is retired, so applyDials no longer applies a min-stable-load floor.
{
  check("min stable load falls to 0 at full flexibility", minStableLoad(100) === 0 && minStableLoad(0) > 0);
  const stiff = { cap: 100, kind: "firm", kpis: { ...freshKPIs(), flexibility: 0 }, dials: { commit: true } };
  const supple = { cap: 100, kind: "firm", kpis: freshKPIs(), dials: { commit: true } };
  check("no band floor — a committed unit offers from min 0 whatever its flexibility",
    applyDials(stiff).min === 0 && applyDials(supple).min === 0, `stiff min ${applyDials(stiff).min}`);
}

// 9) revenueCoeffs is the clean 1:1 mapping Phase 6 bets on.
{
  const max = revenueCoeffs(freshKPIs());
  check("all-100 KPIs → every coefficient at max (1.0)", max.floor === 1 && max.margin === 1 && max.volume === 1 && max.capture === 1);
  const dropped = revenueCoeffs({ ...freshKPIs(), output: 50 });
  check("dropping one axis lowers exactly its one coefficient", dropped.volume === 0.5 && dropped.floor === 1 && dropped.margin === 1 && dropped.capture === 1);
}

// 10) A neutral run preserves KPIs — wear is earned by style, never ambient.
{
  const S = freshGame(); // defaults: baseload committed at full capacity, no starts (v5.3: no push/band dials)
  for (let i = 0; i < 120; i++) step(S, 0.5); // ~a day of calm running
  const nuc = S.fleet.find(u => u.id === "nuc");
  check("a calm neutral day barely moves the KPIs",
    nuc.kpis.reliability > 93 && nuc.kpis.efficiency > 93 && nuc.kpis.output > 93 && nuc.kpis.flexibility === 100,
    `rel ${nuc.kpis.reliability.toFixed(1)} eff ${nuc.kpis.efficiency.toFixed(1)} out ${nuc.kpis.output.toFixed(1)} flex ${nuc.kpis.flexibility}`);
}

Math.random = realRandom;
console.log(failed === 0 ? "\nAll kpi tests passed." : `\n${failed} kpi test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
