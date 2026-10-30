// ============================================================
// LIVE ENTRY POINT (v5) — owns the persistent-grid state, runs the real-time
// loop, wires input to actions, and drives screen navigation: Home ⇄ Skills /
// How-to, and Home → the persistent grid. There is NO run end — the grid is
// persistent. Completing a quarter pauses into the Planning Office (a stub this
// phase) and resumes into the next quarter.
// ============================================================
import { createGame, step, setTicker, beginNextQuarter } from "./sim.js";
import { toggleUnit, specializeUnit, raiseAxisCeiling, buyPerk, pinUnit, decommissionUnit, setRdFunding, researchNode, setHedge, hedgeContract, cancelContract, acceptOffer, declineOffer, borrow, repay, takeCapacityObligation, dropCapacityObligation } from "./actions.js";
import { scheduleTask, cancelTask } from "./maint.js";
import { rollRegime, regimeMods } from "./events.js";
import { triggerLoadShed, triggerDemandResponse } from "./crisis.js";
import { promote, hireCrew } from "./crews.js";
import { commitBuild } from "./construct.js";
import { setSpeed } from "./clock.js";
import { CFG } from "./config.js";
import { makeRng } from "./rng.js";
import { rollSpecialOffer } from "./offers.js";
import { render, buildUnits, renderManage, hideManage, renderMeta, renderHome, renderMutatorBanner, renderPlanning, hidePlanning } from "./render.js";
import { buySkill, buyUnlock, buyEconomyUnlock } from "./meta.js";
import { loadProfile, saveProfile } from "./persist.js";

const $ = id => document.getElementById(id);
const profile = loadProfile();
let S, last = 0, page = null, planningOpen = false; // page: null = live HUD; else the open manage page

// ---- screen navigation ----
const OVERLAYS = ["homeOverlay", "metaOverlay", "howtoOverlay", "menuOverlay", "overlay"];
function hideAll(){ OVERLAYS.forEach(id => $(id).classList.remove("on")); }
function showHome(){ hideAll(); $("vignette").style.opacity = "0"; renderHome(profile, homeActions); }
function showSkills(){ hideAll(); renderMeta(profile, meta); }
function showHowto(){ hideAll(); $("howtoOverlay").classList.add("on"); }

const homeActions = { start: () => startGame(), skills: showSkills, howto: showHowto };
const meta = {
  buy(id){ if (buySkill(profile, id)){ saveProfile(profile); renderMeta(profile, meta); } },
  unlock(id){ if (buyUnlock(profile, id)){ saveProfile(profile); renderMeta(profile, meta); } },
  economy(id){ if (buyEconomyUnlock(profile, id)){ saveProfile(profile); renderMeta(profile, meta); } },
  back: showHome,
};

// toggle a unit then repaint (actions never touch the DOM themselves)
function act(id){ toggleUnit(S, id); render(S); }

// re-paint the currently open manage page (after an action or a nav)
function refreshPage(){ if (page) renderManage(S, page, menu); }

// a buyer may call at each new day (null unless the Rolodex economy unlock is owned)
function rollDailyOffer(){
  if (S.pendingOffer && S.day >= S.pendingOffer.expiresDay) S.pendingOffer = null;
  const offer = rollSpecialOffer(S, S.rng || Math.random);
  if (offer){ S.pendingOffer = offer; setTicker(S, `☎ ${offer.buyerName} is offering ${offer.mw} MW for ${offer.termDays} days — see the Desk.`); }
}

// manage mode (opens paused): hub-and-spoke navigation + per-page actions
const menu = {
  decommission(id){ decommissionUnit(S, id); buildUnits(S, act); refreshPage(); render(S); },
  // v5 Phase 7: pin a plant against Dispatch Assist (fleet page toggle).
  pin(id){ pinUnit(S, id); refreshPage(); render(S); },
  // v5 Phase 2 dials: commit re-renders the page (band/push enable with it); the
  // sliders write u.dials live without a page rebuild so the drag stays smooth.
  commit(id){ const u = S.fleet.find(x => x.id === id); if (u && u.dials){ u.dials.commit = !u.dials.commit; } refreshPage(); render(S); },
  setDial(id, key, val){ const u = S.fleet.find(x => x.id === id); if (u && u.dials){ u.dials[key] = val; } render(S); },
  research(id){ researchNode(S, id); refreshPage(); render(S); },
  setFunding(v){ setRdFunding(S, v); }, // readout updates in-place; no re-render (keeps slider drag)
  setHedge(v){ setHedge(S, v); },       // hedge dial drag; readout in-place, no re-render
  hedge(term){ hedgeContract(S, term); refreshPage(); render(S); },
  cancelContract(id){ cancelContract(S, id); refreshPage(); render(S); },
  accept(){ acceptOffer(S); refreshPage(); render(S); },
  decline(){ declineOffer(S); refreshPage(); render(S); },
  borrow(amt){ borrow(S, amt); refreshPage(); render(S); },
  repay(amt){ repay(S, amt); refreshPage(); render(S); },
  takeCapacity(){ takeCapacityObligation(S); refreshPage(); render(S); },
  dropCapacity(){ dropCapacityObligation(S); refreshPage(); render(S); },
  go(p){ page = p; refreshPage(); },
  close(){ S.menuOpen = false; page = null; hideManage(); last = 0; render(S); },
};
function openManage(){ if (S.calendar.mode !== "operating") return; S.menuOpen = true; page = "hub"; refreshPage(); }

