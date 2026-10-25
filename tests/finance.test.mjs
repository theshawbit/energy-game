// Unit tests for v4 finance — the contracts portion (Phase B). No DOM.
// Run: `npm test`. Pins contract pricing, settlement (full + proportional fill,
// never exceeding served load), and daily expiry. Credit/debt arrive in Phase C.
import { CFG } from "../src/live/config.js";
import { contractPrice, expectedOutput, makeContract, settleContracts, expireContracts } from "../src/live/finance.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// 1) contractPrice rises with term and is capped by hedgePriceCap
{
  const base = 100;
  const pShort = contractPrice(base, CFG.contractTermMin);
  const pLong = contractPrice(base, CFG.contractTermMax);
  check("longer term locks a better (higher) rate", pLong > pShort, `${pShort} → ${pLong}`);
  check("even a long term can't beat baseline×cap", contractPrice(base, 60) <= Math.round(base * CFG.hedgePriceCap),
    `$${contractPrice(base, 60)} ≤ $${Math.round(base * CFG.hedgePriceCap)}`);
}

// 2) expectedOutput sizes off the peak (a fraction, since mean shape < 1)
check("expectedOutput is a fraction of peak", expectedOutput(1000) > 500 && expectedOutput(1000) < 1000, expectedOutput(1000) + " MW");

// 3) settleContracts: fully covered → every committed MWh paid at its locked price
{
  const cs = [makeContract({ mw: 100, price: 50, term: 3, seq: 1 }), makeContract({ mw: 60, price: 70, term: 2, seq: 2 })];
  const r = settleContracts(cs, 500); // served ≫ committed → full delivery
  check("full fill: contractedMW = Σ mw", r.contractedMW === 160);
  check("full fill: revenue = Σ mw×price", near(r.contractRevenue, 100 * 50 + 60 * 70), "$" + r.contractRevenue);
  check("full fill: delivered = committed", near(r.deliveredContracted, 160));
}

// 4) settleContracts: short grid → proportional fill, delivered never exceeds served
{
  const cs = [makeContract({ mw: 100, price: 50, term: 3, seq: 1 }), makeContract({ mw: 100, price: 50, term: 3, seq: 2 })];
  const served = 120; // < 200 committed → fill = 0.6
  const r = settleContracts(cs, served);
  check("short fill: delivered equals served (fill proportional)", near(r.deliveredContracted, served), r.deliveredContracted + " MW");
  check("short fill: delivered never exceeds served", r.deliveredContracted <= served + 1e-9);
  check("short fill: revenue scales with the 0.6 fill", near(r.contractRevenue, 200 * 0.6 * 50), "$" + r.contractRevenue);
}

// 5) empty book → all zeros (so a contract-free run is pure spot)
{
  const r = settleContracts([], 500);
  check("empty book settles to zeros", r.contractedMW === 0 && r.contractRevenue === 0 && r.deliveredContracted === 0);
}

// 6) expireContracts: ages one day, drops the expired
{
  const S = { contracts: [
    makeContract({ mw: 50, price: 60, term: 1, seq: 1 }), // expires this day
    makeContract({ mw: 50, price: 60, term: 3, seq: 2 }), // survives
  ] };
  expireContracts(S);
  check("expireContracts drops a 1-day contract after a day", S.contracts.length === 1 && S.contracts[0].id === "ct-2", S.contracts.map(c => c.id).join(","));
  check("expireContracts decrements the survivor's remaining", S.contracts[0].remaining === 2, "remaining " + S.contracts[0].remaining);
  const empty = { contracts: [] };
  expireContracts(empty);
  check("expireContracts is safe on an empty book", empty.contracts.length === 0);
}

console.log(failed === 0 ? "\nAll finance tests passed." : `\n${failed} finance test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
