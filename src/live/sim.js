// ============================================================
// LIVE SIM — game state and the per-tick simulation. Mutates a state object
// `S`; no DOM. Each tick clears the market through the shared, verified
// dispatchHour() engine (one source of dispatch truth with the batch game);
// the real-time mechanics (outages, strain, brownout/blackout) are new here.
//
// step() never touches the DOM and never ends (v5: the grid is persistent — no
// game-over). A shortfall or insolvency inflicts pain (strain, fines, cratered
// credit) but the loop keeps running; the view layer reacts to that state.
// ============================================================
import { DEMAND_SHAPE } from "../constants.js";
import { dispatchHour } from "../engine.js";
import { CFG, makeFleet, dialSnapshot } from "./config.js";
import { makeCrew, wageBill, TRADES } from "./crews.js";
import { tickMaint } from "./maint.js";
import { autoMaintenancePlan, dispatchAssist } from "./progression.js";
import { tickBuilds } from "./construct.js";
import { freshCalendar, advanceCalendar } from "./calendar.js";
import { freshClock, tickClock, autoPause } from "./clock.js";
import { applyDials, cycleCost } from "./dispatch.js";
import { degradeKPIs, freshKPIs, heatRateMult } from "./kpi.js";
import { computeMods, effPeakGrowth, newMilestones, CLEAN_TECHS } from "./meta.js";
import { stepDemand, rollQuarterPeak } from "./demand.js"; // v5.1 Phase 1: hybrid demand curve
import { computeResearchMods } from "./research.js";
import { computeMutatorMods } from "./mutators.js";
import { rollRegime, regimeMods } from "./events.js";
import { tickCrisis, activeShedMW, activeDrShave } from "./crisis.js";
import { freshStability, tickStability, applyVerdictToStability } from "./stability.js"; // v5.1 Phase 2: fail-state HP bar
import { tickContractor } from "./contractor.js"; // v5.1 Phase 3: rolling upgrade queue
import { shouldInterrupt, openBrief } from "./brief.js"; // v5.1 Phase 5: the daily brief gate
import { exogenousBaseline, reserveMargin, spotPrice, swingCoeff, swingEarn } from "./market.js";
import { settleContracts, expireContracts, creditRating, interestFor, creditTick, isInsolvent, triggerDefault } from "./finance.js";
import { forecastFog, forecastInputs } from "./forecast.js";
import { capacityPayment, capacityPenalty, rollCapacityCall, floorEarn } from "./capacity.js";
import { freshQuarterLog, freshEconomy, settleQuarter, applyVerdict } from "./verdict.js";

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function freshWeather(){ return { sun: rand(0.7, 1.05), wind: rand(0.6, 1.25) }; }

// linear interpolation around the 24h shape arrays
export function interp(arr, t){
  const h = ((t % 24) + 24) % 24, i = Math.floor(h), f = h - i;
  return arr[i] * (1 - f) + arr[(i + 1) % 24] * f;
}

