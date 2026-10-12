// ============================================================
// ENERGY ECONOMICS ENGINE — verified merit-order dispatch model.
// Pure function: given a fleet and conditions, returns one year's result.
// No state, no DOM. This is the economic core and is unit-tested in isolation.
// ============================================================
import { HOURS, DAYS, DEMAND_SHAPE, SOLAR_CF, WIND_CF, TECH, THERMAL, VOLL, PRICE_CAP } from "./constants.js";

export function simulateDay(fleet, peakMW, weather, carbonPrice = 0, fuelMult = 1) {
  // effective marginal cost includes carbon price and (for gas) a fuel-price multiplier
  const mcOf = t => (TECH[t].mc * ((t === "ccgt" || t === "peaker") ? fuelMult : 1)) + TECH[t].ef * carbonPrice;
  const order = [...THERMAL].sort((a, b) => mcOf(a) - mcOf(b));
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

  let served = 0, unserved = 0, revenue = 0, varCost = 0, emissions = 0, demandTot = 0;
  const stackSeries = [], priceSeries = [];
  for (let h = 0; h < HOURS; h++) {
    demandTot += demand[h]; let rem = demand[h], price = 0;
    const S = { solar: 0, wind: 0, battery: 0, nuclear: 0, coal: 0, ccgt: 0, peaker: 0, unserved: 0 };
    const su = Math.min(solarGen[h], rem); rem -= su; S.solar = su;
    const wu = Math.min(windGen[h], rem); rem -= wu; S.wind = wu;
    const bu = Math.min(dischargeHour[h], rem); rem -= bu; S.battery = bu;
    varCost += bu * TECH.battery.mc; if (bu > 0) price = Math.max(price, TECH.battery.mc);
    for (const t of order) {
      if (rem <= 1e-9) break;
      const cap = fleet[t] * (TECH[t].avail || 1), use = Math.min(cap, rem);
      if (use > 0) {
        rem -= use; S[t] = use;
        varCost += use * mcOf(t); emissions += use * TECH[t].ef; price = Math.max(price, mcOf(t));
      }
    }
    if (rem > 1e-9) { S.unserved = rem; unserved += rem; price = PRICE_CAP; } // scarcity, but lost load is never sold
    const servedH = demand[h] - Math.max(0, rem); served += servedH; revenue += price * servedH;
    S._demand = demand[h]; stackSeries.push(S); priceSeries.push(price);
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
