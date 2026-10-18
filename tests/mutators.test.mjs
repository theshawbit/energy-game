// Unit tests for the per-run mutator engine (v3, PR D1). No DOM. Run: `npm test`.
// Pins deck composition, the weighted roll, and the day-1 FAIRNESS invariant:
// every single mutator must be survivable from the starting fleet.
import { MUTATORS, mutatorById, computeMutatorMods, rollMutators } from "../src/live/mutators.js";
import { CFG, makeFleet } from "../src/live/config.js";
import { DEMAND_SHAPE } from "../src/constants.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 1) No mutators → identity mods
const id = computeMutatorMods([]);
check("no mutators → identity mods", id.demandMult === 1 && id.fuelMult === 1 && id.cfMult.sun === 1 && id.cfMult.wind === 1);

// 2) Each mutator contributes its magnitude
check("fuel-spike lifts fuelMult", computeMutatorMods(["fuel-spike"]).fuelMult === CFG.mut.fuelSpike);
check("heat wave lifts demand", computeMutatorMods(["heatwave"]).demandMult === CFG.mut.heatwave);
check("cold snap lifts demand", computeMutatorMods(["cold-snap"]).demandMult === CFG.mut.coldSnap);
check("drought cuts wind cf only", computeMutatorMods(["drought"]).cfMult.wind === CFG.mut.drought && computeMutatorMods(["drought"]).cfMult.sun === 1);
check("renewable lull cuts both cfs", (() => { const m = computeMutatorMods(["renewable-lull"]); return m.cfMult.sun === CFG.mut.lull && m.cfMult.wind === CFG.mut.lull; })());

// 3) Two mutators compose independently
{
  const m = computeMutatorMods(["heatwave", "drought"]);
  check("heat wave + drought compose", m.demandMult === CFG.mut.heatwave && m.cfMult.wind === CFG.mut.drought);
}

// 4) Unknown ids are ignored
check("unknown mutator id ignored", computeMutatorMods(["no-such"]).demandMult === 1);

// 5) rollMutators respects the count bounds and returns distinct, valid ids
{
  let ok = true;
  for (let i = 0; i < 200; i++){
    const ids = rollMutators();
    if (ids.length < CFG.mut.minRoll || ids.length > CFG.mut.maxRoll) ok = false;
    if (new Set(ids).size !== ids.length) ok = false;          // distinct
    if (!ids.every(x => mutatorById(x))) ok = false;            // valid
  }
  check("rollMutators: count in [min,max], distinct, valid", ok);
}

// 6) rollMutators is deterministic under an injected rng
{
  const seq = [0, 0]; let i = 0; const rng = () => seq[i++ % seq.length];
  const a = rollMutators(rng); i = 0; const b = rollMutators(rng);
  check("rollMutators deterministic with a fixed rng", JSON.stringify(a) === JSON.stringify(b), a.join(","));
}

// 7) FAIRNESS: under any single mutator, day-1 peak demand is coverable by the
// controllable fleet alone (firm + peakers + battery), with zero help from
// weather-dependent renewables — so no mutator is an unwinnable day-1 sentence.
{
  const fleet = makeFleet();
  const controllable = fleet.filter(u => u.kind === "firm" || u.kind === "peaker" || u.kind === "battery")
    .reduce((a, u) => a + u.cap, 0);
  const peakShape = Math.max(...DEMAND_SHAPE);
  let fair = true, worst = "";
  for (const m of MUTATORS){
    const mm = computeMutatorMods([m.id]);
    const peakDemand = CFG.startPeak * peakShape * mm.demandMult;
    if (peakDemand > controllable){ fair = false; worst = `${m.id} ${peakDemand.toFixed(0)}>${controllable}`; }
  }
  check("every mutator is day-1 survivable on controllable capacity", fair, worst || `≤ ${controllable} MW controllable`);
}

console.log(failed === 0 ? "\nAll mutator tests passed." : `\n${failed} mutator test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
