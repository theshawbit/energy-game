// ============================================================
// ECONOMY INTEGRITY (v5.3 Phase 1) — the keystone suite. These lock the invariants
// that kill the "go dark" exploit: under the old economy, revenue priced served load
// at hr.price, which jumps to PRICE_CAP the instant ANY load goes unserved — so being
// short by a sliver paid the cap on the WHOLE peak, making "serve ε less than demand"
// the optimum. Phase 1 fixes this with an additive, CONTINUOUS priceServed (the marginal
// cost of the last SERVED unit) that NEVER jumps to the cap, so covering strictly dominates
// going short for any VOLL ≥ 0. VOLL is then a FAIRNESS knob, not the dominance guarantee.
//
// Run: `npm test` (or `node tests/economy-integrity.test.mjs`).
// ============================================================
import { dispatchHour, marginalCost } from "../src/engine.js";
import { PRICE_CAP } from "../src/constants.js";
import { CFG } from "../src/live/config.js";
import { scoreQuarter, mintCurrency } from "../src/live/scorecard.js";
import { settleQuarter, freshQuarterLog, freshEconomy } from "../src/live/verdict.js";
import { createGame, step } from "../src/live/sim.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// A fleet that forces a merit-order climb: cheap nuclear (mc 10) then a dear peaker (mc 120).
// Available total = 200 MW, so demand at/over 200 is the shortfall boundary.
const AVAIL = { nuclear: 100, peaker: 100 };
const MC_PEAK = marginalCost("peaker"); // 120 — the clearing price once the peaker is marginal

// ============================================================
// 1) THE KEYSTONE — priceServed is continuous across the shortfall boundary; the cap
//    only ever lands on the scarcity SIGNAL (hr.price), never on what served load is paid.
// ============================================================

// 1a) priceServed never becomes the cap, even deep into a shortfall.
{
  const covered = dispatchHour(AVAIL, 150);   // demand < avail → fully served
  const short   = dispatchHour(AVAIL, 400);   // demand ≫ avail → half dark
  check("priceServed = marginal cost of last served unit when covered", near(covered.priceServed, MC_PEAK), `$${covered.priceServed}`);
  check("priceServed STAYS the marginal cost under a deep shortfall (never the cap)", near(short.priceServed, MC_PEAK), `$${short.priceServed}`);
  check("the cap lands only on the scarcity signal hr.price", near(short.price, PRICE_CAP) && near(covered.price, MC_PEAK), `short $${short.price} / covered $${covered.price}`);
}

// 1b) Continuity at the boundary: covering the last sliver vs leaving it dark gives the
//     SAME priceServed (the marginal served unit is unchanged) — no discontinuity to farm.
{
  const eps = 1e-4;
  const atCap   = dispatchHour(AVAIL, 200);          // exactly served to the last MW
  const justOver = dispatchHour(AVAIL, 200 + eps);   // short by eps
  check("priceServed is continuous across D = available (covered == short-by-ε)", near(atCap.priceServed, justOver.priceServed), `$${atCap.priceServed} == $${justOver.priceServed}`);
  check("but the signal hr.price jumps to the cap the instant any load is lost", near(atCap.price, MC_PEAK) && near(justOver.price, PRICE_CAP));
}

// 1c) NO WINDFALL / DOMINANCE — at a FIXED demand that exceeds capacity, serving one more MW
//     (a touch more available iron) earns priceServed MORE and dodges VOLL — strictly better.
//     Under the OLD code, shorting instead paid the cap on the WHOLE served block (served×hr.price),
//     a windfall that made going dark the optimum. priceServed kills that: served revenue is honest.
{
  const D = 250, eps = 1e-4;                             // demand well over the 200 MW available
  const short = dispatchHour(AVAIL, D);                  // serves 200, 50 dark
  const cover = dispatchHour({ nuclear: 100, peaker: 100 + eps }, D); // one sliver more iron → serves 200+ε
  const revShort = short.served * short.priceServed;
  const revCover = cover.served * cover.priceServed;
  const oldExploit = short.served * short.price;         // what the OLD basis paid: the cap × the whole block
  check("serving one more MW earns priceServed more (dominance holds even at VOLL 0)", revCover > revShort, `cover $${revCover.toFixed(2)} > short $${revShort.toFixed(2)}`);
  check("served revenue is honest — never the cap × the block", near(revShort, 200 * MC_PEAK, 1e-3), `$${revShort.toFixed(2)}`);
  check("the OLD hr.price basis WOULD have paid the cap windfall (regression guard)", oldExploit > revShort * 2, `old $${oldExploit.toFixed(0)} vs honest $${revShort.toFixed(0)}`);
}

