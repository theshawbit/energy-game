// Unit tests for v4 finance — the contracts portion (Phase B). No DOM.
// Run: `npm test`. Pins contract pricing, settlement (full + proportional fill,
// never exceeding served load), and daily expiry. Credit/debt arrive in Phase C.
import { CFG } from "../src/live/config.js";
import { contractPrice, expectedOutput, makeContract, settleContracts, expireContracts,
  gradeFor, creditRating, interestFor, debtCapacity, creditTick, triggerDefault, commitCreditStanding } from "../src/live/finance.js";

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

// ---- Phase C: credit, debt, interest, default ----

// 7) creditRating endpoints + monotonicity (better credit → lower rate, higher ceiling)
{
  const top = creditRating(100), bot = creditRating(0);
  check("rate at 100 = rateMin, at 0 = rateMax", near(top.rate, CFG.rateMin) && near(bot.rate, CFG.rateMax));
  check("ceiling at 100 = ceilingMax, at 0 = ceilingMin", top.ceiling === CFG.ceilingMax && bot.ceiling === CFG.ceilingMin);
  check("rate falls / ceiling rises as credit improves", creditRating(80).rate < creditRating(40).rate && creditRating(80).ceiling > creditRating(40).ceiling);
}

// 8) gradeFor buckets (display only)
check("gradeFor: 95→AAA, 70→A, 45→BB, 5→D", gradeFor(95) === "AAA" && gradeFor(70) === "A" && gradeFor(45) === "BB" && gradeFor(5) === "D");

// 9) interestFor is exact and scales with dtH (per game-DAY rate)
{
  const i = interestFor(100000, 0.05, 24); // a full game-day at 5%/day on $100k = $5000
  check("interestFor: a full day at 5% = 5% of debt", near(i, 5000), "$" + i);
  check("interestFor: half a day is half the interest", near(interestFor(100000, 0.05, 12), 2500));
  check("interestFor: no debt → no interest", interestFor(0, 0.05, 24) === 0);
}

// 10) debtCapacity = ceiling − debt, never negative
{
  const S = { credit: 100, debt: 50000 };
  check("debtCapacity = ceiling − debt", debtCapacity(S) === CFG.ceilingMax - 50000);
  check("debtCapacity never negative", debtCapacity({ credit: 0, debt: 10 }) === 0);
}

// 11) creditTick rebuilds on solvent days, stops at the cap, does nothing while insolvent
{
  const S = { cash: 100, credit: 70, creditCap: 100 };
  creditTick(S);
  check("solvent day rebuilds credit by creditRecoverPerDay", near(S.credit, 70 + CFG.creditRecoverPerDay));
  S.credit = 99.5; creditTick(S);
  check("credit rebuild clamps at the cap", S.credit === 100);
  const ins = { cash: -10, credit: 50, creditCap: 100 }; creditTick(ins);
  check("insolvent day does not rebuild credit", ins.credit === 50);
  const scarred = { cash: 100, credit: 54, creditCap: CFG.defaultCeil }; creditTick(scarred);
  check("post-default credit rebuild clamps at the lowered cap", scarred.credit === CFG.defaultCeil);
}

// 12) triggerDefault craters the standing and caps the ceiling, once
{
  const S = { credit: 75, creditCap: 100, defaulted: false, debt: 40000, day: 4, debtLedger: [] };
  triggerDefault(S);
  check("default craters credit to ≤ defaultCredit and caps the ceiling", S.defaulted && S.credit <= CFG.defaultCredit && S.creditCap === CFG.defaultCeil);
  check("default writes a ledger entry", S.debtLedger.some(e => e.type === "default"));
}

// 13) commitCreditStanding is the credit writer: default caps the carried standing at defaultFloor
{
  const clean = { credit: { standing: 70, best: 70, everDefaulted: false, defaults: 0, history: [] } };
  commitCreditStanding(clean, { credit: 88, defaulted: false });
  check("clean run writes the run's standing and raises best", clean.credit.standing === 88 && clean.credit.best === 88 && clean.credit.everDefaulted === false);
  // a defaulted run that clawed its credit back above defaultFloor is still capped there
  const bad = { credit: { standing: 70, best: 90, everDefaulted: false, defaults: 0, history: [] } };
  commitCreditStanding(bad, { credit: 60, defaulted: true });
  check("defaulted run caps carried standing at defaultFloor + marks the record", bad.credit.standing === CFG.defaultFloor && bad.credit.everDefaulted === true && bad.credit.defaults === 1);
  // but a run that ended worse than the floor writes the worse value (min, not clamp-up)
  const worse = { credit: { standing: 70, best: 90, everDefaulted: true, defaults: 1, history: [] } };
  commitCreditStanding(worse, { credit: 12, defaulted: true });
  check("defaulted run below the floor writes the lower value", worse.credit.standing === 12);
}

console.log(failed === 0 ? "\nAll finance tests passed." : `\n${failed} finance test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