// `mutators` is the rolled per-run mutator id list — supplied by the caller
// (main.js rolls it at run start) so createGame itself stays deterministic.
export function createGame(skills = {}, researchUnlocked = {}, mutators = [], creditStanding = CFG.creditStart, economyUnlocked = {}, maxRunDays = CFG.run.baseDays){
  const mods = computeMods(skills);
  const fleet = makeFleet();
  // monotonic per-tech counter for naming built units, so numbers are never
  // reused after a decommission (which would duplicate a card label).
  const techCount = {};
  for (const u of fleet) techCount[u.tech] = (techCount[u.tech] || 0) + 1;
  for (const u of fleet) if (u.condition != null) u.ageHours = 0; // v4.2.1: fresh iron

  const bat = fleet.find(u => u.id === "bat");
  if (bat && mods.battMult !== 1){
    bat.cap = Math.round(bat.cap * mods.battMult);
    bat.maxEnergy = Math.round(bat.maxEnergy * mods.battMult);
    bat.energy = bat.maxEnergy;
  }
  return {
    running:false, paused:false, menuOpen:false,
    // v5: the persistent grid — Year▸Quarter▸Day calendar + variable clock. No run
    // ever ends, so there is no over/won/maxRunDays (failure is stagnation). S.day
    // stays as the monotonic demand clock and mirrors S.calendar.absDay.
    calendar:freshCalendar(), clock:freshClock(),
    // v5.1 Phase 1: the hybrid demand curve. peak = live daily peak (baseline × daily noise);
    // quarterPeak = the plannable baseline that steps at each rollover; peakGrowthMult carries the
    // meta efficiency skill (≤1 slows growth) into the quarterly step. Day 1 peak == baseline.
    t:CFG.startHour, day:1, peak:CFG.startPeak, quarterPeak:CFG.startPeak,
    nextQuarterPeak:Math.round(CFG.startPeak * (1 + CFG.v5_1.demand.stepFrac * (mods.peakGrowthMult ?? 1))),
    peakGrowthMult:mods.peakGrowthMult,
    cash:CFG.startCash + mods.startCashBonus, satisfaction:100, strain:0,
    carbon:0, co2:0, co2Total:0, mods, milestonesHit:[],
    rp:0, rdFunding:0, research:{}, rmods:computeResearchMods({}), // in-run research (v3)
    researchUnlocked: { ...researchUnlocked },                     // meta-unlocked branches (read-only this run)
    mutators: [...mutators], mmods:computeMutatorMods(mutators),   // per-run mutators (v3)
    fleet, techCount, weather:freshWeather(), buildSeq:1,
    demandJit:0, spikeMag:0, spikeT:0, // v4.2.2 net-load volatility state
    demand:0, capacity:0, price:0, brownout:false,
    reserveOffered:0, // v5 Phase 2: MW held back from the swing via reserveHold (earns the floor in Phase 6)
    // v5.1 Phase 2: the fail-state returns. The grid-stability reservoir fills on a shortfall
    // and drains on served hours; topping out sets S.over and freezes the run for a roguelite
    // restart. runStartDay tags this run for the records the profile banks across deaths.
    over:false, reason:null, runStartDay:1, stability:freshStability(),
    // ---- v4 "The Book": spot + contracts (Phase B) — all deterministic defaults
    // so a bare createGame() stays reproducible (spotNoise is always 0 in B). ----
    spot:0, spotBaseline:0, spotNoise:0, hedge:CFG.hedgeDefault,
    contracts:[], pendingOffer:null, contractSeq:1, contractedMW:0,
    // v4.2 (CR-2): read-only live readouts surfaced each step for the status cluster
    served:0, contractRevenue:0, flowRate:0,
    // ---- v4 financing (Phase C): start clean, borrow by choice. Credit is the
    // carried STANDING (not a flat constant); creditCap drops after a default. ----
    debt:0, credit:creditStanding, creditCap:100, defaulted:false,
    insolventT:0, interestPaid:0, dayInterest0:0, debtLedger:[],
    // ---- v4 scoring accumulators (Phase D): the four tracks build over the run ----
    cleanMWh:0, servedMWh:0, peakNetWorth:CFG.startCash + mods.startCashBonus, bestSpotKill:0,
    // ---- v4 earned forecast (Phase E): next-hour spot outlook + its fog width ----
    marketVolatility:0, spotForecast:0, spotForecastFog:CFG.forecast.baseFog, fcHour:-1,
    // ---- v4 meta blooms (Phase F): capacity obligation + special offers are
    // opt-in via economy unlocks. (v5 retired the finite-run win.) ----
    economyUnlocked: { ...economyUnlocked }, // v5: grid is persistent (maxRunDays/won retired)
    capacityObligation:null, capHour:-1,
    // ---- v5 Phase 4: maintenance & crews. The crew pool seeds one per core trade;
    // ⚡ (zap) promotes standouts + raises the roster ceiling; tasks are scheduled at
    // the quarter-end review and resolve over the next quarter with downtime. ----
    crews: Array.from({ length: CFG.v5.crews.startCrews }, (_, i) => makeCrew(TRADES[i % TRADES.length], i + 1)),
    crewSeq: CFG.v5.crews.startCrews, maintQueue: [], maintSeq: 0,
    zap: 0, rosterCap: CFG.v5.crews.baseRoster,
    // v5 Phase 7 / v5.1 Phase 3: progression. `perks` holds unlocked ⚡ perks. Per-plant upgrades
    // now live on u.tiers → u.caps (seeded by freshTiers/freshCaps) and resolve through the rolling
    // `contractor` queue (contractor.js); contractorSeq ids the jobs. The RP family-ceiling lane
    // (S.capCeil) is RETIRED — the 9-tier ladder defines the ceiling directly. See progression.js.
    perks: {}, contractor: [], contractorSeq: 0,
    // v5 Phase 8: mid-quarter crisis tools (null = inactive) + the seasonal event regime
    // (null until main.js rolls Q1; the rollover re-rolls it each quarter). drCooldown ages
    // down in tickCrisis. S.mmods is driven by regimeMods once a regime is live.
    shed: null, dr: null, drCooldown: 0, regime: null,
    // v5 Phase 5: in-flight lead-time construction projects. Committed at the quarter
    // review; tickBuilds advances them at each rollover and lands a live unit on completion.
    builds: [], buildSeqV5: 0,
    // v5.1 Phase 5: the daily brief. autoAdvance on = skip quiet days; an exception (a landed
    // rolling job, a crisis, tight headroom, a cash/stability danger band) opens the brief and
    // clears it. jobsDone counts rolling completions since the last boundary (the "job landed"
    // interrupt). briefEnabled gates the whole beat OFF for headless runs (like regime/mmods);
    // main.js arms it per session so createGame() stays operating-only and deterministic.
    autoAdvance: true, jobsDone: 0, briefEnabled: false,
    // v5 Phase 6: the hybrid economy. `economy` holds the standing floor rate (ratcheted
    // by the overlord's verdict), a running swing PnL mirror, the last verdict, and the
    // stagnation lever; `quarterLog` accumulates the board review's inputs each tick and
    // is reset at every rollover. Floor = availability pay on held reserve (Reliability);
    // swing = spot PnL on pushed MW (Efficiency/Output/Flexibility).
    economy: freshEconomy(), quarterLog: freshQuarterLog(),
    hist:[], sampleAcc:0, upAcc:0, downAcc:0, autoSvcAcc:0,
    ticker:"", tickerT:0,
  };
}

// v5 Phase 4: the v4 live service path (manual `serviceUnit` + the Service Manager
// `autoService`) is retired — maintenance is now QUARTER-END ONLY (maint.js), worked
// by the crew pool, with downtime. There is no mid-quarter repair. The `servicemgr`
// meta skill is inert in v5 (Phase 7's progression rework revisits the meta roster).

export function setTicker(S, msg){ S.ticker = msg; S.tickerT = 3.5; }

