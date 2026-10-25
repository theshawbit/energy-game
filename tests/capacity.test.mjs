// Unit tests for the v4 capacity market (Phase F). No DOM. Run: `npm test`.
// Pins the availability payment, the breach shortfall/penalty, and the
// tightness-weighted, deterministic call roll.
import { CFG } from "../src/live/config.js";
import { capacityPayment, capacityShortfall, capacityPenalty, rollCapacityCall } from "../src/live/capacity.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

const ob = { reserveMW: 200, pricePerMW: CFG.capacity.pricePerMW, termDays: 4, daysLeft: 4, calledToday: false };

// 1) payment is linear in reserve and time
check("payment = reserveMW × pricePerMW × dtDays", near(capacityPayment(ob, 0.5), 200 * CFG.capacity.pricePerMW * 0.5));
check("no obligation → no payment", capacityPayment(null, 1) === 0);

// 2) shortfall & penalty: zero when covered, proportional when short
check("no shortfall when deliverable ≥ reserve", capacityShortfall(ob, 250) === 0 && capacityPenalty(ob, 250) === 0);
check("shortfall = reserve − deliverable when short", capacityShortfall(ob, 150) === 50);
check("penalty = shortfall × penaltyPerMw", near(capacityPenalty(ob, 150), 50 * CFG.capacity.penaltyPerMw), "$" + capacityPenalty(ob, 150));

// 3) rollCapacityCall: deterministic under a fixed rng, likelier when tight
{
  const tight = { capacityObligation: ob, demand: 1000, capacity: 1000 };   // rm 0 → max tightness
  const comfy = { capacityObligation: ob, demand: 1000, capacity: 2000 };   // rm 1 → no tightness bump
  // a fixed rng just under the comfy base prob but above nothing
  const fixed = v => () => v;
  check("no call when rng is above the (tight) probability", rollCapacityCall(tight, fixed(0.99)) === false);
  check("a low rng draw always calls", rollCapacityCall(comfy, fixed(0.0)) === true);
  // tightness raises the probability: a draw between the two probs calls when tight, not when comfy
  const mid = CFG.capacity.callBaseProb + 0.1; // above base, within the tightness bump
  check("the same draw calls on a tight grid but not a comfy one", rollCapacityCall(tight, fixed(mid)) === true && rollCapacityCall(comfy, fixed(mid)) === false,
    `prob mid ${mid}`);
  check("no obligation → never called", rollCapacityCall({ capacityObligation: null }, fixed(0)) === false);
}

console.log(failed === 0 ? "\nAll capacity tests passed." : `\n${failed} capacity test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
