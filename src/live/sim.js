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
import { CFG, makeFleet } from "./config.js";

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function freshWeather(){ return { sun: rand(0.7, 1.05), wind: rand(0.6, 1.25) }; }

// linear interpolation around the 24h shape arrays
export function interp(arr, t){
  const h = ((t % 24) + 24) % 24, i = Math.floor(h), f = h - i;
  return arr[i] * (1 - f) + arr[(i + 1) % 24] * f;
}

export function createGame(){
  return {
    running:false, paused:false, menuOpen:false, over:false, reason:"",
    t:CFG.startHour, day:1, peak:CFG.startPeak,
    cash:CFG.startCash, satisfaction:100, strain:0,
    carbon:0, co2:0, co2Total:0,
    fleet:makeFleet(), weather:freshWeather(), buildSeq:1,
    demand:0, capacity:0, price:0, brownout:false,
    hist:[], sampleAcc:0, upAcc:0, downAcc:0,
    ticker:"", tickerT:0,
  };
}

export function setTicker(S, msg){ S.ticker = msg; S.tickerT = 3.5; }

// Per-real-second trip hazard for a thermal unit: its base rate, scaled up as
// the run climbs (diff) and as the plant wears (condition → more failures).
export function tripHazard(u, diff){
  const wear = u.condition != null ? 1 + CFG.wearTripK * (1 - u.condition / 100) : 1;
  return u.fail * diff * wear;
}

// ---- capacity accounting ----
export function unitOutput(S, u){
  if (u.kind === "renew") return u.cap * interp(u.cf, S.t) * (u.id === "sol" ? S.weather.sun : S.weather.wind);
  if (u.kind === "battery") return (u.status === "discharge" && u.energy > 0) ? u.cap : 0;
  return u.status === "online" ? u.cap : 0; // firm / peaker
}
export function totalCapacity(S){ return S.fleet.reduce((a, u) => a + unitOutput(S, u), 0); }

function gameOver(S, reason){ S.over = true; S.running = false; S.reason = reason; }

export function surviveDay(S){
  S.day++; S.peak = Math.round(S.peak * CFG.peakGrowth); S.weather = freshWeather();
  S.strain = Math.max(0, S.strain - 30);
  const firstCarbon = S.carbon === 0 && S.day >= CFG.carbonStartDay;
  if (S.day >= CFG.carbonStartDay) S.carbon += CFG.carbonPerDay; // policy tightens as the run climbs
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

  const diff = 1 + (S.day - 1) * 0.18; // outages get worse as days climb

  // unit state machines
  for (const u of S.fleet){
    if (u.status === "starting"){ u.startTimer -= dtH; if (u.startTimer <= 0) u.status = "online"; }
    else if (u.status === "service"){ u.serviceTimer -= dtH; if (u.serviceTimer <= 0){ u.condition = 100; u.status = u.ctrl ? "off" : "online"; setTicker(S, `✓ ${u.name} back from service at 100%.`); } }
    else if (u.status === "tripped"){ u.tripTimer -= dtH; if (u.tripTimer <= 0) u.status = u.ctrl ? "off" : "online"; }
    else if ((u.kind === "firm" || u.kind === "peaker") && u.status === "online"){
      // per-real-second hazard turned into an exact probability for this frame's dt
      // (1 - e^{-rate·dt}): frame-rate independent and never exceeds 1 on slow frames
      if (Math.random() < 1 - Math.exp(-tripHazard(u, diff) * dt)){ // trip!
        u.status = "tripped"; u.tripTimer = rand(u.recover[0], u.recover[1]);
        setTicker(S, `⚠ ${u.name} tripped offline — ${Math.round(u.cap)} MW lost!`);
      }
    }
    // wear: plants degrade while generating (worn plants trip more, via tripHazard)
    if (u.condition != null){
      const generating = u.kind === "battery" ? u.status === "discharge" : u.status === "online";
      if (generating) u.condition = Math.max(0, u.condition - CFG.wearRate * dtH);
    }
  }

  // demand (daily shape, scaled to current peak)
  S.demand = S.peak * interp(DEMAND_SHAPE, S.t);
  S.capacity = totalCapacity(S);

  // economics — clear the hour through the shared, verified merit-order engine.
  // Aggregate every unit's available MW (0 when off/tripped) into per-tech supply.
  const avail = {};
  for (const u of S.fleet) avail[u.tech] = (avail[u.tech] || 0) + unitOutput(S, u);
  const hr = dispatchHour(avail, S.demand, S.carbon, 1); // carbon price re-sorts the merit order; fuel-mult hook reserved
  S.price = hr.price;
  S.co2 = hr.served > 0 ? hr.emissions * 1e3 / hr.served : 0; // live intensity, kg CO₂/MWh
  S.co2Total += hr.emissions * dtH;                           // run total, tCO₂ (emissions is tCO₂/h)

  // spin: cost of keeping thermal plants synced even when not fully dispatched
  const spin = S.fleet.reduce((a, u) => a + (((u.kind === "firm" || u.kind === "peaker") && u.status === "online") ? u.cap * (u.spin ?? CFG.spinCost) : 0), 0);
  S.cash += (hr.price * hr.served - hr.varCost - spin) * dtH; // unserved load earns nothing

  // battery: drain only by the MW the market actually dispatched this tick; otherwise
  // recharge from genuine surplus, bought at the clearing price (free at a $0 price)
  const bat = S.fleet.find(u => u.id === "bat");
  if (bat.status === "discharge"){
    bat.energy = Math.max(0, bat.energy - hr.stack.battery * dtH);
    if (bat.energy <= 0){ bat.status = "off"; setTicker(S, "Battery depleted."); }
  } else if (bat.energy < bat.maxEnergy){
    const surplus = Math.max(0, S.capacity - S.demand);
    const add = Math.min(CFG.battRecharge * dtH, surplus * dtH, bat.maxEnergy - bat.energy);
    if (add > 0){ bat.energy += add; S.cash -= add * hr.price; }
  }

  // reserve margin, brownout, strain
  const shortfall = S.demand - S.capacity;
  const sev = S.demand > 0 ? shortfall / S.demand : 0;
  if (shortfall > 0.5){
    S.brownout = true; S.downAcc += dt;
    S.strain = Math.min(100, S.strain + sev * CFG.strainRate * dt);
    S.satisfaction = Math.max(0, S.satisfaction - sev * 22 * dt);
    S.cash -= shortfall * 120 * dtH; // unserved load is costly
    if (sev > CFG.instantBlackout){ gameOver(S, `A ${Math.round(sev * 100)}% shortfall collapsed the grid.`); return true; }
    if (S.strain >= 100){ gameOver(S, "Sustained brownout cascaded into a blackout."); return true; }
  } else {
    S.brownout = false; S.upAcc += dt;
    S.strain = Math.max(0, S.strain - CFG.strainRecover * dt);
    if (S.satisfaction < 100) S.satisfaction = Math.min(100, S.satisfaction + 3 * dt);
  }

  // history sample for the scrolling chart (~every 0.2s)
  S.sampleAcc += dt;
  if (S.sampleAcc >= 0.2){ S.sampleAcc = 0; S.hist.push({ d:S.demand, c:S.capacity }); if (S.hist.length > 260) S.hist.shift(); }

  if (S.tickerT > 0){ S.tickerT -= dt; if (S.tickerT <= 0) S.ticker = ""; }
  return false;
}
