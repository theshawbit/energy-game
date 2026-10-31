// ============================================================
// LIVE ENTRY POINT (v5) — owns the persistent-grid state, runs the real-time
// loop, wires input to actions, and drives screen navigation: Home ⇄ Skills /
// How-to, and Home → the persistent grid. There is NO run end — the grid is
// persistent. Completing a quarter pauses into the Planning Office (a stub this
// phase) and resumes into the next quarter.
// ============================================================
import { createGame, step, setTicker, beginNextQuarter } from "./sim.js";
import { toggleUnit, specializeUnit, buyPerk, pinUnit, decommissionUnit, setRdFunding, researchNode, setHedge, hedgeContract, cancelContract, acceptOffer, declineOffer, borrow, repay, takeCapacityObligation, dropCapacityObligation } from "./actions.js";
import { queueMaint, cancelTask } from "./maint.js";
import { rollRegime, regimeMods } from "./events.js";
import { triggerLoadShed, triggerDemandResponse } from "./crisis.js";
import { promote, hireCrew } from "./crews.js";
import { commitBuild } from "./construct.js";
import { setSpeed, pacePlan } from "./clock.js";
import { closeBrief } from "./brief.js";
import { CFG } from "./config.js";
import { makeRng } from "./rng.js";
import { rollSpecialOffer } from "./offers.js";
import { render, buildUnits, renderManage, hideManage, renderMeta, renderHome, renderMutatorBanner, renderPlanning, hidePlanning, renderCollapse, hideCollapse, renderBrief, hideBrief, renderPlantDetail, hidePlantDetail } from "./render.js";
import { buySkill, buyUnlock, buyEconomyUnlock, awardCurrency } from "./meta.js";
import { loadProfile, saveProfile, restartRun } from "./persist.js";

const $ = id => document.getElementById(id);
const profile = loadProfile();
let S, last = 0, page = null, planningOpen = false, collapseOpen = false, briefOpen = false; // page: null = live HUD; else the open manage page

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

// v5.1 Phase 7: the per-plant upgrade drill-down (opened by a fleet row's ⚙). Holds the open
// plant id so a queued upgrade re-renders the panel in place; Close returns to the live grid.
let plantOpen = null;
function openPlant(id){ plantOpen = id; renderPlantDetail(S, id, plantActions); }
const plantActions = {
  upgrade(unitId, axis){ specializeUnit(S, unitId, axis); renderPlantDetail(S, unitId, plantActions); },
  close(){ plantOpen = null; hidePlantDetail(); render(S); },
};

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
  decommission(id){ decommissionUnit(S, id); buildUnits(S, act, openPlant); refreshPage(); render(S); },
  // v5 Phase 7: pin a plant against Dispatch Assist (fleet page toggle).
  pin(id){ pinUnit(S, id); refreshPage(); render(S); },
  // v5.3 Phase 1: commit is the only dispatch dial left; toggling it re-renders the page.
  commit(id){ const u = S.fleet.find(x => x.id === id); if (u && u.dials){ u.dials.commit = !u.dials.commit; } refreshPage(); render(S); },
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
// v5.2 Phase 2: while auto-pace is armed (S.autoPace) it drives the live speed each frame
// (fast-forward calm, 1× when something's happening). Any MANUAL speed change sets paceHeld,
// which stands auto-pace down until the next day boundary — the player keeps the wheel.
let paceHeld = false;
function applySpeed(){ setSpeed(S, S.paused ? 0 : (fastMode ? CFG.v5.fastSpeed : 1)); }
function togglePause(){ if (S.calendar.mode !== "operating") return; S.paused = !S.paused; paceHeld = true; applySpeed(); render(S); }
function toggleFast(){ if (S.calendar.mode !== "operating" || S.paused) return; fastMode = !fastMode; paceHeld = true; applySpeed(); render(S); }

