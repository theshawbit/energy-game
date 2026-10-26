// ============================================================
// LIVE SIM — game state and the per-tick simulation. Mutates a state object
// `S`; no DOM. Each tick clears the market through the shared, verified
// dispatchHour() engine (one source of dispatch truth with the batch game);
// the real-time mechanics (outages, strain, brownout/blackout) are new here.
//
// step() never touches the DOM: on a fatal shortfall it sets S.over / S.reason
// and stops the clock, and the view layer reacts to that.
// ============================================================
import { DEMAND_SHAPE } from "../constants.js";
import { dispatchHour } from "../engine.js";
import { CFG, makeFleet, serviceCost } from "./config.js";
import { computeMods, effPeakGrowth, newMilestones, CLEAN_TECHS } from "./meta.js";
import { computeResearchMods } from "./research.js";
import { computeMutatorMods } from "./mutators.js";
import { exogenousBaseline, reserveMargin, spotPrice } from "./market.js";
import { settleContracts, expireContracts, creditRating, interestFor, creditTick, isInsolvent, triggerDefault } from "./finance.js";
import { forecastFog, forecastInputs } from "./forecast.js";
import { capacityPayment, capacityPenalty, rollCapacityCall } from "./capacity.js";

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
  const bat = fleet.find(u => u.id === "bat");
  if (bat && mods.battMult !== 1){
    bat.cap = Math.round(bat.cap * mods.battMult);
    bat.maxEnergy = Math.round(bat.maxEnergy * mods.battMult);
    bat.energy = bat.maxEnergy;
  }
  return {
    running:false, paused:false, menuOpen:false, over:false, reason:"",
    t:CFG.startHour, day:1, peak:CFG.startPeak, peakGrowth:effPeakGrowth(mods),
    cash:CFG.startCash + mods.startCashBonus, satisfaction:100, strain:0,
    carbon:0, co2:0, co2Total:0, mods, milestonesHit:[],
    rp:0, rdFunding:0, research:{}, rmods:computeResearchMods({}), // in-run research (v3)
    researchUnlocked: { ...researchUnlocked },                     // meta-unlocked branches (read-only this run)
    mutators: [...mutators], mmods:computeMutatorMods(mutators),   // per-run mutators (v3)
    fleet, techCount, weather:freshWeather(), buildSeq:1,
    demand:0, capacity:0, price:0, brownout:false,
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
    // ---- v4 meta blooms (Phase F): a run is a finite contract (win at maxRunDays);
    // capacity obligation + special offers are opt-in via economy unlocks. ----
    economyUnlocked: { ...economyUnlocked }, maxRunDays, won:false,
    capacityObligation:null, capHour:-1,
    hist:[], sampleAcc:0, upAcc:0, downAcc:0, autoSvcAcc:0,
    ticker:"", tickerT:0,
  };
}

// Service Manager (meta skill): once per game-hour, pull the single most-worn
// plant below the unlocked threshold for service — but only when it's safe
// (an offline plant has no downtime cost; an online one only if the reserve
// margin stays positive without it) and affordable. Paid automatically.
export function autoService(S, dtH){
  const at = S.mods?.autoServiceAt || 0;
  if (!at) return;
  S.autoSvcAcc += dtH;
  if (S.autoSvcAcc < 1) return;
  S.autoSvcAcc = 0;
  const cands = S.fleet
    .filter(u => u.condition != null && u.status !== "service" && u.condition < at)
    .sort((a, b) => a.condition - b.condition);
  for (const u of cands){
    const cost = Math.round(serviceCost(u) * (S.mods.repairMult ?? 1));
    if (S.cash < cost) break;
    const offline = u.kind === "battery" ? u.status !== "discharge" : u.status !== "online";
    if (!offline && (S.capacity - S.demand) <= u.cap * 1.1) continue; // would risk a shortfall
    S.cash -= cost; u.status = "service"; u.serviceTimer = CFG.serviceTime;
    setTicker(S, `⚙ Service Manager: ${u.name} pulled for maintenance.`);
    break; // at most one per interval, to spread downtime
  }
}

export function setTicker(S, msg){ S.ticker = msg; S.tickerT = 3.5; }

// Per-real-second trip hazard for a thermal unit. v4.2.1: condition GATES the
// hazard rather than merely scaling it. A well-maintained plant (condition ≥
// CFG.tripSafe) carries only a tiny residual risk (CFG.tripFloor of the worn-out
// rate); below that band risk ramps up QUADRATICALLY to the full worn-out rate
// `u.fail` at 0% condition. So a trip is the symptom of neglect, not bad luck —
// keep plants serviced and they almost never go down. `diff` still lifts the
// ceiling as the run climbs. (u.fail is the fully-worn per-second hazard.)
export function tripHazard(u, diff){
  if (u.condition == null) return 0; // only thermal plants wear and trip
  const w = u.condition >= CFG.tripSafe ? 0 : (CFG.tripSafe - u.condition) / CFG.tripSafe;
  const factor = CFG.tripFloor + (1 - CFG.tripFloor) * w * w;
  return u.fail * diff * factor;
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
  return (u.status === "online" || u.status === "strained") ? u.cap : 0; // firm / peaker (a strained plant still generates until it trips)
}
export function totalCapacity(S){ return S.fleet.reduce((a, u) => a + unitOutput(S, u), 0); }

