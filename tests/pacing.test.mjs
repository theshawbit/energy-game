// Unit tests for v5.2 Phase 2 PACING & FAIL-STATE LEGIBILITY (no DOM). Run: `npm test`.
// Pins: (1) the real-seconds constants re-seated COHERENTLY for the shorter day (per-game-day
// severity / grace preserved, not per-real-second), (2) the pure auto-pace classifier
// (pacePlan) — fast when calm, 1× the moment something needs watching, never forcing a pause,
// (3) the strain-bar relabel is cosmetic (reservoir direction + fill logic untouched).
import { pacePlan } from "../src/live/clock.js";
import { CFG } from "../src/live/config.js";
import { readFileSync } from "node:fs";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}

// A minimal live-ish S for the pace classifier — calm by default (loads of headroom, no events).
function calmS(over = {}) {
  return {
    peak: 800, capacity: 1100,            // +37.5% headroom (well above slowHeadroomPct)
    spikeT: 0, fleet: [{ status: "online" }, { status: "online" }],
    stability: { hp: 5, max: 100 },       // 5% strain — nowhere near the danger band
    ...over,
  };
}

// 1) Re-seated constants preserve per-GAME-DAY grace (the coherence guard). bankruptcyGrace
//    scales DIRECTLY with secondsPerDay (grace / seconds ≈ const); the 180s era is the reference.
//    (v5.3 Phase 3: the strainRate/strainRecover knobs are deleted with the S.strain scalar —
//    the stability reservoir's own CFG.v5_1 fill rates are pinned in tests/stability.test.mjs.)
{
  const graceRatio = CFG.bankruptcyGrace / CFG.secondsPerDay;    // was 22 / 180 ≈ 0.122
  check("bankruptcyGrace re-seated (game-time grace window preserved)", Math.abs(graceRatio - 22 / 180) <= 0.02,
    `${CFG.bankruptcyGrace} / ${CFG.secondsPerDay} = ${graceRatio.toFixed(3)} (ref ${(22 / 180).toFixed(3)})`);
  check("day is shorter than the old 180s", CFG.secondsPerDay < 180, `${CFG.secondsPerDay}s`);
}

// 2) Auto-pace classifier (pure) — fast when calm, 1× when something needs watching.
{
  check("calm → fast-forward", pacePlan(calmS()).speed === CFG.v5.fastSpeed);

  check("active demand spike → 1×", pacePlan(calmS({ spikeT: 1.5 })).speed === 1);

  check("a unit starting → 1×", pacePlan(calmS({ fleet: [{ status: "starting" }] })).speed === 1);
  check("a unit strained → 1×", pacePlan(calmS({ fleet: [{ status: "strained" }] })).speed === 1);
  check("a unit tripped → 1×", pacePlan(calmS({ fleet: [{ status: "tripped" }] })).speed === 1);

  // thin headroom (below slowHeadroomPct) → slow down before it's brief-tight
  const tight = calmS({ peak: 1000, capacity: 1000 * (1 + CFG.v5_2.pace.slowHeadroomPct - 0.02) });
  check("thin capacity headroom → 1×", pacePlan(tight).speed === 1,
    `headroom ${(((tight.capacity - tight.peak) / tight.peak) * 100).toFixed(1)}% < ${(CFG.v5_2.pace.slowHeadroomPct * 100)}%`);

  // strain reservoir in the danger band → 1×
  const danger = calmS({ stability: { hp: Math.ceil(CFG.v5_1.brief.stabilityDanger * 100) + 1, max: 100 } });
  check("strain in the danger band → 1×", pacePlan(danger).speed === 1);

  // never forces a pause — crisis pausing stays with autoPause
  check("pacePlan never returns speed 0 (pausing stays with autoPause)",
    [calmS(), calmS({ spikeT: 2 }), danger].every(s => pacePlan(s).speed !== 0));

  // pure: same input → same output
  const s = calmS({ spikeT: 1 });
  check("pacePlan is pure (stable output)", pacePlan(s).speed === pacePlan(s).speed);
}

// 3) Strain relabel is cosmetic — index.html renamed; renderStabilityBar fill logic untouched.
{
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  check("top strip labelled 'Grid Strain'", /Grid Strain/.test(html));
  check("old 'Grid Stability' label gone", !/>\s*Grid Stability\s*</.test(html));

  const render = readFileSync(new URL("../src/live/render.js", import.meta.url), "utf8");
  // the bar still fills as hp rises (reservoir direction unchanged — NO inversion to 100−hp)
  check("renderStabilityBar still fills from hp/max (no inversion)",
    /\(st\.hp\s*\/\s*st\.max\)\s*\*\s*100/.test(render));
  check("state words still keyed off fillPaused / lastShortfall (unchanged)",
    /fillPaused/.test(render) && /lastShortfall/.test(render));
}

console.log(failed === 0 ? "\nAll pacing tests passed." : `\n${failed} pacing test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
