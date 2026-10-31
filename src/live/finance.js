// ============================================================
// FINANCE (v4, Phase B — contracts portion) — term contracts that lock a block
// of load at a fixed price, hedging against spot swings. Pure: no DOM, no sim
// import, mutates only what the caller passes (expireContracts takes S by the
// same convention as the sim's own helpers). Credit/debt land here in Phase C.
//
// A contract commits MW of the player's served load at a locked $/MWh for a term
// of game-days. Longer locks earn a better rate (hedgeTermBonus). At settlement
// the committed volume is delivered FIRST, at the locked price, filled
// proportionally when the grid is short — and it reads ONLY served load, never
// unserved, so a shortfall is never a contract windfall (same guarantee as spot).
// ============================================================
import { CFG } from "./config.js";
import { meanShape } from "./market.js";
import { PRICE_CAP } from "../constants.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The locked price a contract of `termDays` earns off a given baseline: a slight
// discount to baseline (hedgeBaseFactor) that improves with term, capped so a
// long lock can't beat baseline by more than hedgePriceCap.
export function contractPrice(baseline, termDays){
  // v5.3 (C4): clamp the locked price to the live band [spotFloor, PRICE_CAP] so a contract can never
  // price above the ceiling the spot itself respects (the old unbounded drift could push it past).
  const p = Math.round(baseline * clamp(CFG.hedgeBaseFactor + CFG.hedgeTermBonus * termDays, 0.5, CFG.hedgePriceCap));
  return clamp(p, CFG.spotFloor, PRICE_CAP);
}

// Expected average output for a peak — sizes the hedge dial so hedging "half"
// commits roughly half of a typical day's served energy.
export function expectedOutput(peak){ return Math.round(peak * meanShape); }

// Build a contract record. `remaining` starts at the full term (decremented each
// surviving day by expireContracts).
export function makeContract({ mw, price, term, origin = "dial", buyer = null, seq }){
  return { id:`ct-${seq}`, mw:Math.max(0, Math.round(mw)), price, term, remaining:term, origin, buyer };
}

// Settle this tick's contracts against actual served load. Committed MW delivers
// first at each contract's locked price; when served < total committed, every
// contract fills proportionally (so no contract is favoured). Returns the total
// committed MW (exposed for the spot-kill score track) and the contract revenue
// rate ($/h — the caller multiplies by dtH, as with spot).
export function settleContracts(contracts, served){
  const contractedMW = contracts.reduce((a, c) => a + c.mw, 0);
  if (contractedMW <= 0) return { contractedMW:0, deliveredContracted:0, contractRevenue:0 };
  const fill = Math.min(1, served / contractedMW);           // proportional when short, ≤ 1 always
  let contractRevenue = 0;
  for (const c of contracts) contractRevenue += c.mw * fill * c.price;
  return { contractedMW, deliveredContracted: contractedMW * fill, contractRevenue };
}

// Age contracts one day: decrement remaining term, drop the expired ones. Called
// from surviveDay. Mutates S.contracts in place (replacing the array).
export function expireContracts(S){
  if (!S.contracts || !S.contracts.length) return;
  for (const c of S.contracts) c.remaining -= 1;
  S.contracts = S.contracts.filter(c => c.remaining > 0);
}

// ============================================================
// FINANCE — credit, debt, interest, bankruptcy (Phase C). Still pure: every
// function is of state + dt/dtH, no DOM, no RNG, no engine import. A credit
// STANDING ∈ [0,100] sets the interest rate and borrowing ceiling; default
// craters both for the run; sustained insolvency is a fail-state.
// ============================================================

// Letter grade for a credit standing — display only, never drives economics.
export function gradeFor(credit){
  if (credit >= 90) return "AAA";
  if (credit >= 78) return "AA";
  if (credit >= 66) return "A";
  if (credit >= 52) return "BBB";
  if (credit >= 38) return "BB";
  if (credit >= 24) return "B";
  if (credit >= 10) return "CCC";
  return "D";
}

// Rate (per game-day), borrowing ceiling ($), and grade for a credit standing.
// Better credit → lower rate, higher ceiling. Both are linear in credit/100.
export function creditRating(credit){
  const c = Math.max(0, Math.min(100, credit)) / 100;
  return {
    grade: gradeFor(credit),
    rate: CFG.rateMin + (CFG.rateMax - CFG.rateMin) * (1 - c),
    ceiling: Math.round(CFG.ceilingMin + (CFG.ceilingMax - CFG.ceilingMin) * c),
  };
}

// Interest accrued on `debt` over a slice of `dtH` game-hours at a per-game-day
// `rate`. Returned as a $ amount (already scaled by dtH — the caller subtracts it
// from cash directly, NOT through the ×dtH energy line, to avoid a ×dtH² term).
export function interestFor(debt, rate, dtH){
  return Math.max(0, debt) * rate * (dtH / 24);
}

// How much more the player could borrow right now: the credit ceiling minus
// current debt, never negative. (S.credit is already held ≤ S.creditCap by
// creditTick / triggerDefault, so a post-default run already borrows against the
// capped standing.)
export function debtCapacity(S){
  return Math.max(0, creditRating(S.credit).ceiling - (S.debt || 0));
}

// Cash below the insolvency floor = insolvent (starts the bankruptcy clock).
export function isInsolvent(S){ return S.cash < CFG.insolvencyFloor; }

// A solvent day rebuilds credit toward the current cap (defaultCeil after a
// default, else 100). Called once per day from surviveDay.
export function creditTick(S){
  if (isInsolvent(S)) return;             // only solvent days rebuild trust
  const cap = S.creditCap ?? 100;
  S.credit = Math.min(cap, (S.credit ?? CFG.creditStart) + CFG.creditRecoverPerDay);
}

// Default: once per run, the moment you're insolvent WITH outstanding debt. Craters
// the in-run standing and caps the ceiling for the rest of the run; scars the ledger.
export function triggerDefault(S){
  S.defaulted = true;
  S.creditCap = CFG.defaultCeil;
  S.credit = Math.min(S.credit ?? CFG.creditStart, CFG.defaultCredit);
  (S.debtLedger = S.debtLedger || []).push({ type:"default", day:S.day, debt:Math.round(S.debt || 0) });
}

// Write the run's credit standing back to the carried profile (the ONLY writer of
// the cross-run credit thread). A default caps the written standing at defaultFloor.
export function commitCreditStanding(profile, S){
  const c = profile.credit || (profile.credit = { standing:CFG.creditStart, best:CFG.creditStart, everDefaulted:false, defaults:0, history:[] });
  const standing = S.defaulted ? Math.min(S.credit ?? CFG.creditStart, CFG.defaultFloor) : (S.credit ?? CFG.creditStart);
  c.standing = Math.round(standing);
  c.best = Math.max(c.best ?? CFG.creditStart, Math.round(S.credit ?? CFG.creditStart));
  if (S.defaulted){ c.everDefaulted = true; c.defaults = (c.defaults || 0) + 1; }
  (c.history = c.history || []).push(c.standing);
  if (c.history.length > 50) c.history = c.history.slice(-50); // keep the record bounded
  return c.standing;
}