// ---- speed control (v5): pause is a read-only hold (clock speed 0); fast-forward
// skips calm hours. Both only act during the live day (not the planning beat). ----
let fastMode = false;
function applySpeed(){ setSpeed(S, S.paused ? 0 : (fastMode ? CFG.v5.fastSpeed : 1)); }
function togglePause(){ if (S.calendar.mode !== "operating") return; S.paused = !S.paused; applySpeed(); render(S); }
function toggleFast(){ if (S.calendar.mode !== "operating" || S.paused) return; fastMode = !fastMode; applySpeed(); render(S); }

// ---- the persistent grid ----
function startGame(){
  hideAll(); planningOpen = false; fastMode = false;
  // v5 Phase 8: the per-run mutator roll is retired — the seasonal event regime (rolled
  // just below, re-rolled each quarter) now drives the weather/demand/fuel bias instead.
  S = createGame(profile.skills, profile.researchUnlocked, [], profile.credit?.standing, profile.economyUnlocked); // carry skills + unlocks + credit
  const seed = Date.now() >>> 0; S.seed = seed; S.rng = makeRng(seed); // v4: seeded economic RNG
  S.rngForecast = makeRng((seed ^ 0xF0) >>> 0); // separate stream so forecast sharpening never desyncs realized spot
  S.rngDemand = makeRng((seed ^ 0xD3) >>> 0);   // v5.1 Phase 1: daily demand-noise stream, isolated from the economy
  // v5 Phase 8: deal the opening quarter's seasonal regime and let it drive the per-tick
  // mods (supersedes the one-shot mutator roll); the rollover re-rolls it each quarter.
  rollRegime(S, S.rng); S.mmods = regimeMods(S);
  S.bestRecords = profile.records; // read-only mirror for the hub scorecard
  S.paused = false; applySpeed();
  buildUnits(S, act);
  renderMutatorBanner(S);
  last = 0;
  S.running = true;
  render(S);
}

// quarter-end Planning Office: maintenance triage (assign crews to per-KPI tasks),
// crew roster (promote with ⚡, hire with cash), then begin the next quarter. Each
// action mutates S and repaints the office in place; `begin` resumes the live day.
const planningActions = {
  schedule(unitId, axis, crewId){ scheduleTask(S, unitId, axis, crewId); renderPlanning(S, planningActions); },
  cancelTask(taskId){ cancelTask(S, taskId); renderPlanning(S, planningActions); },
  promote(crewId){ promote(S, crewId); renderPlanning(S, planningActions); },
  hire(trade){ hireCrew(S, trade); renderPlanning(S, planningActions); },
  commitBuild(tech){ commitBuild(S, tech); renderPlanning(S, planningActions); },
  // v5 Phase 7: progression — spend cash to specialize a plant's axis, RP to lift a tech
  // family's axis ceiling, ⚡ to unlock a perk. All three repaint the office in place.
  specialize(unitId, axis){ specializeUnit(S, unitId, axis); renderPlanning(S, planningActions); },
  raiseCeiling(tech, axis){ raiseAxisCeiling(S, tech, axis); renderPlanning(S, planningActions); },
  perk(perkId){ buyPerk(S, perkId); renderPlanning(S, planningActions); },
  begin(){ beginNextQuarter(S); hidePlanning(); planningOpen = false; S.paused = false; fastMode = false; last = 0; buildUnits(S, act); render(S); },
};

// ---- main loop: step + repaint while the shift is live; the quarter-end beat
// opens the Planning Office and waits for the player to begin the next quarter ----
function frame(now){
  if (!last) last = now;
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.1);
  if (S.running && !S.menuOpen){
    if (S.calendar.mode === "planning"){
      if (!planningOpen){ planningOpen = true; renderPlanning(S, planningActions); }
    } else {
      const dayBefore = S.day;
      step(S, dt); // no-ops while paused (clock speed 0); never ends
      if (S.day !== dayBefore && S.calendar.mode === "operating") rollDailyOffer();
      render(S);
    }
  }
  requestAnimationFrame(frame);
}

// ---- wiring ----
S = createGame(profile.skills, profile.researchUnlocked); buildUnits(S, act); render(S); renderMutatorBanner(S); // a game to paint behind the home screen
showHome();
$("manageBtn").onclick = () => openManage();
$("pauseBtn").onclick = togglePause;
$("ffBtn").onclick = toggleFast;
$("howtoBack").onclick = showHome;
const HUB_KEYS = { "1": "fleet", "2": "build", "3": "research", "4": "desk" };
window.addEventListener("keydown", e => {
  if (e.code === "Space"){ e.preventDefault(); if (S.running && !S.menuOpen && S.calendar.mode === "operating") togglePause(); return; }
  if (S.menuOpen){ // manage-mode navigation: Esc = back, 1–4 jump from the hub
    if (e.key === "Escape"){ e.preventDefault(); if (page && page !== "hub") menu.go("hub"); else menu.close(); }
    else if (page === "hub" && HUB_KEYS[e.key]) menu.go(HUB_KEYS[e.key]);
    return; // swallow dispatch keys while managing
  }
  if (!S.running || S.calendar.mode !== "operating") return; // dispatch keys only during the live day
  const k = e.key.toLowerCase();
  if (k === "1") act("pk1"); else if (k === "2") act("pk2");
  else if (k === "3") act("pk3"); else if (k === "b") act("bat");
});
// v5 Phase 8: crisis toolkit — a delegated listener on the crisis bar (buttons are
// rebuilt by render only when state changes, so binding here once survives the repaints).
$("crisisBar").addEventListener("click", e => {
  if (!S.running || S.calendar.mode !== "operating") return;
  const shed = e.target.closest("[data-shed]");
  if (shed){ triggerLoadShed(S, shed.dataset.shed); render(S); return; }
  if (e.target.closest("[data-dr]")){ triggerDemandResponse(S); render(S); }
});
window.addEventListener("resize", () => { if (S) render(S); });
requestAnimationFrame(frame);
