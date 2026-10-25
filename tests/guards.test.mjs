// Cross-cutting GUARD tests (v4 Phase G) — the invariants that keep the verified
// core verified while the economy grows around it. No DOM. Run: `npm test`.
//
// These are deliberately phase-spanning: each pins a property the whole book must
// honour, not one module's math (those live in market/finance/capacity/offers).
//   1. Shortfall is never a windfall — unserved load earns nothing; the rm≤0 spot
//      plateau means a DEEPER shortfall only ever costs more, never pays more.
//   2. Sim determinism — the economy rides the seeded S.rng (offers/capacity calls),
//      so with weather pinned, same seed → identical trajectory; a different seed
//      diverges. Nothing economic leaks onto global Math.random.
//   3. Cash/book conservation — a covered tick moves cash ONLY through the revenue
//      line; a term contract shifts cash by exactly contractedMW×(price−spot)×dtH
//      and nothing else (costs cancel), so there is no hidden cash source or sink.
import { createGame, step } from "../src/live/sim.js";
import { signContract } from "../src/live/actions.js";
import { spotPrice, exogenousBaseline, reserveMargin } from "../src/live/market.js";
import { rollSpecialOffer } from "../src/live/offers.js";
import { makeRng } from "../src/live/rng.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const DT = 0.25, dtH = DT * (24 / CFG.secondsPerDay);

// Pin weather for a block of work so two sims share identical renewable output.
// (Weather is intentionally on global Math.random — v3 precedent; the DETERMINISM
// contract is about the economic streams, so we hold weather fixed to isolate it.)
function withPinnedRandom(value, fn){
  const orig = Math.random; Math.random = () => value;
  try { return fn(); } finally { Math.random = orig; }
}
// A firm-only, weather-independent fleet so served = firm capacity exactly.
function firmOnly(S){
  S.fleet = S.fleet.filter(u => u.kind === "firm"); // nuclear+coalA+coalB
  for (const u of S.fleet) u.status = "online";
  return S.fleet.reduce((a, u) => a + u.cap, 0);
}

// ============================================================
// 1) SHORTFALL IS NEVER A WINDFALL
// ============================================================

// 1a) The rm≤0 plateau (the engine-protection keystone), restated as a guard:
//     a deeper shortfall never raises the per-MWh spot.
{
  const base = exogenousBaseline(1, 12);
  const spotAt = rm => spotPrice({ baseline: base, reserveMargin: rm, scarcityMult: 1, noise: 0 });
  const s0 = spotAt(0), sMid = spotAt(-0.3), sDeep = spotAt(-0.9);
  check("spot plateaus at the margin (rm 0)", near(s0, sMid) && near(sMid, sDeep), `${s0.toFixed(1)}=${sMid.toFixed(1)}=${sDeep.toFixed(1)}`);
  // and a fuel-spike's scarcityMult can't break the plateau into a deeper-shortfall bonus
  const m0 = spotPrice({ baseline: base, reserveMargin: 0, scarcityMult: CFG.mut.fuelScarcity, noise: 0 });
  const mDeep = spotPrice({ baseline: base, reserveMargin: -0.9, scarcityMult: CFG.mut.fuelScarcity, noise: 0 });
  check("plateau holds under a fuel-spike scarcityMult", near(m0, mDeep), `${m0.toFixed(1)}=${mDeep.toFixed(1)}`);
}

// 1b) In the SIM: two grids identical but for demand DEPTH, both short of the same
//     firm capacity. Served and spot are identical (capacity-limited + plateau), so
//     revenue is identical — the extra unserved MWh earn nothing. The ONLY cash
//     difference is the extra unserved-load PENALTY: a deeper shortfall is strictly
//     a cost, never a windfall.
withPinnedRandom(0.5, () => {
  function shortfallTick(peak){
    const S = createGame();
    const firm = firmOnly(S);
    S.peak = peak; S.t = 18; S.running = true;    // evening-ish, demand well over firm
    const cash0 = S.cash;
    step(S, DT);
    return { S, firm, dCash: S.cash - cash0, served: Math.min(firm, S.demand), shortfall: Math.max(0, S.demand - S.capacity), spot: S.spot, demand: S.demand, cap: S.capacity };
  }
  const a = shortfallTick(1600);   // shallower shortfall
  const b = shortfallTick(2400);   // deeper shortfall, SAME firm capacity
  check("both ticks are genuinely short (served < demand)", a.cap < a.demand && b.cap < b.demand, `A ${a.cap}/${a.demand}  B ${b.cap}/${b.demand}`);
  check("same served capacity in both (firm-limited)", a.cap === b.cap, `${a.cap} MW`);
  check("deeper shortfall does NOT raise spot (plateau)", near(a.spot, b.spot, 1e-9), `$${a.spot.toFixed(1)} vs $${b.spot.toFixed(1)}`);
  check("deeper shortfall earns no more cash — it costs more", b.dCash < a.dCash, `ΔA ${a.dCash.toFixed(0)} > ΔB ${b.dCash.toFixed(0)}`);
  // the entire cash gap is exactly the extra unserved-load penalty — revenue (served×spot) cancels
  const extraPenalty = (b.shortfall - a.shortfall) * CFG.unservedPenalty * dtH;
  check("the cash gap is exactly the extra unserved penalty (revenue is served-only)", near(a.dCash - b.dCash, extraPenalty, 1e-6), `gap ${(a.dCash - b.dCash).toFixed(2)} vs penalty ${extraPenalty.toFixed(2)}`);
});