// ============================================================
// 2) VOLL — forced unserved costs cash with NO deadband, and VOLL is read from the
//    SEPARATE live knob (not constants.VOLL), bounded by vollQuarterCap.
// ============================================================
{
  const m = CFG.v5_3.market;
  check("live VOLL is configured and positive (the fairness knob)", m.voll > 0, `$${m.voll}/MWh`);
  check("a per-quarter VOLL cap bounds the exposure", m.vollQuarterCap > 0, `$${m.vollQuarterCap}`);
}

// 2a) A sliver of forced unserved still costs cash — there is no 0.5 MW deadband.
{
  // Pin the global RNG BEFORE createGame (it draws at construction) for determinism.
  const orig = Math.random; Math.random = () => 0.5;
  try {
    const S = createGame();
    S.peak = 10000; S.t = 18; S.running = true;   // demand ≫ capacity → a guaranteed forced shortfall
    const cash0 = S.cash;
    step(S, 0.02);
    check("a forced shortfall costs cash (VOLL, no deadband)", S.cash < cash0, `Δ $${(S.cash - cash0).toFixed(0)}`);
    check("the shortfall is logged as unservedCost on the quarter", (S.quarterLog.unservedCost || 0) > 0, `$${(S.quarterLog.unservedCost || 0).toFixed(0)}`);
  } finally { Math.random = orig; }
}

// ============================================================
// 3) SCARCE MINT — a losing or dark quarter mints 0 ⚡, however the other metrics score.
// ============================================================
function quarterLog({ served = 1000, shortfall = 0, floorPay = 0, swingPay = 0, opCost = 0, interest = 0, unservedCost = 0 } = {}) {
  const q = freshQuarterLog();
  q.servedMWh = served; q.shortfallMWh = shortfall;
  q.floorPay = floorPay; q.swingPay = swingPay;
  q.opCost = opCost; q.interest = interest; q.unservedCost = unservedCost;
  q.hours = 2160; q.reserveAccum = 0.3 * q.hours; q.priceAccum = 40 * q.hours;
  return q;
}
{
  const good = scoreQuarter({ quarterLog: quarterLog({ served: 1000, floorPay: 60000, swingPay: 40000, opCost: 20000 }) });
  check("a profitable, fully-served quarter mints ⚡", mintCurrency(good) > 0, `${mintCurrency(good)} ⚡`);

  const losing = scoreQuarter({ quarterLog: quarterLog({ served: 1000, floorPay: 20000, swingPay: 10000, opCost: 90000 }) });
  check("a LOSING quarter (true PnL ≤ 0) mints 0 ⚡", mintCurrency(losing) === 0, `${mintCurrency(losing)} ⚡`);

  const dark = scoreQuarter({ quarterLog: quarterLog({ served: 900, shortfall: 100, floorPay: 60000, swingPay: 40000, opCost: 20000 }) });
  check("a DARK quarter (serve rate < floor) mints 0 ⚡ despite profit", mintCurrency(dark) === 0, `serve ${(900 / 1000 * 100).toFixed(0)}% → ${mintCurrency(dark)} ⚡`);
}

// ============================================================
// 4) HONEST PnL — the board PnL subtracts EVERY cost the quarter incurred, so it can't be
//    inflated by omitting opCost/interest/VOLL; scorecard + verdict agree on the figure.
// ============================================================
{
  const q = quarterLog({ served: 1000, floorPay: 100000, swingPay: 50000, opCost: 30000, interest: 5000, unservedCost: 8000 });
  const expected = Math.round(q.floorPay + q.swingPay - q.opCost - q.wages - q.overruns - q.breachFines - q.shedFines - q.interest - q.unservedCost);
  const S = { quarterLog: q, economy: freshEconomy(), calendar: { year: 1, quarter: 2 } };
  const v = settleQuarter(S);
  check("board PnL = revenue − opCost − wages − overruns − fines − interest − VOLL", v.pnl === expected, `$${v.pnl} == $${expected}`);
  check("omitting a cost would OVERSTATE PnL (the bug this closes)", expected < q.floorPay + q.swingPay, `$${expected} < gross $${q.floorPay + q.swingPay}`);
}

console.log(failed === 0 ? "\nAll economy-integrity tests passed." : `\n${failed} economy-integrity test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
