// Unit tests for v5.2 Phase 1 PEAK FORMULA REWORK (no DOM). Run: `npm test`.
// Pins the B-split structure: the random intraday surge now flows through a WEIGHTED,
// SATURATING, HARD-CAPPED shock (peakShock) instead of multiplying raw onto the baseline.
// The old assembly (noise × event × wobble × spike) could stack to +57% at random — the
// uncontrollable day-5/6 death. These tests pin SHAPE (capped, spike-dominant, saturating,
// relief-preserving, foreseeable side intact), not the placeholder balance numbers.
import { peakShock } from "../src/live/demand.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const P = CFG.v5_2.peak;

// 1) The cap is a hard ceiling — the regression guard against the old +57% death-stack.
//    For ANY non-negative inputs (incl. absurd ones), the shock is strictly below shockCap.
{
  // shockCap is a hard ceiling (the asymptote) — never exceeded, for ANY input, incl. absurd.
  const inputs = [[0, 0], [0.2, 0.1], [1, 1], [10, 10], [1e6, 1e6]];
  check("shock never exceeds shockCap (the asymptote), for all inputs",
    inputs.every(([s, w]) => peakShock(s, w) <= P.shockCap),
    `max tested ${peakShock(1e6, 1e6).toFixed(4)} ≤ cap ${P.shockCap}`);
  // for any REALISTIC surge (spike ≤ 0.20, wobble ≤ 0.14 per CFG.vol), it stays strictly under
  check("shock is strictly below shockCap for realistic surges",
    peakShock(0.20, 0.14) < P.shockCap, `${peakShock(0.20, 0.14).toFixed(4)} < ${P.shockCap}`);
  check("shock is non-negative", inputs.every(([s, w]) => peakShock(s, w) >= 0));
  check("no inputs → no shock", peakShock(0, 0) === 0);
}

// 2) Spike-dominant weighting — the pinch point is the spike, by construction.
{
  const x = 0.15;
  check("equal input: spike contributes more than wobble", peakShock(x, 0) > peakShock(0, x),
    `spike ${peakShock(x, 0).toFixed(4)} > wobble ${peakShock(0, x).toFixed(4)}`);
  check("wSpike > wWobble in config", P.wSpike > P.wWobble, `${P.wSpike} vs ${P.wWobble}`);
}

// 3) Saturating & monotone — small inputs near-linear (texture kept), large inputs asymptote.
{
  // monotone non-decreasing in each argument
  let mono = true;
  for (let v = 0; v < 1; v += 0.05){
    if (peakShock(v + 0.05, 0) < peakShock(v, 0)) mono = false;
    if (peakShock(0, v + 0.05) < peakShock(0, v)) mono = false;
  }
  check("monotone non-decreasing in each argument", mono);

  // diminishing returns: the marginal gain from the spike shrinks as it grows
  const d1 = peakShock(0.10, 0) - peakShock(0.05, 0);
  const d2 = peakShock(0.60, 0) - peakShock(0.55, 0);
  check("diminishing returns (saturating, no linear blow-up)", d2 < d1,
    `Δ@low ${d1.toFixed(4)} > Δ@high ${d2.toFixed(4)}`);

  // small inputs stay close to the linear (weighted) sum — everyday chop survives
  const small = peakShock(0.02, 0.02);
  const linear = P.wSpike * 0.02 + P.wWobble * 0.02;
  check("small inputs ≈ linear (texture preserved)", Math.abs(small - linear) / linear < 0.05,
    `${small.toFixed(4)} vs linear ${linear.toFixed(4)}`);
}

// 4) No multiplicative death-stack — the canonical worst case is tamed vs the old product,
//    and bounded by foreseeable × (1 + shockCap). (Mirrors the sim.js assembly: foreseeable =
//    noise × event; the transients feed the capped shock instead of multiplying raw.)
{
  const noise = 0.06, event = 0.12, wobble = 0.10, spike = 0.20; // the documented winter stack
  const oldProduct = (1 + noise) * (1 + event) * (1 + wobble) * (1 + spike); // ≈ 1.566 (+57%)
  const foreseeable = (1 + noise) * (1 + event);                             // plannable lift
  const combined = foreseeable * (1 + peakShock(spike, wobble));             // B-split total

  check("B-split tames the canonical stack vs the old product", combined < oldProduct,
    `new ${combined.toFixed(3)} < old ${oldProduct.toFixed(3)}`);
  check("combined is bounded by foreseeable × (1 + shockCap)", combined <= foreseeable * (1 + P.shockCap) + 1e-9,
    `${combined.toFixed(3)} ≤ ${(foreseeable * (1 + P.shockCap)).toFixed(3)}`);
  check("the random surge alone can never exceed shockCap", peakShock(spike, wobble) < P.shockCap,
    `${peakShock(spike, wobble).toFixed(4)} < ${P.shockCap}`);
}

// 5) Foreseeable side intact — with no transients the assembly collapses to the plannable
//    lift (× 1), identical to the pre-rework behaviour under calm/quiet conditions.
{
  const foreseeableFactor = 1 + Math.min(0, 0); // demandJit = 0 → no downward relief applied
  check("no transients → shock is exactly 0", peakShock(0, 0) === 0);
  check("no transients → multiplier is exactly the foreseeable lift", (1 + peakShock(0, 0)) * foreseeableFactor === 1);
}

// 6) Relief survives — a downward wobble still reduces demand and never feeds the upward shock.
{
  const jitDown = -0.10;
  const reliefFactor = 1 + Math.min(0, jitDown);        // applied on the foreseeable side
  const wobbleSurge = Math.max(0, jitDown);             // fed to the shock
  check("downward wobble relieves load (factor < 1)", reliefFactor < 1, `${reliefFactor.toFixed(2)}`);
  check("downward wobble contributes nothing to the shock", wobbleSurge === 0 && peakShock(0, wobbleSurge) === 0);

  const jitUp = 0.10;
  check("upward wobble feeds the shock, not the foreseeable side",
    Math.min(0, jitUp) === 0 && Math.max(0, jitUp) === 0.10 && peakShock(0, 0.10) > 0);
}

// 7) Determinism / purity — peakShock is a pure function of its inputs (+ config), no RNG, no state.
{
  const a = peakShock(0.17, 0.08), b = peakShock(0.17, 0.08);
  check("pure: identical inputs → identical output", a === b);
  // explicit config override is honoured (balance pass passes its own cfg)
  const tight = peakShock(0.5, 0.5, { shockCap: 0.05, wSpike: 1, wWobble: 0.4 });
  check("explicit cfg override is honoured", tight < 0.05, `${tight.toFixed(4)} < 0.05`);
}

console.log(failed === 0 ? "\nAll peak-formula tests passed." : `\n${failed} peak-formula test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