// Seed a fresh grid's live RNG streams + opening seasonal regime (shared by a new game and
// the roguelite restart). v5 Phase 8: the per-run mutator roll is retired — the seasonal
// event regime drives the weather/demand/fuel bias, re-rolled each quarter.
function seedRun(){
  const seed = Date.now() >>> 0; S.seed = seed; S.rng = makeRng(seed); // v4: seeded economic RNG
  S.rngForecast = makeRng((seed ^ 0xF0) >>> 0); // separate stream so forecast sharpening never desyncs realized spot
  S.rngDemand = makeRng((seed ^ 0xD3) >>> 0);   // v5.1 Phase 1: daily demand-noise stream, isolated from the economy
  S.rngEnv = makeRng((seed ^ 0xE4) >>> 0);       // v5.3 Phase 2 (M10): env stream (weather/jitter/spike/trip), isolated from the economy — a logged seed replays the real volatile game
  rollRegime(S, S.rng); S.mmods = regimeMods(S); // deal the opening quarter's regime
  S.bestRecords = profile.records;               // read-only mirror for the hub scorecard
  S.briefEnabled = true;                         // v5.1 Phase 5: arm the daily brief for this session (headless stays off)
  S.autoAdvance = true;
  S.autoPace = true;                             // v5.2 Phase 2: arm auto-pace (fast-forward calm / 1× on events)
  S.zap = profile.currency || 0;                 // v5.1 Phase 6: ⚡ is ONE pool — the run spends the profile's banked currency
}

// ---- the persistent grid ----
function startGame(){
  hideAll(); hideCollapse(); hideBrief(); hidePlantDetail(); plantOpen = null; planningOpen = false; collapseOpen = false; briefOpen = false; fastMode = false; paceHeld = false;
  S = createGame(profile.skills, profile.researchUnlocked, [], profile.credit?.standing, profile.economyUnlocked); // carry skills + unlocks + credit
  seedRun();
  S.paused = false; applySpeed();
  buildUnits(S, act, openPlant);
  renderMutatorBanner(S);
  last = 0;
  S.running = true;
  render(S);
}

// v5.1 Phase 2: the roguelite restart — bank this run's records into the profile, discard the
// collapsed grid, and start fresh (profile's banked ⚡/skills/credit carry over). Fired from
// the grid-collapse end screen.
function restartGame(){
  S = restartRun(S, profile);
  seedRun();
  hideCollapse(); hideBrief(); hidePlantDetail(); plantOpen = null; planningOpen = false; collapseOpen = false; briefOpen = false; fastMode = false; paceHeld = false;
  S.paused = false; applySpeed();
  buildUnits(S, act, openPlant);
  renderMutatorBanner(S);
  last = 0;
  S.running = true;
  render(S);
}

// v5.1 Phase 6: ⚡ is ONE pool. The run spends S.zap (crew promotions, perks); after any spend
// write the remainder back to the profile so the banked balance always reflects it. The quarter
// rollover mints fresh ⚡ from the KPI scorecard into the profile (awardCurrency — meta.js's only
// faucet), then re-mirrors it onto S.zap so the new quarter can spend what it just earned. Banking
// is guarded to fire ONCE per quarter (planningOpen latches it) and records the verdict it paid.
function syncZap(){ profile.currency = S.zap; saveProfile(profile); }
function bankQuarterMint(){
  const v = S.economy?.lastVerdict;
  if (!v || v.minted) return;                    // nothing to bank, or already banked this quarter
  awardCurrency(profile, v.mintTotal || 0);      // KPI scorecard → profile.currency
  v.minted = true;                               // latch so a repaint can't double-bank
  S.zap = profile.currency;                      // the run spends the freshly banked pool
  saveProfile(profile);
}

// quarter-end Planning Office: maintenance triage (assign crews to per-KPI tasks),
// crew roster (promote with ⚡, hire with cash), then begin the next quarter. Each
// action mutates S and repaints the office in place; `begin` resumes the live day.
const planningActions = {
  schedule(unitId, axis, crewId){ queueMaint(S, unitId, axis, crewId); renderPlanning(S, planningActions); },
  cancelTask(taskId){ cancelTask(S, taskId); renderPlanning(S, planningActions); },
  promote(crewId){ promote(S, crewId); syncZap(); renderPlanning(S, planningActions); },
  hire(trade){ hireCrew(S, trade); renderPlanning(S, planningActions); },
  commitBuild(tech){ commitBuild(S, tech); renderPlanning(S, planningActions); },
  // v5.1 Phase 3: progression — queue a cash upgrade on a plant's axis (rolling contractor
  // line), or ⚡ to unlock a perk. Both repaint the office in place.
  specialize(unitId, axis){ specializeUnit(S, unitId, axis); renderPlanning(S, planningActions); },
  perk(perkId){ buyPerk(S, perkId); syncZap(); renderPlanning(S, planningActions); },
  begin(){ beginNextQuarter(S); hidePlanning(); planningOpen = false; S.paused = false; fastMode = false; paceHeld = false; last = 0; buildUnits(S, act, openPlant); render(S); },
};

