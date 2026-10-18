// ============================================================
// MUTATORS — per-run conditions rolled at the start of each run (v3). Pure: no
// DOM, no state mutation beyond what callers pass. Mirrors meta.js / research.js.
//
// Each run rolls 1–2 mutators (CFG.mut.minRoll..maxRoll). A mutator contributes
// to `mmods` — the modifiers the sim folds into demand, the fuel-price multiplier
// (dispatchHour's 4th arg), and renewable capacity factors. The point is variety
// that steers the player toward a research path: a fuel spike rewards clean
// generation, a drought rewards storage/demand-response, a heat wave rewards firm
// capacity. Each is survivable from day 1 with the starting fleet (see the
// fairness test) — a different problem, never an unwinnable one.
// ============================================================
import { CFG } from "./config.js";

// deck: each entry names which mmods field(s) it touches; magnitudes come from
// CFG.mut so tuning is central (Phase F). `apply(m)` mutates a mods accumulator.
export const MUTATORS = [
  { id:"fuel-spike", label:"Fuel Price Spike", weight:1,
    blurb:"Gas marginal costs surge — the merit order re-sorts. Lean on clean generation.",
    apply:(m) => { m.fuelMult *= CFG.mut.fuelSpike; } },
  { id:"heatwave", label:"Heat Wave", weight:1,
    blurb:"Air-conditioning drives demand up all day. You need firm headroom.",
    apply:(m) => { m.demandMult *= CFG.mut.heatwave; } },
  { id:"cold-snap", label:"Cold Snap", weight:1,
    blurb:"Heating load lifts demand. Keep reserves armed.",
    apply:(m) => { m.demandMult *= CFG.mut.coldSnap; } },
  { id:"drought", label:"Drought", weight:1,
    blurb:"Still air and low water — wind underperforms. Storage and demand response pay off.",
    apply:(m) => { m.cfMult.wind *= CFG.mut.drought; } },
  { id:"renewable-lull", label:"Renewable Lull", weight:1,
    blurb:"Overcast and calm — solar and wind both sag. Shift energy or shave the peak.",
    apply:(m) => { m.cfMult.sun *= CFG.mut.lull; m.cfMult.wind *= CFG.mut.lull; } },
];

export function mutatorById(id){ return MUTATORS.find(x => x.id === id); }

// Neutral (identity) modifiers — the no-mutator baseline.
function freshMods(){ return { demandMult:1, fuelMult:1, cfMult:{ sun:1, wind:1 } }; }

// Fold the given mutator ids into one mods object. Unknown ids are ignored.
export function computeMutatorMods(ids = []){
  const m = freshMods();
  for (const id of ids){ const mut = mutatorById(id); if (mut) mut.apply(m); }
  return m;
}

// Roll this run's mutators: pick a count in [minRoll,maxRoll], then that many
// distinct ids weighted by `weight`. `rng` is injectable for deterministic tests.
export function rollMutators(rng = Math.random){
  const { minRoll, maxRoll } = CFG.mut;
  const count = Math.min(MUTATORS.length, minRoll + Math.floor(rng() * (maxRoll - minRoll + 1)));
  const pool = MUTATORS.map(m => ({ id:m.id, weight:m.weight }));
  const picked = [];
  for (let i = 0; i < count && pool.length; i++){
    const total = pool.reduce((a, p) => a + p.weight, 0);
    let r = rng() * total, k = 0;
    while (k < pool.length - 1 && (r -= pool[k].weight) > 0) k++;
    picked.push(pool[k].id);
    pool.splice(k, 1); // distinct — don't pick the same mutator twice
  }
  return picked;
}
