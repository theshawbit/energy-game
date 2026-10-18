// Static configuration & data tables for the simulation.
// Pure data only — no state, no DOM. Safe to import anywhere.

export const HOURS = 24;
export const DAYS = 365;

// Hourly shapes on an average day (fraction of peak / capacity factor)
export const DEMAND_SHAPE = [.55,.52,.50,.49,.50,.54,.62,.72,.80,.82,.83,.84,.84,.83,.82,.83,.86,.92,1.00,.98,.90,.80,.68,.60];
export const SOLAR_CF     = [0,0,0,0,0,.05,.15,.30,.50,.68,.82,.90,.92,.88,.78,.62,.42,.22,.08,0,0,0,0,0];
export const WIND_CF      = [.45,.47,.48,.48,.46,.44,.40,.36,.33,.30,.30,.32,.34,.36,.38,.40,.42,.45,.48,.50,.50,.49,.47,.46];

// Technology economics. capex $/MW, fixedOM $/MW/yr, mc $/MWh, ef tCO2/MWh.
export const TECH = {
  solar:  {name:"Solar PV",   capex:1.0e6, fixedOM:15000, mc:0,  ef:0,   block:25, color:"--t-solar",   note:"free fuel · daytime only"},
  wind:   {name:"Wind",       capex:1.4e6, fixedOM:40000, mc:0,  ef:0,   block:25, color:"--t-wind",    note:"free fuel · variable"},
  battery:{name:"Battery 4h", capex:1.6e6, fixedOM:10000, mc:1,  ef:0,   block:25, color:"--t-battery", note:"4h storage · shifts peaks", duration:4, rte:.9},
  nuclear:{name:"Nuclear",    capex:6.5e6, fixedOM:120000,mc:10, ef:0,   block:100,color:"--t-nuclear", note:"baseload · 92% avail", avail:.92},
  coal:   {name:"Coal",       capex:3.0e6, fixedOM:60000, mc:35, ef:.95, block:50, color:"--t-coal",    note:"dirty · 0.95 tCO₂/MWh", avail:.90},
  ccgt:   {name:"Gas CCGT",   capex:1.0e6, fixedOM:25000, mc:55, ef:.37, block:50, color:"--t-ccgt",    note:"flexible · 0.37 tCO₂/MWh", avail:.90},
  peaker: {name:"Gas Peaker", capex:0.8e6, fixedOM:20000, mc:120,ef:.55, block:25, color:"--t-peaker",  note:"last resort · pricey", avail:.90},
  // ---- v3 researchable techs (surfaced in the LIVE game via the build catalogue;
  //      intentionally NOT added to ORDER so the batch reference game is unchanged) ----
  geo:    {name:"Geothermal",  capex:3.5e6, fixedOM:90000, mc:6,  ef:0,   block:50, color:"--t-geo",     note:"clean firm baseload", avail:.90},
  smr:    {name:"SMR",         capex:4.0e6, fixedOM:90000, mc:14, ef:0,   block:50, color:"--t-smr",     note:"modular nuclear · clean firm", avail:.93},
  ccs_coal:{name:"Coal + CCS", capex:4.5e6, fixedOM:90000, mc:70, ef:.12, block:50, color:"--t-ccs-coal",note:"captured coal · 0.12 tCO₂/MWh", avail:.88},
  ccs_gas: {name:"Gas + CCS",  capex:1.8e6, fixedOM:40000, mc:75, ef:.05, block:50, color:"--t-ccs-gas", note:"captured gas · 0.05 tCO₂/MWh", avail:.88},
};

// Display / dispatch ordering. ORDER drives the BATCH game's stack chart/legend
// and is deliberately left as the original seven. THERMAL is the dispatch set the
// merit-order engine sorts by cost — the v3 techs join here so the live game
// prices and ranks them; they carry zero availability for any fleet that hasn't
// built them, so existing results are unchanged.
export const ORDER = ["solar","wind","battery","nuclear","coal","ccgt","peaker"];
export const THERMAL = ["nuclear","smr","geo","coal","ccs_coal","ccgt","ccs_gas","peaker"];

export const VOLL = 4000;      // $/MWh value of lost load (blackout penalty only)
export const PRICE_CAP = 300;  // $/MWh market offer cap (scarcity price ceiling)
