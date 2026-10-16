// ============================================================
// LIVE ACTIONS — player inputs that mutate state. No DOM; the caller
// (main.js) repaints after an action. Guarded so they only apply during
// live, unpaused play.
// ============================================================
import { setTicker } from "./sim.js";

export function toggleUnit(S, id){
  if (!S.running || S.paused || S.over) return;
  const u = S.fleet.find(x => x.id === id); if (!u || !u.ctrl) return;
  if (u.kind === "battery"){
    if (u.status === "discharge") u.status = "off";
    else if (u.energy > 1) u.status = "discharge";
    else setTicker(S, "Battery depleted — needs surplus capacity to recharge.");
  } else { // peaker
    if (u.status === "off"){ u.status = "starting"; u.startTimer = u.startTime; }
    else if (u.status === "online" || u.status === "starting") u.status = "off";
  }
}
