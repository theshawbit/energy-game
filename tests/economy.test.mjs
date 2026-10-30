// Unit tests for v5 Phase 6 — the hybrid economy's two income surfaces: the regulated
// capacity FLOOR (availability pay on held reserve, keyed to Reliability) and the market
// SWING (spot PnL on pushed MW, scaled by Output/Flexibility capture quality; Efficiency
// is charged on the fuel-cost side, not the swing scale — no double-count). Held reserve
// earns the floor, pushed MW earns the swing, and the two never double-count. A shortfall
// is still never a windfall. Deterministic (pinned Math.random where a step runs). `npm test`.
import { floorEarn } from "../src/live/capacity.js";
import { swingCoeff, swingEarn, spotPrice, reserveMargin } from "../src/live/market.js";
import { applyDials } from "../src/live/dispatch.js";
import { freshKPIs } from "../src/live/kpi.js";
import { makeUnit, CFG } from "../src/live/config.js";
import { createGame, step } from "../src/live/sim.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// 1) Floor pays for readiness, keyed to Reliability.
{
  check("floor = reserveMW × rate × reliability fraction",
    approx(floorEarn(100, 100, 6), 600) && approx(floorEarn(100, 50, 6), 300),
    `${floorEarn(100, 100, 6)} / ${floorEarn(100, 50, 6)}`);
  check("a high-reliability fleet earns the full floor; a worn one less",
    floorEarn(100, 100, 6) > floorEarn(100, 60, 6) && floorEarn(100, 60, 6) > floorEarn(100, 20, 6));
  check("no held reserve → no floor", floorEarn(0, 100, 6) === 0 && floorEarn(-5, 100, 6) === 0);
}

// 2) Swing pays for pushed MW, scaled by the swing-side KPI coeffs.
{
  check("a fresh fleet captures the full swing (coeff 1 → no v4 regression)",
    swingCoeff(freshKPIs()) === 1 && approx(swingEarn(100, 50, 1), 5000));
  const worn = { reliability: 100, efficiency: 40, output: 60, flexibility: 50 };
  check("a degraded fleet captures less swing (coeff < 1)",
    swingCoeff(worn) < 1 && swingEarn(100, 50, swingCoeff(worn)) < swingEarn(100, 50, 1),
    `coeff ${swingCoeff(worn).toFixed(3)}`);
  check("a renewable / battery (no KPIs) captures full swing", swingCoeff(null) === 1 && swingCoeff(undefined) === 1);
  check("Reliability does NOT feed the swing (it feeds the floor)",
    swingCoeff({ reliability: 0, efficiency: 100, output: 100, flexibility: 100 }) === 1);
}

// 3) Reserve-hold trades swing for floor — the Phase 2 dial's economic meaning.
{
  const u = makeUnit("peaker", 1, 1); // gas, kpis fresh, dials present
  u.dials.commit = true; u.dials.bandMin = 0; u.dials.bandMax = u.cap;
  u.dials.reserveHold = 0;
  const lo = applyDials(u);
  u.dials.reserveHold = 0.5;
  const hi = applyDials(u);
  check("raising reserveHold raises held MW (floor-eligible) and lowers offered max (swing-eligible)",
    hi.held > lo.held && hi.max < lo.max, `held ${lo.held}→${hi.held}, max ${lo.max}→${hi.max}`);
  const rel = u.kpis.reliability, rate = CFG.v5.econ.floorRateStart, spot = 50;
  const floorLo = floorEarn(lo.held, rel, rate), floorHi = floorEarn(hi.held, rel, rate);
  const swingLo = swingEarn(lo.max, spot, swingCoeff(u.kpis)), swingHi = swingEarn(hi.max, spot, swingCoeff(u.kpis));
  check("so earnings shift from swing toward floor as the dial rises",
    floorHi > floorLo && swingHi < swingLo);
}

// 4) A shortfall is never a windfall.
{
  check("swing earns on served MW only — a negative/zero residual earns nothing",
    swingEarn(0, 9999, 1) === 0 && swingEarn(-200, 9999, 1) === 0);
  // the spot per-MWh plateaus at a shortfall (reserve margin ≤ 0), so a deeper hole
  // never lifts the price — the engine-protection keystone the swing rides on.
  const tight = spotPrice({ baseline: 40, reserveMargin: reserveMargin(90, 100) });
  const deeper = spotPrice({ baseline: 40, reserveMargin: reserveMargin(50, 100) });
  check("a deeper shortfall never lifts per-MWh spot (plateau)", deeper <= tight + 1e-9, `${tight} / ${deeper}`);
}

// 5) Integration — the floor accrues to cash + the quarter log; a fresh fleet's swing
//    is unchanged from v4 (coeff 1). Deterministic via a pinned RNG + S.calm.
{
  const realRandom = Math.random; Math.random = () => 0.5;
  try {
    const S = createGame(); S.calm = true;
    const gas = S.fleet.find(u => u.kind === "gas");
    gas.status = "online"; gas.dials.commit = true; gas.dials.bandMin = 0; gas.dials.bandMax = gas.cap; gas.dials.reserveHold = 0.5;
    const cash0 = S.cash;
    step(S, 0.1);
    check("holding reserve pays the floor (cash + quarterLog.floorPay both rise)",
      S.quarterLog.floorPay > 0 && S.floorPay > 0, `floorPay/h ${S.floorPay.toFixed(1)}`);
    check("the quarter log accrues served energy + a KPI weight",
      S.quarterLog.servedMWh > 0 && S.quarterLog.kpiWeight > 0);
    check("cash moved (the economy is live)", S.cash !== cash0);
  } finally { Math.random = realRandom; }
}

console.log(failed === 0 ? "\nAll economy tests passed." : `\n${failed} economy test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