function gameOver(S, reason){ S.over = true; S.running = false; S.reason = reason; }

export function surviveDay(S){
  S.day++; S.peak = Math.round(S.peak * S.peakGrowth); S.weather = freshWeather();
  S.strain = Math.max(0, S.strain - 30);
  expireContracts(S); // v4: age term contracts one day, drop the expired ones
  creditTick(S);      // v4 (C): a solvent day rebuilds credit toward the cap
  // roll the day's accrued interest into a single ledger entry (not per-tick)
  const dayInterest = S.interestPaid - (S.dayInterest0 || 0);
  if (dayInterest > 0.5){ (S.debtLedger = S.debtLedger || []).push({ type:"interest", day:S.day - 1, amount:Math.round(dayInterest) }); }
  S.dayInterest0 = S.interestPaid;
  const firstCarbon = S.carbon === 0 && S.day >= CFG.carbonStartDay;
  if (S.day >= CFG.carbonStartDay) S.carbon += CFG.carbonPerDay; // policy tightens as the run climbs
  // v4 (F): age a capacity obligation; it lapses when its term runs out.
  if (S.capacityObligation){
    S.capacityObligation.daysLeft -= 1; S.capacityObligation.calledToday = false;
    if (S.capacityObligation.daysLeft <= 0) S.capacityObligation = null;
  }
  // v4 (F): a run is a finite contract — surviving past maxRunDays is a WIN, not
  // an endless grind. Set the win flag; the view layer reacts to S.over as usual.
  if (S.day > (S.maxRunDays ?? Infinity)){
    S.over = true; S.won = true; S.running = false;
    S.reason = `Contract complete — ${S.day - 1} days operated. The city renews your licence.`;
    return;
  }
  setTicker(S, firstCarbon
    ? `✓ Day ${S.day - 1} cleared — carbon pricing begins at $${Math.round(S.carbon)}/t. Dirty plants cost more now.`
    : `✓ Day ${S.day - 1} cleared — demand rising to ${S.peak} MW peak.`);
}

