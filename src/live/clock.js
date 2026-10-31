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

// v5.2 Phase 2 — AUTO-PACE decision. Pure read of live S: picks the DEFAULT speed so calm
// game-hours fast-forward and the clock drops to 1× the instant something needs watching —
// an active demand spike, a unit starting/strained/tripped, thin capacity headroom, or the
// strain reservoir in its danger band. It NEVER forces a pause: crisis pausing stays with
// autoPause (the strain-onset hook), so auto-pace can't fight the player for the wheel.
// main.js applies this each operating frame unless the player has taken manual control.
export function pacePlan(S){
  const b = CFG.v5_1.brief, P = CFG.v5_2.pace;
  const peak = S.peak || 0;
  const headroom = peak > 0 ? ((S.capacity ?? 0) - peak) / peak : Infinity;
  const st = S.stability, stabFrac = st && st.max > 0 ? st.hp / st.max : 0;
  const spiking = (S.spikeT || 0) > 0;
  const unitEvent = Array.isArray(S.fleet) && S.fleet.some(u =>
    u.status === "strained" || u.status === "starting" || u.status === "tripped");
  const watch = spiking || unitEvent
    || headroom < (P?.slowHeadroomPct ?? b.headroomPct)
    || stabFrac >= b.stabilityDanger;
  return watch
    ? { speed: 1, reason: "watch the grid" }
    : { speed: CFG.v5.fastSpeed, reason: "calm" };
}

// Stop the clock because a crisis needs the player's attention. Records the reason
// for the view to surface. The crisis hooks in later phases call this; Phase 1
// uses it at the quarter-end planning beat.
// v5.3 Phase 3 (M6-audit): paused-ness has ONE source of truth — S.paused. An auto-pause
// sets it too, so the pause button reflects the stopped clock and a SINGLE resume click
// (togglePause → applySpeed) runs the grid again, instead of the old two-click dance where
// the first click only moved S.paused false→true. autoPaused/pauseReason stay as the CAUSE
// signal the daily brief reads (brief.js) — metadata about WHY, not a second paused-state.
export function autoPause(S, reason = ""){
  S.paused = true;
  S.clock.speed = 0;
  S.clock.autoPaused = true;
  S.clock.pauseReason = reason;
}
