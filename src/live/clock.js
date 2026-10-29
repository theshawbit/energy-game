// ============================================================
// CLOCK (v5, Phase 1) — variable-speed time scaling. Pure: converts real seconds
// to game-hours honouring the current speed, and owns the speed / auto-pause
// state transitions. The single source of the dt→game-hours conversion the sim
// step() used to inline. The day LENGTH is CFG.secondsPerDay (one source, read by
// code + tests); here we only scale it by speed.
//
// S.clock = { speed, autoPaused, pauseReason }
//   speed 0 = paused (read-only — no time passes) | 1 = 1× (the ~3-min day)
//        | CFG.v5.fastSpeed = fast-forward (skip calm hours)
// ============================================================
import { CFG } from "./config.js";

// The allowed speeds. Anything else is rejected by setSpeed.
export function speedSet(){ return [0, 1, CFG.v5.fastSpeed]; }

export function freshClock(){
  return { speed: 1, autoPaused: false, pauseReason: "" };
}

// Real seconds → game-hours at the current speed. Speed 0 yields 0 (read-only
// pause: no time passes). The base rate is dt·(24/secondsPerDay); speed scales it.
export function tickClock(S, dt){
  const speed = S.clock ? S.clock.speed : 1;
  if (speed <= 0) return 0;
  return dt * (24 / CFG.secondsPerDay) * speed;
}

// Set the clock speed, clamped to the allowed set (an out-of-set value is ignored).
// Choosing any running speed clears an auto-pause (the player took the wheel back).
export function setSpeed(S, speed){
  if (!speedSet().includes(speed)) return false;
  S.clock.speed = speed;
  if (speed > 0){ S.clock.autoPaused = false; S.clock.pauseReason = ""; }
  return true;
}

// Stop the clock because a crisis needs the player's attention. Records the reason
// for the view to surface. The crisis hooks in later phases call this; Phase 1
// uses it at the quarter-end planning beat.
export function autoPause(S, reason = ""){
  S.clock.speed = 0;
  S.clock.autoPaused = true;
  S.clock.pauseReason = reason;
}
