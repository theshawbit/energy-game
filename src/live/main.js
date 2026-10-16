// ============================================================
// LIVE ENTRY POINT — owns the live game state, runs the real-time loop, wires
// UI/keyboard input to actions, and bridges the cross-run meta layer (scoring,
// meta-currency, the skill tree, and localStorage persistence).
// ============================================================
import { createGame, step } from "./sim.js";
import { toggleUnit, buildCapacity, upgradeUnit, serviceUnit } from "./actions.js";
import { render, buildUnits, showEndGame, clearEndGame, renderMenu, hideMenu, renderMeta, hideMeta } from "./render.js";
import { scoreRun, currencyFor, buySkill } from "./meta.js";
import { loadProfile, saveProfile } from "./persist.js";

const $ = id => document.getElementById(id);
const profile = loadProfile();
let S, last = 0, ended = false;

// toggle a unit then repaint (actions never touch the DOM themselves)
function act(id){ toggleUnit(S, id); render(S); }

// manage-grid menu (opens paused): build / upgrade / service, then refresh
const menu = {
  build(tech){ buildCapacity(S, tech); buildUnits(S, act); renderMenu(S, menu); render(S); },
  upgrade(id){ upgradeUnit(S, id); buildUnits(S, act); renderMenu(S, menu); render(S); },
  service(id){ serviceUnit(S, id); renderMenu(S, menu); render(S); },
  closeMenu(){ S.menuOpen = false; hideMenu(); last = 0; render(S); },
};
function openMenu(){ if (S.over) return; S.menuOpen = true; renderMenu(S, menu); }

// skill tree (between runs): buy permanent upgrades, then start a fresh run
const meta = {
  buy(id){ if (buySkill(profile, id)){ saveProfile(profile); renderMeta(profile, meta); } },
  start(){ hideMeta(); restart(); },
};
function openMeta(){ renderMeta(profile, meta); }

// end of run: score it, bank meta-currency, update the best record, persist
function endRun(){
  const res = scoreRun(S);
  const earned = currencyFor(res.score);
  const prevBest = { ...profile.best };
  profile.currency += earned;
  profile.best = {
    days: Math.max(prevBest.days || 0, res.days),
    score: Math.max(prevBest.score || 0, res.score),
    peak: Math.max(prevBest.peak || 0, S.peak),
  };
  saveProfile(profile);
  showEndGame(S, { score: res.score, earned, best: prevBest }, { skills: openMeta, restart });
}

function boot(){ S = createGame(profile.skills); buildUnits(S, act); ended = false; render(S); }
function restart(){
  clearEndGame(); hideMenu(); hideMeta();
  S = createGame(profile.skills);
  buildUnits(S, act);
  ended = false; last = 0;
  S.running = true;
  render(S);
}

// ---- main loop: step + repaint only while the shift is live (not paused, not
// in a menu). Other screens are painted once by their handlers.
function frame(now){
  if (!last) last = now;
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.1);
  if (S.running && !S.paused && !S.menuOpen && !S.over){
    const justEnded = step(S, dt);
    if (justEnded && !ended){ ended = true; render(S); endRun(); }
    else render(S);
  }
  requestAnimationFrame(frame);
}

// ---- wiring ----
boot();
$("startBtn").onclick = () => { if (!S.running){ S.running = true; S.paused = false; last = 0; } };
$("pauseBtn").onclick = () => { if (S.running && !S.over){ S.paused = !S.paused; render(S); } };
$("manageBtn").onclick = () => openMenu();
$("skillsBtn").onclick = () => openMeta();
window.addEventListener("keydown", e => {
  if (e.code === "Space"){ e.preventDefault(); if (S.running && !S.over && !S.menuOpen){ S.paused = !S.paused; render(S); } return; }
  if (S.menuOpen) return; // dispatch keys are inert while planning
  const k = e.key.toLowerCase();
  if (k === "1") act("pk1"); else if (k === "2") act("pk2");
  else if (k === "3") act("pk3"); else if (k === "b") act("bat");
});
window.addEventListener("resize", () => { if (S) render(S); });
requestAnimationFrame(frame);
