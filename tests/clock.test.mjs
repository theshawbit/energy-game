// Unit tests for the v5 variable-speed clock (no DOM). Run: `npm test`.
// Pins dt→game-hours scaling, the allowed speed set, read-only pause, and auto-pause.
// NOTE: the day LENGTH is the single top-level CFG.secondsPerDay (read by code +
// every suite), not a separate CFG.v5 value — the clock only scales it by speed.
import { freshClock, tickClock, setSpeed, autoPause, speedSet } from "../src/live/clock.js";
import { createGame, step } from "../src/live/sim.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const FAST = CFG.v5.fastSpeed;

// 8) Pause is read-only — no game-time passes, and a step is a no-op
{
  const S = { clock: { speed: 0, autoPaused: false, pauseReason: "" } };
  check("tickClock at speed 0 yields 0 game-hours", tickClock(S, 1.0) === 0);
  const G = createGame(); G.clock.speed = 0; const t0 = G.t;
  const ended = step(G, 1.0);
  check("step while paused advances nothing and never ends", G.t === t0 && ended === false, `t ${G.t}`);
}

// 9) 1× matches the configured day length
{
  const S = { clock: freshClock() }; // speed 1 by default
  check("tickClock(1×) = dt·(24/secondsPerDay)", near(tickClock(S, 1.0), 24 / CFG.secondsPerDay));
  check("a full real-time day at 1× = 24 game-hours", near(tickClock(S, CFG.secondsPerDay), 24));
}

// 10) Fast-forward scales by exactly fastSpeed
{
  const base = { clock: freshClock() };
  const fast = { clock: { speed: FAST, autoPaused: false, pauseReason: "" } };
  check("fast-forward returns fastSpeed × the 1× value", near(tickClock(fast, 1.0), tickClock(base, 1.0) * FAST), `×${FAST}`);
}

// 11) setSpeed accepts only the allowed set
{
  const S = { clock: freshClock() };
  check("the allowed speed set is {0, 1, fastSpeed}", speedSet().join() === [0, 1, FAST].join());
  check("setSpeed accepts 0 / 1 / fastSpeed", setSpeed(S, 0) && setSpeed(S, 1) && setSpeed(S, FAST));
  const before = S.clock.speed;
  check("setSpeed rejects an out-of-set value (clock unchanged)", setSpeed(S, 2) === false && S.clock.speed === before);
  // choosing a running speed clears an auto-pause
  S.clock.autoPaused = true; setSpeed(S, 1);
  check("picking a running speed clears an auto-pause", S.clock.autoPaused === false);
}

// 12) autoPause stops the clock, flags the reason, AND sets the one paused-state (M6-audit)
{
  const S = { clock: freshClock() };
  autoPause(S, "trip imminent");
  check("autoPause zeroes speed and sets the flag + reason",
    S.clock.speed === 0 && S.clock.autoPaused === true && S.clock.pauseReason === "trip imminent");
  check("autoPause sets S.paused — the single source of paused-ness", S.paused === true);
}

// 13) Pause is single-sourced: ONE resume click runs the grid again (v5.3 Phase 3, M6-audit).
//     Replicates main.js's applySpeed()/togglePause(): the speed is derived from S.paused, and
//     the pause button flips that one flag. Before the fix, an autoPause left S.paused false, so
//     the first click only moved it false→true (clock still stopped) and resume took two clicks.
{
  const S = { clock: freshClock() };
  const applySpeed = () => setSpeed(S, S.paused ? 0 : 1);
  const togglePause = () => { S.paused = !S.paused; applySpeed(); };
  autoPause(S, "trip imminent");
  check("after an autoPause the clock is stopped and S.paused is set", S.clock.speed === 0 && S.paused === true);
  togglePause(); // a SINGLE click of the pause button
  check("one resume click runs the clock again (no two-click dance)", S.paused === false && S.clock.speed === 1);
  check("resuming clears the auto-pause cause signal", S.clock.autoPaused === false && S.clock.pauseReason === "");
}

console.log(failed === 0 ? "\nAll clock tests passed." : `\n${failed} clock test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
