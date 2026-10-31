// ============================================================
// SEEDED ENV RNG (v5.3 Phase 2, Part A / M10) — the environment's stochastics
// (weather walk, demand jitter, demand spikes, trips) now draw from a seeded
// S.rngEnv stream instead of global Math.random. This locks two properties the
// asserting harness and bug-report replay depend on:
//   • a pinned S.rngEnv seed reproduces an identical env series across runs;
//   • the env stream is SEPARATE from the economic streams (S.rng), so sharpening
//     or re-seeding one never desyncs the other.
// Run: `npm test` (or `node tests/rng-env.test.mjs`).
// ============================================================
import { createGame, step } from "../src/live/sim.js";
import { makeRng } from "../src/live/rng.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}

// A headless game with volatility ON, env + economic streams seeded independently.
// Construction-time draws (freshWeather) are pinned on the global so only S.rngEnv
// varies the run. Kept under a game-day so no rollover consumes the economic stream.
function seeded(envSeed, econSeed){
  const prev = Math.random; Math.random = () => 0.5;
  const S = createGame();
  Math.random = prev;
  S.rngEnv = makeRng(envSeed);
  S.rng = makeRng(econSeed);
  S.rngDemand = makeRng((econSeed ^ 0xD3) >>> 0);
  S.running = true; S.calm = false; S.t = 0;   // volatility on; start of day so no rollover in-range
  return S;
}
function series(envSeed, econSeed = 777){
  const S = seeded(envSeed, econSeed);
  const out = [];
  for (let i = 0; i < 200; i++){ step(S, 0.1); out.push([S.weather.sun, S.weather.wind, S.demandJit, S.spikeMag, S.spikeT]); }
  return out;
}

// 1) Determinism — the same env seed reproduces the same env series, tick for tick.
const a = series(12345), b = series(12345);
check("same S.rngEnv seed → identical weather/jitter/spike series", JSON.stringify(a) === JSON.stringify(b));

// 2) The seed actually drives it — a different env seed yields a different series
//    (so the series isn't just frozen regardless of the stream).
const c = series(99999);
check("a different S.rngEnv seed → a different env series", JSON.stringify(a) !== JSON.stringify(c));

// 3) The env volatility moved — it's the REAL volatile game under the harness, not a
//    skeleton (weather drifted off its pinned start and/or jitter is non-zero).
check("env volatility is live under a seeded run (weather left its start / jitter non-zero)",
  a.some(([sun, wind, jit]) => sun !== 0.5 * (1.05 - 0.7) + 0.7 || jit !== 0) && a[199][0] !== a[0][0]);

// 4) Independence — a volatile env run does NOT consume the economic stream (S.rng),
//    so the two streams can never desync. After 20 game-hours of weather/jitter/spike,
//    the next economic draw is still the FIRST draw of an untouched stream.
{
  const S = seeded(12345, 777);
  check("no capacity obligation (so step() wouldn't touch S.rng for another reason)", !S.capacityObligation);
  for (let i = 0; i < 200; i++) step(S, 0.1);
  const econNext = S.rng();
  const expected = makeRng(777)();
  check("env volatility does not consume the economic RNG stream (streams independent)", econNext === expected,
    `${econNext.toFixed(6)} == ${expected.toFixed(6)}`);
}

// 5) The env seed does NOT change the economic stream either way — same econ seed, two
//    different env seeds, the first economic draw is identical.
{
  const A = seeded(111, 42), B = seeded(222, 42);
  for (let i = 0; i < 50; i++){ step(A, 0.1); step(B, 0.1); }
  check("re-seeding the env stream leaves the economic stream untouched", A.rng() === B.rng());
}

console.log(failed === 0 ? "\nAll rng-env tests passed." : `\n${failed} rng-env test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
