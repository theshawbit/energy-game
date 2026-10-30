// ============================================================
// RESEARCH — the in-run tech tree (v3 marquee). Pure: no DOM, no storage, and
// no state mutation beyond the game object a caller hands in. Mirrors meta.js.
//
// Research Points (RP) are an in-run resource (earned by funding an R&D lab —
// see sim.step / actions.setRdFunding) spent here to research nodes. Owned
// nodes turn into `rmods`, the per-run modifiers the sim and actions read.
// Unlike the meta skill tree, research RESETS each run.
//
// Each node's EFFECT lives in computeResearchMods() keyed by node id — the same
// pattern meta.js uses for computeMods() — so adding a node is: one RESEARCH
// entry + one line here. Phase A ships one node per effect type; Phase B fleshes
// the four branches (storage / demand response / advanced gen / transmission).
// ============================================================

// ---- node catalogue ----
// branch groups nodes for the (Phase E) panel; rpCost is the RP price; prereq
// lists node ids that must already be researched; metaGate (Phase C) names the
// profile.researchUnlocked flag required — null = always available.
export const RESEARCH = [
  // transmission / efficiency
  { id:"amp-upgrades", branch:"transmission", label:"Modular Upgrades", rpCost:60, prereq:[], metaGate:null,
    desc:"−15% cost on every plant specialization upgrade" },
  { id:"buff-wear",    branch:"transmission", label:"Condition Monitoring", rpCost:50, prereq:[], metaGate:null,
    desc:"−15% plant wear while generating" },
  { id:"grid-efficiency", branch:"transmission", label:"Grid Efficiency", rpCost:65, prereq:[], metaGate:null,
    desc:"−15% thermal standby (spin) cost" },
  { id:"fast-ramp",       branch:"transmission", label:"Fast Ramp", rpCost:55, prereq:[], metaGate:null,
    desc:"−20% peaker spin-up time" },
  // generation — each unlocks a buildable clean/abated plant (branch gated by the
  // "advgen" meta unlock)
  { id:"unlock-smr",   branch:"generation",   label:"Small Modular Reactor", rpCost:80, prereq:[], metaGate:"advgen",
    desc:"Unlocks building SMRs (clean firm baseload)" },
  { id:"unlock-geo",   branch:"generation",   label:"Geothermal Drilling", rpCost:75, prereq:[], metaGate:"advgen",
    desc:"Unlocks building Geothermal (clean cheap baseload)" },
  { id:"unlock-ccs",   branch:"generation",   label:"Carbon Capture", rpCost:95, prereq:[], metaGate:"advgen",
    desc:"Unlocks Coal+CCS and Gas+CCS (beat the carbon price)" },
  // storage — buffs every battery (branch gated by the "storage" meta unlock)
  { id:"storage-power",    branch:"storage", label:"High-Power Inverters", rpCost:55, prereq:[], metaGate:"storage",
    desc:"+30% discharge power on all batteries" },
  { id:"storage-depth",    branch:"storage", label:"Deep-Cycle Cells", rpCost:70, prereq:[], metaGate:"storage",
    desc:"+50% stored-energy depth on all batteries" },
  { id:"storage-recharge", branch:"storage", label:"Fast Charging", rpCost:55, prereq:[], metaGate:"storage",
    desc:"+50% battery recharge rate" },
  // demand response — shaves the peak itself (branch gated by the "demand" meta unlock)
  { id:"demand-response",  branch:"demand", label:"Demand Response", rpCost:65, prereq:[], metaGate:"demand",
    desc:"Shave 6% off demand (curtail flexible load)" },
  { id:"smart-grid",       branch:"demand", label:"Smart Grid", rpCost:90, prereq:["demand-response"], metaGate:"demand",
    desc:"Deepen the shave to 12% of demand" },
  // forecasting — sharpens the spot-price forecast band (v4 E; branch gated by the
  // "forecasting" meta unlock). A linear ladder: each node narrows the fog further.
  { id:"fc-desk",    branch:"forecast", label:"Forecasting Desk", rpCost:50, prereq:[],            metaGate:"forecasting",
    desc:"Open a forecasting desk — a first, rough spot-price outlook" },
  { id:"fc-models",  branch:"forecast", label:"Market Models",    rpCost:70, prereq:["fc-desk"],   metaGate:"forecasting",
    desc:"Sharpen the forecast band with market models" },
  { id:"fc-nowcast", branch:"forecast", label:"Live Nowcasting",  rpCost:95, prereq:["fc-models"], metaGate:"forecasting",
    desc:"Tightest forecast — a live nowcast of the next hour's spot" },
];

export function researchById(id){ return RESEARCH.find(n => n.id === id); }

// Can node `id` be researched right now? (exists, not already owned, prereqs
// met, affordable, and — Phase C — meta-unlocked). Meta gating is a no-op until
// Phase C supplies S.researchUnlocked; here an absent flag means "available".
export function canResearch(S, id){
  const n = researchById(id);
  if (!n) return false;
  if (S.research?.[id]) return false;
  if (!n.prereq.every(p => S.research?.[p])) return false;
  if (n.metaGate && !(S.researchUnlocked?.[n.metaGate])) return false;
  return (S.rp || 0) >= n.rpCost;
}

// Research node `id`: spend RP, record it, recompute rmods. Returns {ok,msg}.
export function doResearch(S, id){
  const n = researchById(id);
  if (!n) return { ok:false, msg:"Unknown research." };
  if (S.research?.[id]) return { ok:false, msg:"Already researched." };
  if (!n.prereq.every(p => S.research?.[p])) return { ok:false, msg:"Prerequisite not met." };
  if (n.metaGate && !(S.researchUnlocked?.[n.metaGate])) return { ok:false, msg:"Not yet unlocked — see Research Unlocks in Skills." };
  if ((S.rp || 0) < n.rpCost) return { ok:false, msg:"Not enough Research Points." };
  S.rp -= n.rpCost;
  (S.research ||= {})[id] = true;
  S.rmods = computeResearchMods(S.research);
  return { ok:true };
}

// Turn owned research into the per-run modifiers the sim/actions read. Neutral
// (identity) when nothing is researched, exactly like meta.computeMods({}).
export function computeResearchMods(research = {}){
  const has = id => !!research[id];
  return {
    wearMult:        has("buff-wear")    ? 0.85 : 1,   // multiplies CFG.wearRate
    upgradeDiscount: has("amp-upgrades") ? 0.15 : 0,   // v5 Phase 7: cuts progression.upgradeCost (cash axis upgrades)
    spinMult:        has("grid-efficiency") ? 0.85 : 1,// multiplies thermal spin cost
    startTimeMult:   has("fast-ramp")    ? 0.80 : 1,   // multiplies peaker spin-up time
    smrUnlocked:     has("unlock-smr"),                // build gates (see config.BUILD_GATE)
    geoUnlocked:     has("unlock-geo"),
    ccsUnlocked:     has("unlock-ccs"),
    battCapMult:      has("storage-power")    ? 1.30 : 1,  // battery discharge power
    battEnergyMult:   has("storage-depth")    ? 1.50 : 1,  // battery stored-energy depth
    battRechargeMult: has("storage-recharge") ? 1.50 : 1,  // battery recharge rate
    demandShave:     has("smart-grid") ? 0.12 : has("demand-response") ? 0.06 : 0, // fraction of demand shaved
    forecastSkill:   has("fc-nowcast") ? 3 : has("fc-models") ? 2 : has("fc-desk") ? 1 : 0, // v4 (E): spot-forecast sharpness
  };
}
