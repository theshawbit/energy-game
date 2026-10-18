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
    desc:"Every Mk upgrade adds +10% more capacity" },
  { id:"buff-wear",    branch:"transmission", label:"Condition Monitoring", rpCost:50, prereq:[], metaGate:null,
    desc:"−15% plant wear while generating" },
  // generation (builds unlocked in B4)
  { id:"unlock-smr",   branch:"generation",   label:"Small Modular Reactor", rpCost:80, prereq:[], metaGate:null,
    desc:"Unlocks building SMRs (clean firm baseload)" },
  // storage — buffs every battery
  { id:"storage-power",    branch:"storage", label:"High-Power Inverters", rpCost:55, prereq:[], metaGate:null,
    desc:"+30% discharge power on all batteries" },
  { id:"storage-depth",    branch:"storage", label:"Deep-Cycle Cells", rpCost:70, prereq:[], metaGate:null,
    desc:"+50% stored-energy depth on all batteries" },
  { id:"storage-recharge", branch:"storage", label:"Fast Charging", rpCost:55, prereq:[], metaGate:null,
    desc:"+50% battery recharge rate" },
  // demand response — shaves the peak itself (demand-side lever)
  { id:"demand-response",  branch:"demand", label:"Demand Response", rpCost:65, prereq:[], metaGate:null,
    desc:"Shave 6% off demand (curtail flexible load)" },
  { id:"smart-grid",       branch:"demand", label:"Smart Grid", rpCost:90, prereq:["demand-response"], metaGate:null,
    desc:"Deepen the shave to 12% of demand" },
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
    upgradeCapBonus: has("amp-upgrades") ? 0.10 : 0,   // added to UPGRADE.capMult−1
    smrUnlocked:     has("unlock-smr"),                // gates the SMR build (Phase B)
    battCapMult:      has("storage-power")    ? 1.30 : 1,  // battery discharge power
    battEnergyMult:   has("storage-depth")    ? 1.50 : 1,  // battery stored-energy depth
    battRechargeMult: has("storage-recharge") ? 1.50 : 1,  // battery recharge rate
    demandShave:     has("smart-grid") ? 0.12 : has("demand-response") ? 0.06 : 0, // fraction of demand shaved
  };
}
