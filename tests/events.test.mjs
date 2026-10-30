// Unit tests for v5 Phase 8 EVENTS / seasonal regime (no DOM). Run: `npm test`.
// Pins that the season picks the regime, the deck deals from it deterministically under
// an injected rng, and regimeMods feeds step() in the computeMutatorMods shape (winter
// lifts demand, a drought bites renewables), neutral when no regime is set.
import { createGame } from "../src/live/sim.js";
import { REGIMES, regimeForSeason, rollRegime, regimeMods } from "../src/live/events.js";
import { seasonOf } from "../src/live/calendar.js";
import { makeRng } from "../src/live/rng.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const deckIds = season => REGIMES[season].deck.map(d => d.id);

// 5) The season picks the regime
{
  const S = createGame();
  const seasons = { 1: "winter", 2: "spring", 3: "summer", 4: "autumn" };
  for (const q of [1, 2, 3, 4]){
    S.calendar.quarter = q;
    rollRegime(S, () => 0.5);
    check(`Q${q} → ${seasons[q]} regime`, S.regime.season === seasons[q] && S.regime.season === seasonOf(q));
  }
}

// 6) The deck deals from the active regime; deterministic under a pinned rng
{
  const S = createGame(); S.calendar.quarter = 3; // summer
  rollRegime(S, () => 0);                          // rng 0 → the first (heaviest) deck entry
  check("summer deals from the summer deck", S.regime.events.every(id => deckIds("summer").includes(id)));
  check("deal count matches CFG.v5.regimes.deal", S.regime.events.length === CFG.v5.regimes.deal);
  check("rng 0 deals the first deck entry (heatwave)", S.regime.events[0] === "heatwave", S.regime.events.join(","));

  // same seed → identical sequence
  const A = createGame(); A.calendar.quarter = 1;
  const B = createGame(); B.calendar.quarter = 1;
  rollRegime(A, makeRng(42)); rollRegime(B, makeRng(42));
  check("pinned rng → identical regime + events", JSON.stringify(A.regime) === JSON.stringify(B.regime), JSON.stringify(A.regime.events));
}

// 7) regimeMods feeds step unchanged (computeMutatorMods shape); season + events bias it
{
  const S = createGame(); S.calendar.quarter = 1; // winter
  rollRegime(S, () => 0.5);
  const m = regimeMods(S);
  check("regimeMods has the computeMutatorMods shape",
    ["demandMult", "fuelMult", "scarcityMult", "volatility", "cfMult"].every(k => k in m) && "wind" in m.cfMult);
  check("winter lifts the demand peak", m.demandMult >= REGIMES.winter.demandMult && m.demandMult > 1, m.demandMult.toFixed(3));

  // a drought event bites renewables (cfMult.wind < 1)
  const D = createGame(); D.regime = { season: "summer", events: ["drought"] };
  check("a drought regime drags wind below 1.0", regimeMods(D).cfMult.wind === CFG.mut.drought);

  // neutral when no regime is set (the headless default)
  const N = createGame(); N.regime = null;
  const nm = regimeMods(N);
  check("no regime → neutral mods", nm.demandMult === 1 && nm.cfMult.wind === 1 && nm.fuelMult === 1);
}

// 8) Determinism: same quarter + same seed → identical, independent of S.calm
{
  const A = createGame(); A.calendar.quarter = 3; A.calm = true;
  const B = createGame(); B.calendar.quarter = 3; B.calm = false;
  rollRegime(A, makeRng(7)); rollRegime(B, makeRng(7));
  check("regime roll ignores the live-jitter (calm) flag", JSON.stringify(A.regime) === JSON.stringify(B.regime));
  check("regimeForSeason matches the dealt season's config", regimeForSeason("summer") === REGIMES.summer);
}

console.log(failed === 0 ? "\nAll events tests passed." : `\n${failed} events test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