// Advance the simulation by `dt` real seconds. Returns true if the run just ended.
export function step(S, dt){
  const dtH = dt * (24 / CFG.secondsPerDay); // game-hours elapsed
  S.t += dtH;
  if (S.t >= 24){ S.t -= 24; surviveDay(S); }

  // weather drifts slowly
  S.weather.sun  = clamp(S.weather.sun  + rand(-0.4, 0.4) * dt * 0.15, 0.55, 1.1);
  S.weather.wind = clamp(S.weather.wind + rand(-0.6, 0.6) * dt * 0.15, 0.45, 1.35);

  const diff = 1 + (S.day - 1) * CFG.outageRamp; // outages get worse as days climb

  // unit state machines
  for (const u of S.fleet){
    if (u.status === "starting"){ u.startTimer -= dtH; if (u.startTimer <= 0) u.status = "online"; }
    else if (u.status === "service"){ u.serviceTimer -= dtH; if (u.serviceTimer <= 0){ u.condition = 100; u.status = u.ctrl ? "off" : "online"; setTicker(S, `✓ ${u.name} back from service at 100%.`); } }
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
    else if ((u.kind === "firm" || u.kind === "peaker") && u.status === "online"){
      // per-real-second hazard turned into an exact probability for this frame's dt
      // (1 - e^{-rate·dt}): frame-rate independent and never exceeds 1 on slow frames.
      // v4.1: base rates are low and WEAR dominates (tripHazard), so a maintained
      // plant rarely strains; when it does, it enters a telegraphed warning first.
      if (Math.random() < 1 - Math.exp(-tripHazard(u, diff) * dt)){
        u.status = "strained"; u.strainTimer = CFG.strainWarn;
        setTicker(S, `⚠ ${u.name} straining — ${Math.round(u.cap)} MW at risk; stabilize or fire reserves!`);
      }
    }
    // wear: thermal plants (the only units with condition) degrade while generating —
    // online OR straining (a strained plant is still running). Worn plants strain more,
    // via tripHazard. Batteries and renewables don't wear.
    if (u.condition != null && (u.status === "online" || u.status === "strained")){
      const wmult = u.status === "strained" ? 1.5 : 1; // a straining plant wears a touch faster
      u.condition = Math.max(0, u.condition - CFG.wearRate * wmult * S.mods.wearMult * (S.rmods?.wearMult ?? 1) * dtH);
    }
  }

  // demand: daily shape × peak, lifted by mutators (heat wave / cold snap), then
  // shaved by demand-response research (the demand-SIDE lever).
  S.demand = S.peak * interp(DEMAND_SHAPE, S.t) * (S.mmods?.demandMult ?? 1) * (1 - (S.rmods?.demandShave ?? 0));
  S.capacity = totalCapacity(S);

  // economics — clear the hour through the shared, verified merit-order engine.
  // Aggregate every unit's available MW (0 when off/tripped) into per-tech supply.
  const avail = {};
  for (const u of S.fleet) avail[u.tech] = (avail[u.tech] || 0) + unitOutput(S, u);
  const hr = dispatchHour(avail, S.demand, S.carbon, S.mmods?.fuelMult ?? 1); // carbon + mutator fuel spike re-sort the merit order
  S.price = hr.price;
  S.co2 = hr.served > 0 ? hr.emissions * 1e3 / hr.served : 0; // live intensity, kg CO₂/MWh
  S.co2Total += hr.emissions * dtH;                           // run total, tCO₂ (emissions is tCO₂/h)

  // spin: cost of keeping a thermal plant synced while it's generating (online or
  // straining — a strained plant is still running until it trips).
  const generating = u => (u.kind === "firm" || u.kind === "peaker") && (u.status === "online" || u.status === "strained");
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

  const { contractedMW, contractRevenue } = settleContracts(S.contracts, hr.served);
  S.contractedMW = contractedMW;                            // exposed for D's spot-kill track
  const residualMW = Math.max(0, hr.served - contractedMW); // never negative, never unserved
  const revenue = contractRevenue + residualMW * spot;
  S.cash += (revenue - hr.varCost - spin - fixedOM) * dtH;  // unserved load earns nothing

  // v4.2 (CR-2): surface the existing hour's figures as read-only live readouts.
  // Not new mechanics — just the numbers already summed above, exposed as rates so
  // the status cluster can show cash flow ($/h), spot exposure, and blended price.
  S.served = hr.served;                                     // MW actually delivered
  S.contractRevenue = contractRevenue;                      // $/h locked at contract prices
  let flowPerH = revenue - hr.varCost - spin - fixedOM;     // instantaneous net cash, $/game-hour

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
    S.cash += capacityPayment(S.capacityObligation, dtH / 24);
    flowPerH += capacityPayment(S.capacityObligation, 1 / 24);  // steady availability payment ($/h)
    const capHourNow = Math.floor(S.t);
    if (S.capHour !== capHourNow){
      S.capHour = capHourNow;
      if (S.rng && !S.capacityObligation.calledToday && rollCapacityCall(S, S.rng)){
        S.capacityObligation.calledToday = true;
        const deliverable = S.fleet.reduce((a, u) => a + (((u.kind === "firm" || u.kind === "peaker") && u.status !== "tripped" && u.status !== "service") ? u.cap : 0), 0);
        const fine = capacityPenalty(S.capacityObligation, deliverable);
        if (fine > 0){ S.cash -= fine; setTicker(S, `⚠ Capacity call — short ${Math.round(S.capacityObligation.reserveMW - deliverable)} MW, fined $${Math.round(fine).toLocaleString()}.`); }
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

  autoService(S, dtH); // Service Manager skill (no-op unless owned)

  // reserve margin, brownout, strain
  const shortfall = S.demand - S.capacity;
  const sev = S.demand > 0 ? shortfall / S.demand : 0;
  if (shortfall > 0.5){
    S.brownout = true; S.downAcc += dt;
    S.strain = Math.min(100, S.strain + sev * CFG.strainRate * dt);
    S.satisfaction = Math.max(0, S.satisfaction - sev * CFG.satDrain * dt);
    S.cash -= shortfall * CFG.unservedPenalty * dtH; // lost sales already sting; this adds fines / emergency buys
    if (sev > CFG.instantBlackout){ gameOver(S, `A ${Math.round(sev * 100)}% shortfall collapsed the grid.`); return true; }
    if (S.strain >= 100){ gameOver(S, "Sustained brownout cascaded into a blackout."); return true; }
    if (S.satisfaction <= 0){ gameOver(S, "Customers lost all confidence — the city pulled your licence."); return true; }
  } else {
    S.brownout = false; S.upAcc += dt;
    S.strain = Math.max(0, S.strain - CFG.strainRecover * dt);
    if (S.satisfaction < 100) S.satisfaction = Math.min(100, S.satisfaction + CFG.satRecover * dt);
  }

  // insolvency (v4, Phase C): a second fail-path beside the blackout. Being in the
  // red with debt triggers a one-time default (credit cratered for the run); a
  // catastrophic hole winds you up instantly; otherwise a grace window (like the
  // strain meter) runs before bankruptcy — so a financial death feels earned too.
  if (isInsolvent(S)){
    if (S.debt > 0 && !S.defaulted){ triggerDefault(S); setTicker(S, `⚠ DEFAULT — credit cratered to ${Math.round(S.credit)}. Rates and ceiling slashed.`); }
    if (S.cash < CFG.hardInsolvency){ gameOver(S, "Creditors wound up the utility — assets seized."); return true; }
    S.insolventT += dt;
    if (S.insolventT >= CFG.bankruptcyGrace){ gameOver(S, "Insolvent too long — the utility filed for bankruptcy."); return true; }
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