// Daily strain probability for a condition, linearly interpolated from the
// CFG.tripOdds lookup ([cond%, pDay], descending). Clamps above the top point and
// plateaus below the bottom one — so the curve passes exactly through the tuned
// benchmarks and never runs away.
export function dailyStrainProb(cond){
  const pts = CFG.tripOdds;
  if (cond >= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (cond <= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++){
    const [c1, p1] = pts[i - 1], [c0, p0] = pts[i]; // c1 > c0
    if (cond >= c0){ const f = (c1 - cond) / (c1 - c0); return p1 + (p0 - p1) * f; }
  }
  return last[1];
}
// Per-real-second trip hazard for a thermal unit. v4.2.1: trip risk is tied to
// CONDITION — the hazard is the per-second rate that integrates to the table's
// daily strain probability for this condition, scaled by the plant's own
// reliability (u.fail / tripRefFail, so nuclear is safer and upgrades help) and
// lifted by `diff` as the run climbs. Healthy plants are near-immune; the mid-band
// is punishing. A trip is the symptom of neglect, not bad luck.
export function tripHazard(u, diff){
  // v5 Phase 3: trip risk is gated by the RELIABILITY KPI (condition is retired from
  // the live path). Renewables/batteries carry no kpis and never trip.
  const rel = u.kpis ? u.kpis.reliability : u.condition;
  if (rel == null) return 0;
  const pDay = dailyStrainProb(rel);
  const baseRate = -Math.log(1 - pDay) / CFG.secondsPerDay; // rate → pDay over one game-day at diff 1
  return baseRate * diff * (u.fail / CFG.tripRefFail);
}

// ---- capacity accounting ----
export function unitOutput(S, u){
  if (u.kind === "renew"){
    const solar = u.tech === "solar"; // by tech, so BUILT solar/wind pick the right weather+mutator
    const wx  = solar ? S.weather.sun : S.weather.wind;
    const mut = solar ? (S.mmods?.cfMult?.sun ?? 1) : (S.mmods?.cfMult?.wind ?? 1);
    return u.cap * interp(u.cf, S.t) * wx * mut;
  }
  if (u.kind === "battery") return (u.status === "discharge" && u.energy > 0) ? u.cap * (S.rmods?.battCapMult ?? 1) : 0;
  // firm / gas (v5 Phase 2): the Core+ dials shape the MW offered to the merit order.
  // Only a physically-running unit contributes (a strained plant still generates
  // until it trips); starting/service/tripped offer nothing. applyDials handles the
  // band clamp + reserve-hold shave; dialled to its full band this equals u.cap (v4).
  if (u.status === "online" || u.status === "strained") return applyDials(u).max;
  return 0;
}
export function totalCapacity(S){ return S.fleet.reduce((a, u) => a + unitOutput(S, u), 0); }

export function surviveDay(S){
  // v5: advance the Year▸Quarter▸Day calendar; S.day mirrors the monotonic absDay
  // (the demand clock the economy reads). The grid never resets.
  const rolled = advanceCalendar(S);
  S.day = S.calendar.absDay;
  // v5.1 Phase 1: demand no longer compounds daily. The quarter baseline (S.quarterPeak)
  // steps once per quarter in rollQuarterPeak (below); each day the live S.peak is set from
  // that baseline × a bounded seasonal daily noise. Within a quarter the baseline holds, so
  // the day only refreshes the weather + the wobble — the quarterly step is the real growth.
  S.weather = freshWeather();
  S.strain = Math.max(0, S.strain - 30);
  expireContracts(S); // v4: age term contracts one day, drop the expired ones
  creditTick(S);      // v4 (C): a solvent day rebuilds credit toward the cap
  // roll the day's accrued interest into a single ledger entry (not per-tick)
  const dayInterest = S.interestPaid - (S.dayInterest0 || 0);
  if (dayInterest > 0.5){ (S.debtLedger = S.debtLedger || []).push({ type:"interest", day:S.day - 1, amount:Math.round(dayInterest) }); }
  S.dayInterest0 = S.interestPaid;
  const firstCarbon = S.carbon === 0 && S.day >= CFG.carbonStartDay;
  if (S.day >= CFG.carbonStartDay) S.carbon += CFG.carbonPerDay; // policy tightens as demand climbs
  // v4 (F): age a capacity obligation; it lapses when its term runs out.
  if (S.capacityObligation){
    S.capacityObligation.daysLeft -= 1; S.capacityObligation.calledToday = false;
    if (S.capacityObligation.daysLeft <= 0) S.capacityObligation = null;
  }
  // v5: the quarter rolled → the fiscal period closed. Pause into the Planning
  // Office (the quarter-end board review). This is a BEAT, not an ending — the
  // grid is persistent; nothing is ever lost. Phase 6 fills the review.
  if (rolled.rolledQuarter){
    // v5 Phase 5: land any finished construction FIRST — a completed plant is in the
    // fleet before the review, so it's available for the coming quarter's maintenance
    // planning. In-flight projects advance (and crowded ones may slip + overrun).
    const built = tickBuilds(S, S.rng || Math.random);
    // v5.1 Phase 4: maintenance is now ROLLING (tickMaint, each tick) — the quarter rollover no
    // longer batches it. In-flight maint jobs simply carry across the boundary. Pay the standing
    // wage bill here (Phase 6 folds it into settleQuarter's PnL).
    // v5 Phase 6 settlement — close the Phase 4/5 seams INTO the quarter's PnL. Crew
    // wages are the standing cost (still deducted from cash here); build overruns were
    // charged to cash as they slipped (tickBuilds) and are mirrored into the log. Then
    // the overlord grades the quarter, banks the bonus/fine, and ratchets next quarter's
    // floor rate; the stagnation lever is set from the serve rate.
    const wages = wageBill(S); S.cash -= wages;
    S.quarterLog.wages = wages;
    const verdict = settleQuarter(S);
    applyVerdict(S, verdict);
    // v5.1 Phase 2: couple the verdict to the stability bar — a strong quarter heals it, a
    // weak one damages it and accelerates next quarter's fill (KPIs matter to survival).
    applyVerdictToStability(S, verdict);
    // v5.1 Phase 1: step the plannable demand baseline for the NEW quarter (reads the
    // growthStall applyVerdict just set), then set the new quarter's first live peak off it.
    rollQuarterPeak(S);
    S.peak = stepDemand(S);
    S.quarterLog = freshQuarterLog();
    // v5 Phase 8: deal the NEW quarter's seasonal event regime (the calendar already rolled
    // into it) and refresh the per-tick mods the sim reads. Only once a regime system is
    // live (main.js rolls Q1 at game start); headless tests stay on neutral mmods.
    if (S.regime){ rollRegime(S, S.rng || Math.random); S.mmods = regimeMods(S); }
    S.calendar.mode = "planning";
    S.jobsDone = 0; // v5.1 Phase 5: the quarter-end review supersedes the daily brief — start the new quarter's tally clean
    autoPause(S, "Quarter closed — board review");
    const notes = [];
    if (built.length) notes.push(`${built.length} new plant${built.length > 1 ? "s" : ""} online`);
    const money = verdict.bonus ? `+$${verdict.bonus.toLocaleString()} bonus` : verdict.fine ? `−$${verdict.fine.toLocaleString()} fine` : "rate held";
    notes.push(`board verdict: ${money}`);
    setTicker(S, `◼ Quarter closed — ${notes.join(", ")}. Board review ready.`);
    return;
  }
  // v5.1 Phase 4: the Auto-Maintenance perk is now a DAILY rolling top-up — assign any free
  // crews to the neediest plants (still pays, reserves crews, books downtime). No-op without it.
  if (S.perks?.autoMaint) autoMaintenancePlan(S);
  // v5.1 Phase 1: a normal day within a quarter — refresh today's live peak off the
  // (unchanged) quarter baseline × seasonal daily noise. The baseline itself only moves
  // at the quarter rollover (above), so this is wobble, not growth.
  S.peak = stepDemand(S);
  setTicker(S, firstCarbon
    ? `✓ Day ${S.day - 1} cleared — carbon pricing begins at $${Math.round(S.carbon)}/t. Dirty plants cost more now.`
    : `✓ Day ${S.day - 1} cleared — ${S.quarterPeak} MW baseline, today peaking ${S.peak} MW.`);
  // v5.1 Phase 5: the daily brief gate. Gated on S.briefEnabled so headless runs stay operating
  // (like the regime system). Open the brief unless the player has armed auto-advance AND nothing
  // demands attention; a quiet auto-advanced day just consumes the (empty) completion tally.
  if (S.briefEnabled){
    if (!S.autoAdvance || shouldInterrupt(S)) openBrief(S);
    else S.jobsDone = 0;
  }
}

// v5: leave the quarter-end board review and resume the live day. The calendar
// already advanced into the new quarter's day 1 when the quarter rolled, so this
// just hands control back: operating mode, clock running at 1×.
export function beginNextQuarter(S){
  S.calendar.mode = "operating";
  S.clock.speed = 1; S.clock.autoPaused = false; S.clock.pauseReason = "";
}

// Advance the simulation by `dt` real seconds. Returns true if the run just ended.
export function step(S, dt){
  // v5.1 Phase 2: once the stability bar tops out the run is OVER — step freezes (the grid
  // is frozen pending a roguelite restart), matching how v4 handled its terminal flag.
  if (S.over) return false;
  // v5.1 Phase 5: only the live day advances the sim. The quarter-end board review ("planning")
  // and the daily brief ("brief") freeze the loop — the player is scheduling, not operating — so
  // step no-ops outside "operating" (no double-stepping across a mode flip). main.js never calls
  // step in those modes; this is the belt-and-suspenders guard the tests pin.
  if (S.calendar && S.calendar.mode !== "operating") return false;
  // v5: the clock owns dt→game-hours and honours speed (0 = read-only pause, so no
  // time passes and the tick is a no-op). step() never signals an end — the grid
  // is persistent, so it always returns false.
  const dtH = tickClock(S, dt);
  if (dtH <= 0) return false;
  // v5 Phase 7: Dispatch Assist perk — open each unpinned committed thermal plant's band to
  // its legal max each live tick, so output isn't left throttled. Pinned plants are untouched.
  if (S.perks?.dispatchAssist) dispatchAssist(S);
  S.t += dtH;
  if (S.t >= 24){ S.t -= 24; surviveDay(S); }

  // v4.2.2: weather is now genuinely VOLATILE — a mean-reverting random walk (pulled
  // back toward clear-sky 1.0) with wider bands, so solar and wind swing enough to
  // move the net-load curve you're managing. Cloud banks, gusts and lulls, not a
  // gentle drift. Magnitudes live in CFG.vol so balance stays central.
  const V = CFG.vol, sq = Math.sqrt(dt); // √dt → frame-rate-independent volatility
  S.weather.sun  = clamp(S.weather.sun  + (1 - S.weather.sun)  * V.sunRevert  * dt + rand(-1, 1) * V.sunVol  * sq, V.sunLo,  V.sunHi);
  S.weather.wind = clamp(S.weather.wind + (1 - S.weather.wind) * V.windRevert * dt + rand(-1, 1) * V.windVol * sq, V.windLo, V.windHi);
  // demand jitter + spikes (S.calm suppresses them for the deterministic test harness):
  if (!S.calm){
    // a continuous mean-reverting wobble on load…
    S.demandJit = clamp(S.demandJit + (0 - S.demandJit) * V.demandRevert * dt + rand(-1, 1) * V.demandVol * sq, -V.demandJitMax, V.demandJitMax);
    // …plus occasional short SPIKES (a cold front, an industrial swing) that bump load
    // for a game-hour or two — telegraphed only by the chart, so watch your margin.
    if (S.spikeT > 0) S.spikeT -= dtH;
    else if (Math.random() < V.spikeChance * dtH){ S.spikeMag = rand(V.spikeMin, V.spikeMax); S.spikeT = rand(V.spikeDurMin, V.spikeDurMax); }
  }

  const diff = 1 + (S.day - 1) * CFG.outageRamp; // outages get worse as days climb

  // unit state machines
  for (const u of S.fleet){
    // v5.1 Phase 4: a plant in the shop for ROLLING maintenance is offline while worked
    // (the downtime teeth — days now, not a whole quarter). It holds "maint", takes no
    // commit/spin-up, never trips, and doesn't wear — tickMaint lifts it on completion.
    if (u.maintDown){
      if (u.status !== "maint"){ u.status = "maint"; u.strainTimer = 0; }
      continue;
    }
    // v5 Phase 2: the COMMIT dial drives online/offline for dial-able thermal (firm/gas).
    // The dial is the desire; status is the physical state. A committed gas unit spins
    // up (startTime); standing one down (or uncommitting) takes it offline and clears
    // any strain. service/tripped run their own timers and re-arm from commit when done.
    if (u.dials && (u.kind === "firm" || u.kind === "gas")){
      if (u.dials.commit && u.status === "off"){
        if (u.startTime > 0){ u.status = "starting"; u.startTimer = u.startTime * (S.mods?.startTimeMult ?? 1) * (S.rmods?.startTimeMult ?? 1); }
        else u.status = "online";
      } else if (!u.dials.commit && (u.status === "online" || u.status === "starting" || u.status === "strained")){
        u.status = "off"; u.strainTimer = 0;
      }
    }
    if (u.status === "starting"){ u.startTimer -= dtH; if (u.startTimer <= 0) u.status = "online"; }
    else if (u.status === "service"){ u.serviceTimer -= dtH; if (u.serviceTimer <= 0){ u.condition = 100; if (u.kpis) u.kpis = freshKPIs(); u.ageHours = (u.ageHours || 0) * CFG.serviceAgeRelief; u.status = u.ctrl ? "off" : "online"; setTicker(S, `✓ ${u.name} back from service at 100%.`); } }
    else if (u.status === "tripped"){ u.tripTimer -= dtH; if (u.tripTimer <= 0) u.status = u.ctrl ? "off" : "online"; }
    // v4.1 telegraphed trip: a strained plant is still generating but on borrowed
    // time — it drops when the warning window runs out. The window is your cue to
    // arm reserves / shed load (and for a peaker, to stand it down on your terms).
    else if (u.status === "strained"){
      u.strainTimer -= dtH;
      if (u.strainTimer <= 0){
        u.status = "tripped"; u.tripTimer = rand(u.recover[0], u.recover[1]); u.strainTimer = 0;
        setTicker(S, `⚠ ${u.name} tripped offline — ${Math.round(u.cap)} MW lost!`);
      }
    }
    else if ((u.kind === "firm" || u.kind === "gas") && u.status === "online"){
      // per-real-second hazard turned into an exact probability for this frame's dt
      // (1 - e^{-rate·dt}): frame-rate independent and never exceeds 1 on slow frames.
      // v4.1: base rates are low and WEAR dominates (tripHazard), so a maintained
      // plant rarely strains; when it does, it enters a telegraphed warning first.
      if (Math.random() < 1 - Math.exp(-tripHazard(u, diff) * dt)){
        u.status = "strained"; u.strainTimer = CFG.strainWarn;
        // v5 Phase 8: a telegraphed trip is the beat to reach for the crisis toolkit —
        // auto-pause the clock so load-shed / demand response are reachable before it falls.
        autoPause(S, `${u.name} straining — shed load or fire reserves`);
        setTicker(S, `⚠ ${u.name} straining — ${Math.round(u.cap)} MW at risk; stabilize or fire reserves!`);
      }
    }
  }
  // (wear is applied after dispatch, below — it needs each unit's actual load.)

  // demand: daily shape × peak, lifted by mutators (heat wave / cold snap), then
  // shaved by demand-response research (the demand-SIDE lever).
  S.demand = S.peak * interp(DEMAND_SHAPE, S.t) * (S.mmods?.demandMult ?? 1) * (1 - (S.rmods?.demandShave ?? 0))
    * (1 + S.demandJit) * (S.spikeT > 0 ? 1 + S.spikeMag : 1); // v4.2.2 jitter + spikes
  // v5 Phase 8: the crisis tools shave the live load. Active DEMAND RESPONSE takes a
  // fraction off the peak (foresight — gated on the DR research branch); an active
  // LOAD-SHED cuts a prioritised tier's MW (a controlled brownout the player chose).
  S.demand *= (1 - activeDrShave(S));
  S.demand = Math.max(0, S.demand - activeShedMW(S));
  S.capacity = totalCapacity(S);

  // economics — clear the hour through the shared, verified merit-order engine.
  // Aggregate every unit's available MW (0 when off/tripped) into per-tech supply.
  const avail = {};
  for (const u of S.fleet) avail[u.tech] = (avail[u.tech] || 0) + unitOutput(S, u);
  // v5 Phase 2: sum the headroom held back from the swing via reserveHold (only on
  // committed, physically-running dial-able thermal). Phase 6 pays the capacity floor on it.
  S.reserveOffered = S.fleet.reduce((a, u) =>
    a + (((u.kind === "firm" || u.kind === "gas") && (u.status === "online" || u.status === "strained")) ? applyDials(u).held : 0), 0);
  const hr = dispatchHour(avail, S.demand, S.carbon, S.mmods?.fuelMult ?? 1); // carbon + mutator fuel spike re-sort the merit order
  S.price = hr.price;
  S.co2 = hr.served > 0 ? hr.emissions * 1e3 / hr.served : 0; // live intensity, kg CO₂/MWh
  S.co2Total += hr.emissions * dtH;                           // run total, tCO₂ (emissions is tCO₂/h)

  // ---- DEGRADATION (v5 Phase 3): KPIs decay by operating STYLE ----
  // How you DIAL a plant decides which axis bleeds (kpi.degradeKPIs): push a high-load
  // plant → Reliability/Output; run it part-load → Efficiency; cycle it → Flexibility.
  // Only generating thermal plants degrade. effSurcharge is the extra fuel a low-
  // Efficiency plant burns, charged to cash below — the engine's clearing price is
  // untouched (sacred); only the operator's cost rises. u.condition becomes a derived
  // worst-axis proxy for the dormant service/UI code (Phase 4 replaces maintenance).
  const wearMods = S.mods.wearMult * (S.rmods?.wearMult ?? 1);
  let effSurcharge = 0;
  for (const u of S.fleet){
    if (!u.kpis || !(u.status === "online" || u.status === "strained")) continue;
    const techAvail = avail[u.tech] || 0;                     // MW this tech offered the merit order
    const share = techAvail > 0 ? (hr.stack?.[u.tech] || 0) / techAvail : 0; // 0..1 dispatched fraction
    u.loadFrac = share;                                                      // expose for UI/tests
    u.ageHours = (u.ageHours || 0) + dtH;                     // still tracked (Phase 4 reads it); no longer wears directly
    // ramp/start events since this unit last generated (dispatch.cycleCost)
    const prev = u.prevDials || dialSnapshot(u.dials);
    const cyc = cycleCost(u, prev, u.dials);
    degradeKPIs(u, { loadFrac: share, push: u.dials?.push ?? 0, ramped: cyc.ramped, started: cyc.started }, dtH * wearMods);
    u.prevDials = dialSnapshot(u.dials);
    // efficiency re-prices: extra fuel ∝ (heatRateMult − 1) × this unit's dispatched MW
    effSurcharge += unitOutput(S, u) * share * (u.mc || 0) * (heatRateMult(u.kpis.efficiency) - 1);
    u.condition = Math.min(u.kpis.reliability, u.kpis.efficiency, u.kpis.output, u.kpis.flexibility);
  }

  // spin: cost of keeping a thermal plant synced while it's generating (online or
  // straining — a strained plant is still running until it trips).
  const generating = u => (u.kind === "firm" || u.kind === "gas") && (u.status === "online" || u.status === "strained");
  const spin = S.fleet.reduce((a, u) => a + (generating(u) ? u.cap * (u.spin ?? CFG.spinCost) : 0), 0) * (S.rmods?.spinMult ?? 1);
  // fixed O&M (v4.1): you pay the FULL rate only for dispatchable capacity you're
  // actually running; an off/tripped reserve (and the battery — storage is cheap to
  // own) costs just CFG.fixedOMIdle of it. Still punishes overbuilding you keep hot,
  // but idle reserves no longer bleed the cold start dry. Renewables stay exempt.
  const fixedOM = S.fleet.reduce((a, u) => {
    if (u.kind === "renew") return a;
    const rate = generating(u) ? CFG.fixedOM : CFG.fixedOM * CFG.fixedOMIdle;
    return a + u.cap * rate;
  }, 0);
  // Revenue (v4 "The Book"): contracted blocks settle FIRST at their locked price,
  // the residual served load clears at the live spot price. Spot = baseline + a
  // scarcity premium driven by the player's OWN reserve margin (mutators compound
  // it). Both revenue paths read ONLY hr.served — identical decoupling to the old
  // retail model, so a shortfall is never a scarcity windfall. hr.price (the
  // merit-order clearing price) and carbon still drive the COST side (varCost).
  const baseline = exogenousBaseline(S.day, S.t);
  const rm = reserveMargin(S.capacity, S.demand);
  const spot = spotPrice({ baseline, reserveMargin: rm, scarcityMult: S.mmods?.scarcityMult ?? 1, noise: S.spotNoise });
  S.spotBaseline = baseline; S.spot = spot;

  // v4 earned forecast (Phase E): once per game-hour, publish a next-hour spot
  // outlook. The band WIDTH (fog) narrows with forecasting research and widens
  // with volatility; the central estimate persists the current scarcity premium
  // onto the next hour's baseline, biased by up to ±fog via a SEPARATE RNG stream
  // (seed ^ 0xF0 in main.js) so sharpening the forecast never desyncs realized spot.
  const hourNow = Math.floor(S.t);
  if (S.fcHour !== hourNow){
    S.fcHour = hourNow;
    const fog = forecastFog(forecastInputs(S));
    const predBaseline = exogenousBaseline(S.day, S.t + 1);
    const predCentral = clamp(predBaseline + (spot - baseline), CFG.spotFloor, CFG.spotCap);
    const bias = S.rngForecast ? (S.rngForecast() * 2 - 1) * fog * predCentral : 0; // foggier → further off
    S.spotForecast = clamp(predCentral + bias, CFG.spotFloor, CFG.spotCap);
    S.spotForecastFog = fog;
  }

  // v5 Phase 6 — the HYBRID economy. Two income surfaces instead of one:
  //  • SWING: contracts settle first at their locked price, the residual served load
  //    clears at spot, scaled by the fleet's swing quality (generation-weighted
  //    Efficiency/Output/Flexibility — a fresh fleet = 1.0, no change from v4).
  //  • FLOOR: availability pay on the MW each committed thermal unit HOLDS back via
  //    reserveHold, at the ratcheted floor rate, keyed to that unit's Reliability.
  // Held reserve isn't offered to the merit order (applyDials shaves it), so it earns
  // the floor, never the swing — the two never double-count. Both read only served
  // load, so a shortfall is still never a windfall (the v4 invariant holds).
  let swW = 0, swSum = 0, floorPerH = 0;
  for (const u of S.fleet){
    const mw = unitOutput(S, u);
    if (mw > 0){ swW += mw; swSum += mw * swingCoeff(u.kpis); }
    if ((u.kind === "firm" || u.kind === "gas") && (u.status === "online" || u.status === "strained"))
      floorPerH += floorEarn(applyDials(u).held, u.kpis ? u.kpis.reliability : 100, S.economy.floorRate);
  }
  const fleetSwing = swW > 0 ? swSum / swW : 1;
  const { contractedMW, contractRevenue } = settleContracts(S.contracts, hr.served);
  S.contractedMW = contractedMW;                            // exposed for D's spot-kill track
  const residualMW = Math.max(0, hr.served - contractedMW); // never negative, never unserved
  const swingPerH = contractRevenue + swingEarn(residualMW, spot, fleetSwing); // $/h market swing
  const revenue = swingPerH + floorPerH;                    // $/h top-line (swing + regulated floor)
  S.cash += (revenue - hr.varCost - effSurcharge - spin - fixedOM) * dtH;  // unserved load earns nothing; effSurcharge = Phase 3 efficiency-KPI fuel penalty

  // accrue the quarter's board-review log (the overlord grades these at the rollover).
  const qlog = S.quarterLog;
  qlog.swingPay += swingPerH * dtH; qlog.floorPay += floorPerH * dtH;
  qlog.servedMWh += hr.served * dtH; qlog.emissions += hr.emissions * dtH;
  // v5.1 Phase 6: the scorecard's extra raw inputs — operating cost (→ cost discipline), and
  // time-weighted reserve margin + wholesale price (→ headroom / affordability). Capital sunk
  // into builds/upgrades is accrued where it's committed (construct.commitBuild / contractor.queueUpgrade).
  qlog.opCost += (hr.varCost + effSurcharge + spin + fixedOM) * dtH;
  qlog.reserveAccum += rm * dtH; qlog.priceAccum += S.price * dtH; qlog.hours += dtH;
  let kw = 0, kr = 0, ke = 0, ko = 0, kf = 0;
  for (const u of S.fleet) if (u.kpis){ kw++; kr += u.kpis.reliability; ke += u.kpis.efficiency; ko += u.kpis.output; kf += u.kpis.flexibility; }
  if (kw > 0){ qlog.kpiAccum.reliability += (kr / kw) * dtH; qlog.kpiAccum.efficiency += (ke / kw) * dtH;
               qlog.kpiAccum.output += (ko / kw) * dtH; qlog.kpiAccum.flexibility += (kf / kw) * dtH; qlog.kpiWeight += dtH; }
  S.economy.swingPnL += swingPerH * dtH;                    // running mirror for the HUD

  // v4.2 (CR-2): surface the existing hour's figures as read-only live readouts.
  // Not new mechanics — just the numbers already summed above, exposed as rates so
  // the status cluster can show cash flow ($/h), spot exposure, and blended price.
  S.served = hr.served;                                     // MW actually delivered
  S.contractRevenue = contractRevenue;                      // $/h locked at contract prices
  S.floorPay = floorPerH;                                   // $/h regulated availability floor (v5 P6)
  let flowPerH = revenue - hr.varCost - effSurcharge - spin - fixedOM; // instantaneous net cash, $/game-hour

  // financing (v4, Phase C): interest on outstanding debt is the fixed obligation
  // that makes the hedge floor matter. Rate comes off the live credit standing;
  // interestFor already bakes in dtH, so it's subtracted directly (not ×dtH again).
  if (S.debt > 0){
    const interest = interestFor(S.debt, creditRating(S.credit).rate, dtH);
    S.cash -= interest; S.interestPaid += interest;
    flowPerH -= dtH > 0 ? interest / dtH : 0;                // interest drags the flow rate
  }

  // v4 capacity market (Phase F): paid for availability every tick under an
  // obligation; once per day a CALL may land (likelier when the grid is tight) and
  // a shortfall against the obligation draws a recoverable breach fine (never fatal
  // by itself — only sustained insolvency ends a run). Firm reserve = firm+peaker
  // capacity not tripped or in service; renewables/batteries don't count.
  if (S.capacityObligation){
    const availPay = capacityPayment(S.capacityObligation, dtH / 24);
    S.cash += availPay;
    S.quarterLog.floorPay += availPay;                          // v5 P6: the obligation IS floor income
    flowPerH += capacityPayment(S.capacityObligation, 1 / 24);  // steady availability payment ($/h)
    const capHourNow = Math.floor(S.t);
    if (S.capHour !== capHourNow){
      S.capHour = capHourNow;
      if (S.rng && !S.capacityObligation.calledToday && rollCapacityCall(S, S.rng)){
        S.capacityObligation.calledToday = true;
        const deliverable = S.fleet.reduce((a, u) => a + (((u.kind === "firm" || u.kind === "gas") && u.status !== "tripped" && u.status !== "service") ? u.cap : 0), 0);
        const fine = capacityPenalty(S.capacityObligation, deliverable);
        if (fine > 0){ S.cash -= fine; S.quarterLog.breaches += 1; S.quarterLog.breachFines += fine; setTicker(S, `⚠ Capacity call — short ${Math.round(S.capacityObligation.reserveMW - deliverable)} MW, fined $${Math.round(fine).toLocaleString()}.`); }
        else setTicker(S, `✓ Capacity call met — reserve delivered.`);
      }
    }
  }
  S.flowRate = flowPerH;                                     // net cash velocity, $/game-hour

  // storage (one or more batteries): the engine aggregates all battery MW into
  // hr.stack.battery, so drain that total across the discharging units — split in
  // proportion to each unit's stored energy, which keeps every unit ≥ 0 whenever
  // the draw fits within the total stored. Idle units recharge from a shared
  // surplus budget, each MWh bought at the clearing price (free at a $0 price).
  const batteries = S.fleet.filter(u => u.kind === "battery");
  const discharging = batteries.filter(u => u.status === "discharge" && u.energy > 0);
  const storedTotal = discharging.reduce((a, u) => a + u.energy, 0);
  if (storedTotal > 0 && hr.stack.battery > 0){
    const drain = Math.min(hr.stack.battery * dtH, storedTotal); // total MWh pulled this tick
    for (const u of discharging){
      u.energy = Math.max(0, u.energy - drain * (u.energy / storedTotal));
      if (u.energy <= 1e-9){ u.energy = 0; u.status = "off"; setTicker(S, `${u.name} depleted.`); }
    }
  }
  let surplusBudget = Math.max(0, S.capacity - S.demand) * dtH; // MWh of surplus to share
  const depthMult = S.rmods?.battEnergyMult ?? 1, rechargeMult = S.rmods?.battRechargeMult ?? 1;
  for (const u of batteries){
    const emax = u.maxEnergy * depthMult; // storage-depth research deepens every battery
    if (u.status === "discharge" || u.status === "service" || u.energy >= emax) continue;
    const add = Math.min(CFG.battRecharge * rechargeMult * dtH, surplusBudget, emax - u.energy);
    if (add > 0){ u.energy += add; S.cash -= add * hr.price; surplusBudget -= add; }
  }

  // R&D lab (v3): divert funded cash into Research Points. Can't fund more than
  // the cash on hand, so a near-broke grid can't research its way out of trouble.
  if (S.rdFunding > 0 && S.cash > 0){
    const spend = Math.min(S.rdFunding * dtH, S.cash);
    S.cash -= spend;
    S.rp += spend * CFG.rpPerDollar;
  }

  // reserve margin, brownout, strain
  const shortfall = S.demand - S.capacity;
  const sev = S.demand > 0 ? shortfall / S.demand : 0;
  if (shortfall > 0.5){
    // v5: a shortfall hurts — strain, lost confidence, unserved-load penalty. v5.1 Phase 2
    // adds the TEETH back: the stability bar (tickStability below) fills on this shortfall,
    // asymmetric by cause, and topping it out ends the run. Strain/satisfaction still pin at
    // their extremes (chronic pain) while the day runs.
    S.brownout = true; S.downAcc += dt;
    S.strain = Math.min(100, S.strain + sev * CFG.strainRate * dt);
    S.satisfaction = Math.max(0, S.satisfaction - sev * CFG.satDrain * dt);
    S.cash -= shortfall * CFG.unservedPenalty * dtH; // lost sales already sting; this adds fines / emergency buys
    S.quarterLog.shortfallMWh += shortfall * dtH;    // v5 P6: the board's serve-rate reads this vs servedMWh
  } else {
    S.brownout = false; S.upAcc += dt;
    S.strain = Math.max(0, S.strain - CFG.strainRecover * dt);
    if (S.satisfaction < 100) S.satisfaction = Math.min(100, S.satisfaction + CFG.satRecover * dt);
  }
  // v5.1 Phase 2: drive the stability reservoir from this tick's served vs demanded MW
  // (post crisis-shaves — S.demand/S.capacity are final here). Fills asymmetric by cause,
  // drains when served; may set S.over, which freezes step() from the next tick.
  tickStability(S, S.capacity, S.demand, dtH);
  // v5 Phase 8: age the crisis tools (expire a finished shed/DR window, wind the DR
  // cooldown down) — they were consumed in the demand calc above, so age them now.
  tickCrisis(S, dtH);
  // v5.1 Phase 3: age the rolling upgrade queue — lands a committed tier on its lead-time day
  // (its own contractor labor; never touches the maintenance crew pool).
  const upDone = tickContractor(S, dtH) || 0;
  // v5.1 Phase 4: age the rolling MAINTENANCE queue — a completed job restores its axis toward
  // the cap, levels + frees its crew, and lifts the plant's downtime. Crews are the limiter here.
  const mtDone = tickMaint(S, dtH) || 0;
  // v5.1 Phase 5: a landed rolling job is a brief exception — tally completions since the last
  // day boundary, where surviveDay reads S.jobsDone to decide whether to open the daily brief.
  if (upDone || mtDone) S.jobsDone = (S.jobsDone || 0) + upDone + mtDone;

  // insolvency (v4, Phase C): a second fail-path beside the blackout. Being in the
  // red with debt triggers a one-time default (credit cratered for the run); a
  // catastrophic hole winds you up instantly; otherwise a grace window (like the
  // strain meter) runs before bankruptcy — so a financial death feels earned too.
  // v5: insolvency keeps its TEETH (a default still craters credit — rates and
  // ceiling slashed) but is no longer fatal — no wind-up, no bankruptcy end. The
  // red cash and a cratered credit standing ARE the pain; recovery must be earned.
  // insolventT still accrues as a "how long under water" signal for Phase 6.
  if (isInsolvent(S)){
    if (S.debt > 0 && !S.defaulted){ triggerDefault(S); setTicker(S, `⚠ DEFAULT — credit cratered to ${Math.round(S.credit)}. Rates and ceiling slashed.`); }
    S.insolventT += dt;
  } else {
    S.insolventT = Math.max(0, S.insolventT - dt);
  }

  // v4 scoring accumulators (Phase D): clean-energy share, peak net worth, and
  // the biggest single spot-spike capture — each its own ⚡ track at run end.
  // servedMWh is the total served load; cleanMWh sums only the clean techs in the
  // dispatch stack (the stack also carries non-generation keys like _demand/unserved,
  // so we read named clean techs rather than iterating every key).
  S.servedMWh += hr.served * dtH;
  for (const tech of CLEAN_TECHS){ const mw = hr.stack[tech]; if (mw > 0) S.cleanMWh += mw * dtH; }
  S.peakNetWorth = Math.max(S.peakNetWorth, S.cash - (S.debt || 0));
  const spike = Math.max(0, spot - baseline); // spot premium above baseline this tick
  S.bestSpotKill = Math.max(S.bestSpotKill, residualMW * spike * dtH);

  // milestones reached this tick (near-term goals; scored at end of run)
  for (const m of newMilestones(S)){ S.milestonesHit.push(m.id); setTicker(S, `★ Milestone — ${m.label}!`); }

  // history sample for the scrolling chart (~every 0.2s)
  S.sampleAcc += dt;
  if (S.sampleAcc >= 0.2){ S.sampleAcc = 0; S.hist.push({ h:S.t, d:S.demand, c:S.capacity }); if (S.hist.length > 260) S.hist.shift(); }

  if (S.tickerT > 0){ S.tickerT -= dt; if (S.tickerT <= 0) S.ticker = ""; }
  return false;
}
