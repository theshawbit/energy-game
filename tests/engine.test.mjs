// Unit tests for the economic engine. Run: `npm test` (or `node tests/engine.test.mjs`).
// These lock the verified merit-order dispatch behaviour so the Phase A refactor
// can't silently break the physics or arithmetic.
import { simulateDay } from "../src/engine.js";
import { ORDER } from "../src/constants.js";

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

console.log(failed === 0 ? "\nAll engine tests passed." : `\n${failed} test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
