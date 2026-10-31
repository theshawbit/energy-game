// ============================================================
// ENERGY ECONOMICS ENGINE — verified merit-order dispatch model.
// Pure functions, no state, no DOM. This is the economic core, unit-tested
// in isolation.
//
//   dispatchHour() — clears ONE hour of a merit-order market. Given the MW
//                    available from each resource and the demand to meet, it
//                    dispatches cheapest-first and returns the served energy,
//                    the uniform clearing price, cost, and emissions. This is
//                    the reusable primitive the real-time loop dispatches with.
//   simulateDay()  — scales a fleet over a representative 24-hour day by
//                    building each hour's availability (renewable profiles +
//                    a day-level battery heuristic) and summing dispatchHour().
// ============================================================
import { HOURS, DAYS, DEMAND_SHAPE, SOLAR_CF, WIND_CF, TECH, ORDER, THERMAL, VOLL, PRICE_CAP } from "./constants.js";

// Gas-burning techs whose marginal cost scales with the fuel-price multiplier.
const GAS_FUEL = new Set(["ccgt", "peaker", "ccs_gas"]);

// Effective marginal cost of a thermal tech, including carbon price and (for
// gas) a fuel-price multiplier. Exported so callers can rank/preview costs.
export function marginalCost(t, carbonPrice = 0, fuelMult = 1) {
  return TECH[t].mc * (GAS_FUEL.has(t) ? fuelMult : 1) + TECH[t].ef * carbonPrice;
}

// Clear a single hour. `avail` is the MW available right now from each resource
// (already derated for weather/forced-outage): {solar, wind, battery, nuclear,
// coal, ccgt, peaker}. Dispatch is cheapest-first — free renewables, then
// battery, then thermal ranked by effective marginal cost — and the clearing
// price is the marginal cost of the last resource dispatched (uniform-price
// auction). Unserved load sets the scarcity price but is never sold.
export function dispatchHour(avail, demandMW, carbonPrice = 0, fuelMult = 1) {
  const mcOf = t => marginalCost(t, carbonPrice, fuelMult);
  const order = [...THERMAL].sort((a, b) => mcOf(a) - mcOf(b));

  let rem = demandMW, price = 0, varCost = 0, emissions = 0;
  // Every dispatchable key present as 0 so callers can sum any tech off the stack
  // (ORDER + the merit-order dispatch set, which includes the v3 THERMAL techs).
  const S = { unserved: 0 };
  for (const t of ORDER) S[t] = 0;
  for (const t of THERMAL) S[t] = 0;

  const su = Math.min(avail.solar || 0, rem); rem -= su; S.solar = su;
  const wu = Math.min(avail.wind || 0, rem); rem -= wu; S.wind = wu;
  const bu = Math.min(avail.battery || 0, rem); rem -= bu; S.battery = bu;
  varCost += bu * TECH.battery.mc; if (bu > 0) price = Math.max(price, TECH.battery.mc);

  for (const t of order) {
    if (rem <= 1e-9) break;
    const use = Math.min(avail[t] || 0, rem);
    if (use > 0) {
      rem -= use; S[t] = use;
      varCost += use * mcOf(t); emissions += use * TECH[t].ef; price = Math.max(price, mcOf(t));
    }
  }

  const unserved = rem > 1e-9 ? rem : 0;
  // v5.3: capture the CONTINUOUS clearing price (marginal cost of the last SERVED unit) BEFORE the
  // scarcity overwrite below. priceServed is what the live sim pays served load on — it never jumps
  // to the cap, so covering strictly dominates going short. `price` stays the scarcity SIGNAL
  // (= PRICE_CAP on any shortfall), unchanged for existing callers. Additive: clearing math untouched.
  const priceServed = price;
  if (unserved > 0) { S.unserved = unserved; price = PRICE_CAP; } // scarcity, but lost load is never sold
  const served = demandMW - unserved;
  S._demand = demandMW;
  return { stack: S, price, priceServed, served, unserved, varCost, emissions, demand: demandMW };
}

export function simulateDay(fleet, peakMW, weather, carbonPrice = 0, fuelMult = 1) {
  const battPower = fleet.battery, battEnergy = fleet.battery * TECH.battery.duration, rte = TECH.battery.rte;

  const demand = DEMAND_SHAPE.map(s => s * peakMW);
  const solarGen = SOLAR_CF.map(cf => cf * weather.sun * fleet.solar);
  const windGen = WIND_CF.map(cf => cf * weather.wind * fleet.wind);
  const netLoad = demand.map((d, h) => d - solarGen[h] - windGen[h]);

  // battery: charge from zero-cost surplus, discharge into the biggest net-load hours
  let stored = 0; const chargeHour = new Array(HOURS).fill(0);
  for (let h = 0; h < HOURS; h++) {
    if (netLoad[h] >= 0) continue;
    const room = battEnergy - stored, draw = Math.min(-netLoad[h], battPower, room / Math.sqrt(rte));
    if (draw > 0) { chargeHour[h] = draw; stored += draw * Math.sqrt(rte); }
  }
  const dischargeHour = new Array(HOURS).fill(0);
  let deliver = stored * Math.sqrt(rte);
  for (const { h } of netLoad.map((nl, h) => ({ nl, h })).filter(x => x.nl > 0).sort((a, b) => b.nl - a.nl)) {
    if (deliver <= 0) break;
    const give = Math.min(deliver, battPower, netLoad[h]); dischargeHour[h] = give; deliver -= give;
  }

  // thermal available capacity is constant across the representative day
  const thermalAvail = {};
  for (const t of THERMAL) thermalAvail[t] = (fleet[t] || 0) * (TECH[t].avail || 1);

  let served = 0, unserved = 0, revenue = 0, varCost = 0, emissions = 0, demandTot = 0;
  const stackSeries = [], priceSeries = [];
  for (let h = 0; h < HOURS; h++) {
    const avail = { solar: solarGen[h], wind: windGen[h], battery: dischargeHour[h], ...thermalAvail };
    const hr = dispatchHour(avail, demand[h], carbonPrice, fuelMult);
    demandTot += demand[h];
    served += hr.served; unserved += hr.unserved; varCost += hr.varCost; emissions += hr.emissions;
    revenue += hr.price * hr.served;
    stackSeries.push(hr.stack); priceSeries.push(hr.price);
  }

  const yr = x => x * DAYS;
  const fixedOM = Object.keys(fleet).reduce((s, k) => s + fleet[k] * TECH[k].fixedOM, 0);
  const grossRev = yr(revenue), varY = yr(varCost), penalty = yr(unserved) * VOLL;
  const energy = yr(served), dem = yr(demandTot), emis = yr(emissions);
  const profit = grossRev - varY - fixedOM - penalty;
  return {
    grossRev, varY, fixedOM, penalty, profit, energy, dem, emis,
    reliability: dem > 0 ? energy / dem : 1,
    co2: energy > 0 ? emis * 1e3 / energy : 0,
    avgPrice: energy > 0 ? grossRev / energy : 0,
    unservedY: yr(unserved), stackSeries, priceSeries, peakMW
  };
}
