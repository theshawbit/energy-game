// Unit tests for v4 special offers — the Rolodex (Phase F). No DOM.
// Run: `npm test`. Pins the unlock gate, determinism under a fixed rng, the
// field ranges, and the one-day expiry.
import { BUYERS, rollSpecialOffer } from "../src/live/offers.js";
import { makeRng } from "../src/live/rng.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}

const unlocked = day => ({ day, economyUnlocked: { "special-offers": true } });

// 1) null without the Rolodex unlock, whatever the rng
check("no offer without the special-offers unlock", rollSpecialOffer({ day: 3, economyUnlocked: {} }, () => 0) === null);

// 2) null when the daily-chance gate misses (rng ≥ dailyChance)
check("no offer when the daily chance misses", rollSpecialOffer(unlocked(3), () => 0.99) === null);

// 3) deterministic under a fixed seed (same seed → identical offer)
{
  const a = rollSpecialOffer(unlocked(5), makeRng(777));
  const b = rollSpecialOffer(unlocked(5), makeRng(777));
  check("same seed → identical offer (deterministic)", JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a));
}

// 4) a produced offer has sane fields within the roster's overall ranges, and
//    expires the next day
{
  // scripted rng: gate pass, buyer 0, then mw/term/mult/id spans
  const seq = [0.1, 0.0, 0.5, 0.5, 0.5, 0.5]; let i = 0; const rng = () => seq[i++ % seq.length];
  const o = rollSpecialOffer(unlocked(8), rng);
  const mwLo = Math.min(...BUYERS.map(b => b.mwLo)), mwHi = Math.max(...BUYERS.map(b => b.mwHi));
  const tLo = Math.min(...BUYERS.map(b => b.termLo)), tHi = Math.max(...BUYERS.map(b => b.termHi));
  const mLo = Math.min(...BUYERS.map(b => b.multLo)), mHi = Math.max(...BUYERS.map(b => b.multHi));
  check("offer is produced with a named buyer", o && BUYERS.some(b => b.name === o.buyerName), o && o.buyerName);
  check("mw / term / priceMult fall within the roster ranges",
    o.mw >= mwLo && o.mw <= mwHi && o.termDays >= tLo && o.termDays <= tHi && o.priceMult >= mLo && o.priceMult <= mHi,
    `${o.mw}MW ${o.termDays}d ×${o.priceMult}`);
  check("offer expires the next day", o.expiresDay === 8 + 1);
}

console.log(failed === 0 ? "\nAll offers tests passed." : `\n${failed} offers test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