// v5.1 Phase 5: the daily brief — the blocking-but-skippable daily beat. Quick-add buttons
// route to the SAME rolling-queue functions as the Planning Office (maintenance → queueMaint,
// upgrades → specializeUnit/queueUpgrade); builds are surfaced but committed only at the review.
// "Advance" re-arms auto-skip; "Step a day" leaves it off so the next boundary reopens the brief.
function leaveBrief(){ hideBrief(); briefOpen = false; S.paused = false; fastMode = false; paceHeld = false; applySpeed(); last = 0; render(S); }
const briefActions = {
  schedule(unitId, axis, crewId){ queueMaint(S, unitId, axis, crewId); renderBrief(S, briefActions); },
  cancelTask(taskId){ cancelTask(S, taskId); renderBrief(S, briefActions); },
  specialize(unitId, axis){ specializeUnit(S, unitId, axis); renderBrief(S, briefActions); },
  advance(){ S.autoAdvance = true; closeBrief(S); leaveBrief(); },  // re-arm auto-skip
  step(){ S.autoAdvance = false; closeBrief(S); leaveBrief(); },    // hands-on: reopen next boundary
};

// ---- main loop: step + repaint while the shift is live; the quarter-end beat
// opens the Planning Office and waits for the player to begin the next quarter ----
function frame(now){
  if (!last) last = now;
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.1);
  if (S.running && !S.menuOpen){
    if (S.over){
      // v5.1 Phase 2: the run collapsed — freeze the loop and show the end screen once.
      if (!collapseOpen){ collapseOpen = true; render(S); renderCollapse(S, { restart: restartGame }); }
    } else if (S.calendar.mode === "planning"){
      if (!planningOpen){ planningOpen = true; bankQuarterMint(); renderPlanning(S, planningActions); }
    } else if (S.calendar.mode === "brief"){
      // v5.1 Phase 5: the daily brief opened (surviveDay flipped the mode on an exception or a
      // hands-on day). Paint it once and wait for the player to advance / step the day.
      if (!briefOpen){ briefOpen = true; renderBrief(S, briefActions); }
    } else {
      const dayBefore = S.day;
      // v5.2 Phase 2: auto-pace drives the default speed — fast-forward calm hours, drop to
      // 1× the moment something needs watching. It stands down while the player holds manual
      // control (paceHeld), has manually paused, or a crisis autoPause is active (the player
      // resolves that). A manual speed set earlier this day is cleared at the boundary below.
      if (S.autoPace && !paceHeld && !S.paused && !S.clock.autoPaused) setSpeed(S, pacePlan(S).speed);
      step(S, dt); // no-ops while paused (clock speed 0); never ends
      if (S.day !== dayBefore && S.calendar.mode === "operating"){ paceHeld = false; rollDailyOffer(); }
      render(S);
    }
  }
  requestAnimationFrame(frame);
}

// ---- wiring ----
S = createGame(profile.skills, profile.researchUnlocked); buildUnits(S, act, openPlant); render(S); renderMutatorBanner(S); // a game to paint behind the home screen
showHome();
$("manageBtn").onclick = () => openManage();
$("pauseBtn").onclick = togglePause;
$("ffBtn").onclick = toggleFast;
$("howtoBack").onclick = showHome;
const HUB_KEYS = { "1": "fleet", "2": "build", "3": "research", "4": "desk" };
window.addEventListener("keydown", e => {
  // v5.1 Phase 7: the per-plant drill-down closes on Escape (it opens over the live grid).
  if (plantOpen && e.key === "Escape"){ e.preventDefault(); plantActions.close(); return; }
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
