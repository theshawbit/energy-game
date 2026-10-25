// Unit tests for the v4 earned-forecast accuracy model (Phase E). No DOM.
// Run: `npm test`. Pins the fog width's response to skill and volatility, its
// clamps, and the input-gathering.
import { CFG } from "../src/live/config.js";
import { forecastFog, forecastInputs } from "../src/live/forecast.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// 1) baseline: no skill, calm market → exactly baseFog
check("fog = baseFog at skill 0, volatility 0", near(forecastFog({ skill: 0, volatility: 0 }), CFG.forecast.baseFog));

// 2) skill sharpens (monotonic down), volatility blurs (monotonic up)
check("more skill → narrower fog", forecastFog({ skill: 3 }) < forecastFog({ skill: 1 }) && forecastFog({ skill: 1 }) < forecastFog({ skill: 0 }));
check("more volatility → wider fog", forecastFog({ volatility: 0.6 }) > forecastFog({ volatility: 0 }));

// 3) clamps to [fogMin, fogMax]
check("fog clamps to fogMax under extreme volatility", near(forecastFog({ skill: 0, volatility: 5 }), CFG.forecast.fogMax));
check("fog never below fogMin", forecastFog({ skill: 99, volatility: 0 }) >= CFG.forecast.fogMin);
check("skill is clamped at maxSkill (no over-sharpening past the ladder)", forecastFog({ skill: 99 }) === forecastFog({ skill: CFG.forecast.maxSkill }));

// 4) forecastInputs sums the two volatility sources and pulls the research skill
{
  const S = { rmods: { forecastSkill: 2 }, marketVolatility: 0.1, mmods: { volatility: 0.6 } };
  const fi = forecastInputs(S);
  check("forecastInputs pulls forecastSkill + sums volatilities", fi.skill === 2 && near(fi.volatility, 0.7));
  const bare = forecastInputs({});
  check("forecastInputs defaults to skill 0, volatility 0", bare.skill === 0 && bare.volatility === 0);
}

console.log(failed === 0 ? "\nAll forecast tests passed." : `\n${failed} forecast test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
