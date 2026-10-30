// ============================================================
// EVENTS (v5 Phase 8) — the seasonal EVENT REGIME, grown from mutators.js. Each
// quarter is a season (Phase 1 `seasonOf`), and each season carries a weather bias
// + an event deck dealt from the shipped mutator ids. This is the mechanical half of
// Phase 9's world: ids + mods only, ZERO flavour text (Phase 9 owns all copy).
//
// Pure + RNG-injected: `rollRegime(S, rng)` deals the coming quarter's events at the
// quarter rollover (deterministic under a pinned stream); `regimeMods(S)` folds the
// active regime into the SAME shape `computeMutatorMods` returns, so `sim.step`
// consumes it through `S.mmods` with no new plumbing. The per-run mutator roll is
// superseded by this — a persistent grid lives through seasons, not a single roll.
// ============================================================
import { CFG } from "./config.js";
import { seasonOf } from "./calendar.js";
import { computeMutatorMods } from "./mutators.js";

// The per-season regimes (weather bias + weighted event deck), straight from config so
// balance stays central. Exposed for the daily brief + tests.
export const REGIMES = CFG.v5.regimes.bySeason;

export function regimeForSeason(season){ return REGIMES[season] || null; }

// Deal `count` distinct event ids from a weighted deck. Same weighted-without-replacement
// draw as rollMutators, with an injected rng so tests are reproducible.
function dealFromDeck(deck, count, rng){
  const pool = deck.map(d => ({ id: d.id, weight: d.weight }));
  const picked = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++){
    const total = pool.reduce((a, p) => a + p.weight, 0);
    let r = rng() * total, k = 0;
    while (k < pool.length - 1 && (r -= pool[k].weight) > 0) k++;
    picked.push(pool[k].id);
    pool.splice(k, 1);             // distinct — never deal the same event twice in a quarter
  }
  return picked;
}

// Select the coming quarter's regime by season and deal its events. Mutates + returns
// S.regime = { season, events:[id,…] }. Called at the quarter rollover (sim.js) and at
// game start (main.js) so every quarter the player plays has a live regime.
export function rollRegime(S, rng = Math.random){
  const season = seasonOf(S.calendar.quarter);
  const regime = regimeForSeason(season);
  const events = regime ? dealFromDeck(regime.deck, CFG.v5.regimes.deal, rng) : [];
  S.regime = { season, events };
  return S.regime;
}

// The active regime's per-tick mods, in the computeMutatorMods shape (demandMult, fuelMult,
// scarcityMult, volatility, cfMult). Folds the dealt events' mutator effects, then layers the
// season's own weather bias on top. Neutral when no regime is set (the headless default).
export function regimeMods(S){
  const m = computeMutatorMods(S.regime?.events || []);
  const bias = S.regime ? regimeForSeason(S.regime.season) : null;
  if (bias?.demandMult) m.demandMult *= bias.demandMult;   // winter/summer lift the load curve
  return m;
}
