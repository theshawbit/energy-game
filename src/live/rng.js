// ============================================================
// SEEDED RNG (v4, Phase B) — a dependency-free deterministic generator so every
// run is replayable from its seed. Pure: no DOM, no state. All v4 economic
// randomness (spot noise, special offers, capacity calls) draws from a stream
// made here, exactly as rollMutators() takes an injectable rng — the pure
// modules never call Math.random(). Weather and trips stay on global
// Math.random (locked decision 12); only economic noise is seeded.
// ============================================================

// mulberry32: a tiny, well-distributed 32-bit PRNG. Returns a closure that
// yields floats in [0,1). Seed is coerced to a uint32 so any Date.now()>>>0 works.
export function makeRng(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