// ============================================================
// 2) SIM DETERMINISM — the economy rides the seeded S.rng
// ============================================================
// Realized spot carries NO random noise (spotNoise is always 0): it's a pure
// function of day/hour/reserve-margin, so with weather pinned it is fully
// reproducible AND independent of the economic seed — the offer/forecast streams
// can never desync the realized-spot sequence (§1.6). The economy itself (offers,
// capacity calls) is what rides the seeded S.rng.

// 2a) + 2b) real-sim spot series: reproducible, and seed-independent.
function spotSeries(econSeed){
  return withPinnedRandom(0.5, () => {
    const S = createGame();                 // default fleet + peak — solvent for this short window
    S.seed = econSeed; S.rng = makeRng(econSeed); S.rngForecast = makeRng((econSeed ^ 0xF0) >>> 0);
    S.running = true;
    const spots = [];
    for (let i = 0; i < 20; i++){ step(S, DT); spots.push(Math.round(S.spot * 1000)); } // ~5 game-hours
    return spots.join(",");
  });
}
{
  const s1 = spotSeries(111), s1again = spotSeries(111), s2 = spotSeries(222);
  check("same seed + pinned weather → identical spot series (reproducible)", s1 === s1again && s1.length > 0);
  check("realized spot is seed-independent (economy can't desync it)", s1 === s2);
}

// 2c) the ECONOMY rides the seed: the daily offer roll (exactly what the sim calls
//     on each day rollover — rollSpecialOffer(S, S.rng)) is reproducible from the
//     seed and genuinely seed-dependent. Flake-free over a 12-day stream.
function offerSeq(seed){
  const rng = makeRng(seed);
  const S = { economyUnlocked: { "special-offers": true }, capacity: 600, demand: 500 };
  const seq = [];
  for (let d = 1; d <= 12; d++){ S.day = d; const o = rollSpecialOffer(S, rng); seq.push(o ? `${o.buyerName}:${o.mw}:${o.termDays}` : "none"); }
  return seq.join("|");
}
{
  const o1 = offerSeq(20260101), o1again = offerSeq(20260101), o2 = offerSeq(99999999);
  check("same seed → identical offer sequence", o1 === o1again && o1.includes(":"), o1);
  check("different seed → different offer sequence", o1 !== o2);
}

// ============================================================
// 3) CASH / BOOK CONSERVATION (no hidden source or sink)
// ============================================================
// Two identical COVERED ticks; game B carries one extra term contract. Fleet,
// dispatch, spot, costs are identical, so they cancel — the ONLY cash difference
// is the contract swapping residual-at-spot for its locked price:
//     ΔcashB − ΔcashA == contractedMW × (contractPrice − spot) × dtH
// Any stray cash leak (double-count, wrong sign, phantom credit) breaks this.
withPinnedRandom(0.5, () => {
  const PRICE = 200, MW = 100;
  function coveredTick(withContract){
    const S = createGame();
    S.peak = 300; S.t = 10; S.running = true;     // low peak → comfortably covered, no shortfall
    if (withContract) signContract(S, { mw: MW, price: PRICE, term: 3, origin: "test" });
    const cash0 = S.cash;
    step(S, DT);
    return { dCash: S.cash - cash0, spot: S.spot, contractedMW: S.contractedMW, covered: S.capacity >= S.demand };
  }
  const a = coveredTick(false);
  const b = coveredTick(true);
  check("both ticks are covered (no shortfall noise)", a.covered && b.covered);
  check("the contract did not move spot or dispatch", near(a.spot, b.spot, 1e-9), `$${a.spot.toFixed(2)} vs $${b.spot.toFixed(2)}`);
  check("contract filled against served load", b.contractedMW === MW, `${b.contractedMW} MW`);
  const expectedDelta = b.contractedMW * (PRICE - b.spot) * dtH;
  check("ΔcashB − ΔcashA == contractedMW×(price−spot)×dtH (costs cancel, no leak)",
    near(b.dCash - a.dCash, expectedDelta, 1e-6), `${(b.dCash - a.dCash).toFixed(4)} vs ${expectedDelta.toFixed(4)}`);
});

console.log(failed === 0 ? "\nAll guard tests passed." : `\n${failed} guard test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
