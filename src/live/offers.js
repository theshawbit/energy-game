// ============================================================
// SPECIAL OFFERS (v4, Phase F — the "Rolodex", gated by the "special-offers"
// economy unlock). Pure: no DOM, no sim import, caller-supplied RNG. Named buyers
// bring occasional standout term contracts to the Desk; the contract system
// (Phase B) consumes the produced offer object (S.pendingOffer). Until the unlock
// is owned, rollSpecialOffer returns null — so B/E ship fine without it.
// ============================================================
import { CFG } from "./config.js";

// The named-buyer roster — flavour + the shape of the deal each tends to bring.
export const BUYERS = [
  { name:"Northwind Data",    mwLo:120, mwHi:260, multLo:1.08, multHi:1.22, termLo:3, termHi:5 }, // premium, steady
  { name:"Harbor Smelting",   mwLo:200, mwHi:400, multLo:0.98, multHi:1.10, termLo:2, termHi:4 }, // big volume, thin margin
  { name:"Civic Hospital Net",mwLo:60,  mwHi:140, multLo:1.12, multHi:1.30, termLo:4, termHi:6 }, // small, pays up for reliability
  { name:"Vale Transit",      mwLo:90,  mwHi:180, multLo:1.00, multHi:1.15, termLo:3, termHi:6 },
];

// Roll a special offer for the coming day. Null without the unlock, or when the
// daily chance misses. Deterministic under a fixed rng. priceMult is applied to
// the B term-contract rate when the player accepts (see actions.acceptOffer).
export function rollSpecialOffer(S, rng){
  if (!(S.economyUnlocked && S.economyUnlocked["special-offers"])) return null;
  if (rng() >= CFG.offers.dailyChance) return null;
  const b = BUYERS[Math.floor(rng() * BUYERS.length)] || BUYERS[0];
  const span = (lo, hi) => lo + rng() * (hi - lo);
  const mw = Math.round(span(b.mwLo, b.mwHi));
  const termDays = Math.round(span(b.termLo, b.termHi));
  const priceMult = +span(b.multLo, b.multHi).toFixed(3);
  return {
    id: `off-${S.day}-${Math.floor(rng() * 1e6)}`,
    buyerName: b.name,
    mw, priceMult, termDays,
    expiresDay: S.day + 1, // open for the one day, then it's gone
  };
}
