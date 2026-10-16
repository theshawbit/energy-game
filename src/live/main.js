// ============================================================
// LIVE ENTRY POINT — owns the live game state, runs the real-time loop, and
// wires UI/keyboard input to actions. The only module that knows about both
// the sim and the view.
// ============================================================
import { createGame, step } from "./sim.js";
import { toggleUnit } from "./actions.js";
import { render, buildUnits, showEndGame, clearEndGame } from "./render.js";

const $ = id => document.getElementById(id);
let S, last = 0, ended = false;

// toggle a unit then repaint (actions never touch the DOM themselves)
function act(id){ toggleUnit(S, id); render(S); }

function boot(){
  S = createGame();
  buildUnits(S, act);
  ended = false;
  render(S);
}
function restart(){
  clearEndGame();
  S = createGame();
  buildUnits(S, act);
  ended = false; last = 0;
  S.running = true;
  render(S);
}

// ---- main loop: step + repaint only while the shift is live; title / paused /
// dead screens are painted once by their handlers, so the loop idles cheaply.
function frame(now){
  if (!last) last = now;
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.1); // clamp big gaps (tab switch)
  if (S.running && !S.paused && !S.over){
    const justEnded = step(S, dt);
    if (justEnded && !ended){ ended = true; render(S); showEndGame(S, restart); }
    else render(S);
  }
  requestAnimationFrame(frame);
}

// ---- wiring ----
boot();
$("startBtn").onclick = () => { if (!S.running){ S.running = true; S.paused = false; last = 0; } };
$("pauseBtn").onclick = () => { if (S.running && !S.over){ S.paused = !S.paused; render(S); } };
window.addEventListener("keydown", e => {
  if (e.code === "Space"){ e.preventDefault(); if (S.running && !S.over){ S.paused = !S.paused; render(S); } return; }
  const k = e.key.toLowerCase();
  if (k === "1") act("pk1"); else if (k === "2") act("pk2");
  else if (k === "3") act("pk3"); else if (k === "b") act("bat");
});
window.addEventListener("resize", () => { if (S) render(S); });
requestAnimationFrame(frame);
