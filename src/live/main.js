// ============================================================
// LIVE ENTRY POINT — owns the live game state, runs the real-time loop, wires
// input to actions, and drives screen navigation: Home ⇄ Skills / How-to, and
// Home → Run → end screen → Home. Skills is reachable only from Home, so
// opening it never disturbs a run.
// ============================================================
import { createGame, step } from "./sim.js";
import { toggleUnit, buildCapacity, upgradeUnit, serviceUnit, decommissionUnit, setRdFunding, researchNode, setHedge, hedgeContract, acceptOffer, declineOffer, borrow, repay } from "./actions.js";
import { makeRng } from "./rng.js";
import { commitCreditStanding } from "./finance.js";
import { render, buildUnits, showEndGame, clearEndGame, renderManage, hideManage, renderMeta, renderHome, renderMutatorBanner } from "./render.js";
import { scoreRun, currencyFor, buySkill, buyUnlock } from "./meta.js";
import { rollMutators } from "./mutators.js";
import { loadProfile, saveProfile } from "./persist.js";

const $ = id => document.getElementById(id);
const profile = loadProfile();
let S, last = 0, ended = false, page = null; // page: null = live HUD; else the open manage page

// ---- screen navigation ----
const OVERLAYS = ["homeOverlay", "metaOverlay", "howtoOverlay", "menuOverlay", "overlay"];
function hideAll(){ OVERLAYS.forEach(id => $(id).classList.remove("on")); }
function showHome(){ hideAll(); $("vignette").style.opacity = "0"; renderHome(profile, homeActions); }
function showSkills(){ hideAll(); renderMeta(profile, meta); }
function showHowto(){ hideAll(); $("howtoOverlay").classList.add("on"); }

const homeActions = { start: () => startRun(), skills: showSkills, howto: showHowto };
const meta = {
  buy(id){ if (buySkill(profile, id)){ saveProfile(profile); renderMeta(profile, meta); } },
  unlock(id){ if (buyUnlock(profile, id)){ saveProfile(profile); renderMeta(profile, meta); } },
  back: showHome,
};

// toggle a unit then repaint (actions never touch the DOM themselves)
function act(id){ toggleUnit(S, id); render(S); }

// re-paint the currently open manage page (after an action or a nav)
function refreshPage(){ if (page) renderManage(S, page, menu); }

// manage mode (opens paused): hub-and-spoke navigation + per-page actions
const menu = {
  build(tech){ buildCapacity(S, tech); buildUnits(S, act); refreshPage(); render(S); },
  upgrade(id){ upgradeUnit(S, id); buildUnits(S, act); refreshPage(); render(S); },
  service(id){ serviceUnit(S, id); refreshPage(); render(S); },
  decommission(id){ decommissionUnit(S, id); buildUnits(S, act); refreshPage(); render(S); },
  research(id){ researchNode(S, id); refreshPage(); render(S); },
  setFunding(v){ setRdFunding(S, v); }, // readout updates in-place; no re-render (keeps slider drag)
  setHedge(v){ setHedge(S, v); },       // hedge dial drag; readout in-place, no re-render
  hedge(term){ hedgeContract(S, term); refreshPage(); render(S); },
  accept(){ acceptOffer(S); refreshPage(); render(S); },
  decline(){ declineOffer(S); refreshPage(); render(S); },
  borrow(amt){ borrow(S, amt); refreshPage(); render(S); },
  repay(amt){ repay(S, amt); refreshPage(); render(S); },
  go(p){ page = p; refreshPage(); },
  close(){ S.menuOpen = false; page = null; hideManage(); last = 0; render(S); },
};
function openManage(){ if (S.over) return; S.menuOpen = true; page = "hub"; refreshPage(); }

// ---- run lifecycle ----
function startRun(){
  hideAll(); clearEndGame();
  S = createGame(profile.skills, profile.researchUnlocked, rollMutators(), profile.credit?.standing); // roll mutators; carry credit standing
  const seed = Date.now() >>> 0; S.seed = seed; S.rng = makeRng(seed); // v4: seeded economic RNG, replayable from the seed
  buildUnits(S, act);
  renderMutatorBanner(S);
  ended = false; last = 0;
  S.running = true;
  render(S);
}
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
  commitCreditStanding(profile, S); // v4 (C): write the run's credit standing back (the only credit writer)
  saveProfile(profile);
  showEndGame(S, { score: res.score, earned, best: prevBest }, { replay: () => startRun(), home: showHome });
}

// ---- main loop: step + repaint only while the shift is live ----
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
S = createGame(profile.skills, profile.researchUnlocked); buildUnits(S, act); render(S); renderMutatorBanner(S); // a game to paint behind the home screen
showHome();
$("manageBtn").onclick = () => openManage();
$("pauseBtn").onclick = () => { if (S.running && !S.over){ S.paused = !S.paused; render(S); } };
$("howtoBack").onclick = showHome;
const HUB_KEYS = { "1": "fleet", "2": "build", "3": "research", "4": "desk" };
window.addEventListener("keydown", e => {
  if (e.code === "Space"){ e.preventDefault(); if (S.running && !S.over && !S.menuOpen){ S.paused = !S.paused; render(S); } return; }
  if (S.menuOpen){ // manage-mode navigation: Esc = back, 1–4 jump from the hub
    if (e.key === "Escape"){ e.preventDefault(); if (page && page !== "hub") menu.go("hub"); else menu.close(); }
    else if (page === "hub" && HUB_KEYS[e.key]) menu.go(HUB_KEYS[e.key]);
    return; // swallow dispatch keys while managing
  }
  if (!S.running || S.over) return; // dispatch keys only during live play
  const k = e.key.toLowerCase();
  if (k === "1") act("pk1"); else if (k === "2") act("pk2");
  else if (k === "3") act("pk3"); else if (k === "b") act("bat");
});
window.addEventListener("resize", () => { if (S) render(S); });
requestAnimationFrame(frame);
