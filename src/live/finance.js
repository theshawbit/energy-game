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

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The locked price a contract of `termDays` earns off a given baseline: a slight
// discount to baseline (hedgeBaseFactor) that improves with term, capped so a
// long lock can't beat baseline by more than hedgePriceCap.
export function contractPrice(baseline, termDays){
  return Math.round(baseline * clamp(CFG.hedgeBaseFactor + CFG.hedgeTermBonus * termDays, 0.5, CFG.hedgePriceCap));
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
