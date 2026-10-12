// ============================================================
// GAME STATE & RULES — mutates a game object `G`, no DOM.
// All state lives on G (incl. weather, log, latest result) so the UI
// layer can render purely from it and the two never import each other.
// ============================================================
import { TECH } from "./constants.js";
import { simulateDay } from "./engine.js";

const START = {
  year: 2025, cash: 250e6, peak: 400, carbon: 0, fuelMult: 1,
  fleet: { solar: 0, wind: 0, battery: 0, nuclear: 0, coal: 250, ccgt: 150, peaker: 0 },
  capexMult: { solar: 1, wind: 1, battery: 1 },
  relSum: 0, relYears: 0, cumProfit: 0,
  weather: { sun: 1.0, wind: 1.0 }, log: [], over: false,
};

export function createGame() {
  const G = JSON.parse(JSON.stringify(START));
  pushLog(G, "Grid handed over. Legacy coal &amp; gas online — reliable but dirty. Modernise it.", false);
  recompute(G);
  return G;
}

export function freshWeather() {
  return { sun: +(0.8 + Math.random() * 0.25).toFixed(3), wind: +(0.7 + Math.random() * 0.6).toFixed(3) };
}
export function effCapex(G, t) { return TECH[t].capex * (G.capexMult[t] || 1); }

export function pushLog(G, html, isEvent) {
  G.log.unshift({ html, isEvent });
  if (G.log.length > 40) G.log.pop();
}

export function recompute(G) {
  G.result = simulateDay(G.fleet, G.peak, G.weather, G.carbon, G.fuelMult);
}

// ---- investment actions. Return {ok, msg} so the caller can surface warnings. ----
export function build(G, t) {
  const cost = TECH[t].block * effCapex(G, t);
  if (G.cash - cost < -150e6) {
    return { ok: false, msg: "Not enough credit to build that — advance a year to earn, or build cheaper capacity." };
  }
  G.cash -= cost; G.fleet[t] += TECH[t].block; recompute(G);
  return { ok: true };
}
export function sell(G, t) {
  if (G.fleet[t] <= 0) return { ok: false };
  G.cash += TECH[t].block * effCapex(G, t) * 0.25; // 25% salvage
  G.fleet[t] -= TECH[t].block; recompute(G);
  return { ok: true };
}

const EVENTS = [
  g => { g.peak = Math.round(g.peak * 1.12); return ["Heat wave", "A brutal summer pushes peak demand up 12%."]; },
  g => { g.fuelMult = 1.4; return ["Gas price spike", "Fuel markets jump — gas marginal costs up 40% this year."]; },
  g => { g.carbon += 20; return ["Carbon tax hike", "Regulators raise the carbon price by $20/t."]; },
  g => { g.capexMult.solar *= 0.82; g.capexMult.battery *= 0.80; return ["Tech breakthrough", "Solar &amp; battery capex fall sharply — build clean cheaply now."]; },
  g => { g.peak = Math.round(g.peak * 0.97); return ["Mild year", "A cool, quiet year trims peak demand slightly."]; },
  g => { g.capexMult.wind *= 0.85; return ["Offshore boom", "Wind turbine costs drop 15%."]; },
];

// Advance one year. Banks the current (previewed) result, then rolls conditions
// forward. Returns {ended, win, reason} describing the run outcome.
export function advanceYear(G) {
  if (G.over) return { ended: true };
  const r = G.result;
  G.cash += r.profit; G.cumProfit += r.profit;
  G.relSum += r.reliability; G.relYears++;
  const relTxt = (r.reliability * 100).toFixed(1);
  pushLog(G, `<b>${G.year}</b> banked: profit <b>${fmtMoney(r.profit)}</b> · reliability ${relTxt}% · ${Math.round(r.co2)} kg CO₂/MWh`, false);

  if (r.reliability < 0.85) { G.over = true; return { ended: true, win: false, reason: `Reliability collapsed to ${relTxt}% in ${G.year}. The city revoked your licence.` }; }
  if (G.cash < -150e6) { G.over = true; return { ended: true, win: false, reason: `You ran out of credit in ${G.year} — cash hit ${fmtMoney(G.cash)}.` }; }
  if (G.year >= 2050) { G.over = true; return { ended: true, win: true, reason: "You ran the grid to 2050." }; }

  G.year++;
  G.fuelMult = 1;                        // fuel spike lasts one year
  if (G.year >= 2029) G.carbon += 6;     // policy: carbon price escalates
  G.peak = Math.round(G.peak * 1.025);   // demand growth
  G.capexMult.solar *= 0.97; G.capexMult.wind *= 0.985; G.capexMult.battery *= 0.95; // learning curves
  G.weather = freshWeather();

  let ev = null;
  if (G.year >= 2028 && Math.random() < 0.55) ev = EVENTS[Math.floor(Math.random() * EVENTS.length)](G);
  pushLog(G, `<span class="ev">${G.year} ▸</span> ${ev ? '<b>' + ev[0] + '.</b> ' + ev[1] : 'A steady year. Demand creeps up ~2.5%.'}`, true);

  recompute(G);
  return { ended: false };
}

// Final score 0-100: profitability + reliability + cleanliness.
export function scoreRun(G) {
  const avgRel = G.relYears ? G.relSum / G.relYears : 0;
  const co2 = G.result.co2;
  let sc = 0;
  sc += Math.max(0, Math.min(40, (G.cumProfit / 1e9) * 10 + 20));
  sc += Math.max(0, Math.min(35, (avgRel - 0.9) / 0.099 * 35));
  sc += Math.max(0, Math.min(25, (600 - co2) / 600 * 25));
  sc = Math.round(Math.max(0, Math.min(100, sc)));
  const grade = sc >= 90 ? "A" : sc >= 80 ? "B" : sc >= 68 ? "C" : sc >= 55 ? "D" : "E";
  return { score: sc, grade, avgRel, co2 };
}

// shared money formatter (used by game log and UI)
export function fmtMoney(x) {
  const a = Math.abs(x), s = x < 0 ? "−" : "";
  if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(0) + "k";
  return s + "$" + a.toFixed(0);
}
