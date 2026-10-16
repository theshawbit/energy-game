// Unit tests for the economic engine. Run: `npm test` (or `node tests/engine.test.mjs`).
// These lock the verified merit-order dispatch behaviour so the Phase A refactor
// can't silently break the physics or arithmetic.
import { simulateDay, dispatchHour, marginalCost } from "../src/engine.js";
import { ORDER, PRICE_CAP } from "../src/constants.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 1) Legacy coal+gas, 400 MW peak, average weather
let r = simulateDay({ solar: 0, wind: 0, battery: 0, nuclear: 0, coal: 250, ccgt: 150, peaker: 0 }, 400, { sun: 1, wind: 1 });
check("legacy reliability ≈ 98.9%", near(r.reliability * 100, 98.88, 0.1), (r.reliability * 100).toFixed(2) + "%");
check("legacy CO₂ ≈ 806 kg/MWh", near(r.co2, 806, 2), r.co2.toFixed(0));
check("legacy roughly break-even", near(r.profit / 1e6, -9.4, 1), "$" + (r.profit / 1e6).toFixed(1) + "M");

// 2) Clean mix — reliable, cheap, low-carbon, profitable
r = simulateDay({ solar: 400, wind: 300, battery: 100, nuclear: 0, coal: 0, ccgt: 200, peaker: 50 }, 400, { sun: 1, wind: 1 });
check("clean mix 100% reliable", near(r.reliability, 1, 1e-6));
check("clean mix low carbon (<100)", r.co2 < 100, r.co2.toFixed(0) + " kg/MWh");
check("clean mix profitable", r.profit > 0, "$" + (r.profit / 1e6).toFixed(1) + "M");

// 3) Energy conservation — supply never exceeds demand in any hour, across weather
let balanceOk = true;
for (const w of [{ sun: 1, wind: 1 }, { sun: 0.7, wind: 0.6 }, { sun: 1.05, wind: 1.3 }]) {
  const rr = simulateDay({ solar: 300, wind: 200, battery: 80, nuclear: 100, coal: 100, ccgt: 150, peaker: 50 }, 450, w);
  rr.stackSeries.forEach(s => {
    const tot = ORDER.reduce((a, t) => a + s[t], 0) + s.unserved;
    if (tot - s._demand > 0.01 || rr.reliability > 1.0001) balanceOk = false;
  });
}
check("energy conserved (supply ≤ demand every hour)", balanceOk);

// 4) Carbon price re-sorts the merit order (coal → gas switching)
const fleet = { solar: 0, wind: 0, battery: 0, nuclear: 0, coal: 200, ccgt: 200, peaker: 50 };
const lowC = simulateDay(fleet, 350, { sun: 1, wind: 1 }, 0);
const highC = simulateDay(fleet, 350, { sun: 1, wind: 1 }, 100);
check("carbon pricing cuts emissions (gas displaces coal)", highC.co2 < lowC.co2 - 50,
  `${lowC.co2.toFixed(0)} → ${highC.co2.toFixed(0)} kg/MWh`);

// ---- dispatchHour: the per-hour merit-order primitive the real-time loop uses ----

// 5) Free renewables alone set a $0 clearing price and serve the load
let h = dispatchHour({ solar: 200, wind: 100 }, 150);
check("renewables-only clears at $0", h.price === 0, "$" + h.price);
check("renewables-only fully served", near(h.served, 150, 1e-9) && h.unserved === 0);
check("renewables-only zero emissions", h.emissions === 0);

// 6) Clearing price is the marginal (last, most expensive) unit dispatched
h = dispatchHour({ nuclear: 100, coal: 100 }, 150);
check("marginal unit sets price (coal on top of nuclear → $35)", near(h.price, 35, 1e-9), "$" + h.price);
check("cheaper inframarginal unit runs full", near(h.stack.nuclear, 100, 1e-9));

// 7) An unneeded expensive plant left online does NOT raise the price
h = dispatchHour({ nuclear: 200, peaker: 100 }, 150);
check("idle peaker doesn't set price (nuclear marginal → $10)", near(h.price, 10, 1e-9), "$" + h.price);
check("unneeded peaker dispatches 0 MW", h.stack.peaker === 0);

// 8) Carbon price lifts the clearing price when fossil is marginal
h = dispatchHour({ nuclear: 100, coal: 100 }, 150, 50); // $50/t carbon
check("carbon lifts marginal price (coal $35 + 0.95·50)", near(h.price, marginalCost("coal", 50), 1e-9), "$" + h.price.toFixed(1));

// 9) Carbon re-sorts the merit order: gas displaces coal as the cheaper pick
const need = { coal: 100, ccgt: 100 }; // only ~80 MW needed — one of them is marginal
const lo = dispatchHour(need, 80, 0);    // coal $35 < gas $55 → coal runs
const hi = dispatchHour(need, 80, 200);  // heavy carbon flips gas ahead of coal
check("carbon flips dispatch coal → gas", lo.stack.coal > 0 && lo.stack.ccgt === 0 && hi.stack.ccgt > 0 && hi.stack.coal === 0,
  `lo: coal ${lo.stack.coal|0}/gas ${lo.stack.ccgt|0} · hi: coal ${hi.stack.coal|0}/gas ${hi.stack.ccgt|0}`);

// 10) Scarcity: demand above available capacity → price cap, surplus unserved, lost load unsold
h = dispatchHour({ nuclear: 100 }, 150);
check("scarcity hits the price cap", h.price === PRICE_CAP, "$" + h.price);
check("scarcity leaves 50 MW unserved", near(h.unserved, 50, 1e-9) && near(h.served, 100, 1e-9));

// 11) simulateDay is exactly a sum of dispatchHour over the representative day
{
  const fleet = { solar: 300, wind: 200, battery: 80, nuclear: 100, coal: 100, ccgt: 150, peaker: 50 };
  const r = simulateDay(fleet, 450, { sun: 1, wind: 1 }, 20);
  const handRev = r.priceSeries.reduce((a, p, i) => {
    const s = r.stackSeries[i];
    const servedH = ORDER.reduce((x, t) => x + s[t], 0);
    return a + p * servedH;
  }, 0) * 365;
  check("simulateDay revenue = Σ price·served over hours", near(handRev, r.grossRev, 1), "$" + (handRev / 1e6).toFixed(2) + "M vs $" + (r.grossRev / 1e6).toFixed(2) + "M");
}

console.log(failed === 0 ? "\nAll engine tests passed." : `\n${failed} test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
