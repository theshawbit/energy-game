// Unit tests for the v4 spot market (Phase B). No DOM. Run: `npm test`.
// Pins the scarcity-premium shape (incl. the engine-protection plateaus), the
// clamps, mutator compounding, and noise linearity — the price-formation core.
import { CFG } from "../src/live/config.js";
import { exogenousBaseline, dailyBaseline, reserveMargin, scarcityPremium, spotPrice, meanShape } from "../src/live/market.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// 1) reserveMargin basics
check("reserveMargin = (cap−dem)/dem", near(reserveMargin(120, 100), 0.2));
check("reserveMargin defaults flush when no demand", reserveMargin(0, 0) === 1);

// 2) scarcityPremium: zero exactly at rmRef (healthy headroom → baseline price)
check("premium is 0 at rmRef", near(scarcityPremium(CFG.rmRef), 0), scarcityPremium(CFG.rmRef).toFixed(3));

// 3) tight/shortfall PLATEAU: rm=0 and any deeper shortfall give the SAME max premium
check("premium plateaus at scarcityMax for rm=0", near(scarcityPremium(0), CFG.scarcityMax));
check("deeper shortfall is NOT more lucrative (plateau)", scarcityPremium(-0.5) === scarcityPremium(0),
  `${scarcityPremium(-0.5)} vs ${scarcityPremium(0)}`);

// 4) flush CRASH plateau at rm ≥ rmCrash
check("premium crashes to −crashMax at rmCrash", near(scarcityPremium(CFG.rmCrash), -CFG.crashMax));
check("over-flush is not worse than the crash plateau", scarcityPremium(2.0) === scarcityPremium(CFG.rmCrash));

// 5) strictly decreasing across the active band [0, rmRef] (tight → healthy)
{
  let mono = true, prev = scarcityPremium(0);
  for (let rm = 0.02; rm <= CFG.rmRef + 1e-9; rm += 0.02){ const p = scarcityPremium(rm); if (p >= prev) mono = false; prev = p; }
  check("premium decreases monotonically across [0, rmRef]", mono);
}

// 6) spotPrice sits at baseline when the premium is zero (rm = rmRef)
check("spot = baseline at rmRef", near(spotPrice({ baseline: 100, reserveMargin: CFG.rmRef }), 100));

// 7) scarcityMult doubles the premium MAGNITUDE, both signs
{
  const base = 50, rmTight = 0.18, rmFlush = 0.5; // base+2×premium stays under spotCap (no clamp)
  const p1 = spotPrice({ baseline: base, reserveMargin: rmTight }) - base;
  const p2 = spotPrice({ baseline: base, reserveMargin: rmTight, scarcityMult: 2 }) - base;
  check("scarcityMult=2 doubles the positive premium", near(p2, p1 * 2), `${p1.toFixed(1)} → ${p2.toFixed(1)}`);
  const n1 = spotPrice({ baseline: 130, reserveMargin: rmFlush }) - 130; // 130 (<spotCap) keeps base−2×crash off the floor
  const n2 = spotPrice({ baseline: 130, reserveMargin: rmFlush, scarcityMult: 2 }) - 130;
  check("scarcityMult=2 doubles the negative premium", near(n2, n1 * 2) && n1 < 0, `${n1.toFixed(1)} → ${n2.toFixed(1)}`);
}

// 8) noise adds linearly (before clamps)
check("noise shifts spot linearly", near(
  spotPrice({ baseline: 100, reserveMargin: CFG.rmRef, noise: 15 }),
  spotPrice({ baseline: 100, reserveMargin: CFG.rmRef }) + 15));

// 9) clamps to [spotFloor, spotCap]
check("spot clamps to the cap on a huge premium", near(spotPrice({ baseline: 300, reserveMargin: 0 }), CFG.spotCap));
check("spot clamps to the floor on a huge crash + low baseline", near(spotPrice({ baseline: CFG.spotFloor, reserveMargin: 1.0 }), CFG.spotFloor));

// 10) baselines: dailyBaseline rises with day; exogenousBaseline wiggles around it by hour
check("dailyBaseline = spotBase on day 1", near(dailyBaseline(1), CFG.spotBase));
check("dailyBaseline drifts up with days", dailyBaseline(5) > dailyBaseline(1));
check("exogenousBaseline is hour-sensitive (peak hour > trough hour)", exogenousBaseline(1, 18) > exogenousBaseline(1, 3));
check("meanShape is a sane fraction", meanShape > 0.5 && meanShape < 0.9, meanShape.toFixed(3));

console.log(failed === 0 ? "\nAll market tests passed." : `\n${failed} market test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
