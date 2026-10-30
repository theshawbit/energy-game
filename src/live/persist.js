// ============================================================
// PERSIST — the cross-run profile in browser localStorage: meta-currency,
// purchased skills, unlocked research branches (v3), the best record, and the
// v4 "The Book" thread (credit standing + record, economy unlocks, per-track
// records). Every access is wrapped in try/catch so the game still runs in
// private windows or with storage blocked/cleared.
//
// v5 is a CLEAN BREAK: it moves to the `gridop.v5` key and does NOT migrate the v4
// (`grid-operator-live-*`) saves — v5 is effectively a new game, so it starts fresh
// rather than mapping a fundamentally different model forward. normalize() still
// deep-merges the current shape so a partial save gains any missing fields.
// ============================================================
import { CFG } from "./config.js";

// v5 clean-break namespace. v4 keys (grid-operator-live-v*) are left untouched and
// are never read, so a returning player starts the persistent grid fresh.
const KEY = "gridop.v5";

function defaultProfile(){
  return {
    // --- kept from v2 (untouched) ---
    currency:0, skills:{}, researchUnlocked:{}, best:{ days:0, score:0, peak:0 },
    // --- new in v4 "The Book" ---
    economyUnlocked:{},                                          // { unlockId:true } — Phase F spends here
    credit:{ standing:CFG.creditStart, best:CFG.creditStart,     // the carried credit STANDING + record
             everDefaulted:false, defaults:0, history:[] },
    records:{                                                    // per-track bests (stats hub, Phase D)
      longevity:{ value:0, at:null },
      netWorth:{ value:0, at:null },
      cleanShare:{ value:0, at:null },
      spotKill:{ value:0, at:null },
    },
  };
}

// Fill any missing fields from the current shape (so an older save gains the v4
// thread, etc.) without dropping the player's banked progress. Deep-merges every
// sub-object; the `records` tracks each keep their own {value,at} default.
function normalize(p){
  const d = defaultProfile();
  const rec = {};
  for (const k in d.records) rec[k] = { ...d.records[k], ...((p.records || {})[k] || {}) };
  return { ...d, ...p,
    skills: { ...(p.skills || {}) },
    researchUnlocked: { ...(p.researchUnlocked || {}) },
    best: { ...d.best, ...(p.best || {}) },
    economyUnlocked: { ...(p.economyUnlocked || {}) },
    credit: { ...d.credit, ...(p.credit || {}),
              history: [ ...((p.credit || {}).history || []) ] },
    records: rec };
}

export function loadProfile(){
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
    // v5 clean break: no legacy migration — a v4 save is ignored, not carried.
  } catch (e) { /* storage unavailable — fall through to a fresh profile */ }
  return defaultProfile();
}

export function saveProfile(profile){
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) { /* ignore */ }
}
