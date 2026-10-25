// ============================================================
// PERSIST — the cross-run profile in browser localStorage: meta-currency,
// purchased skills, unlocked research branches (v3), the best record, and the
// v4 "The Book" thread (credit standing + record, economy unlocks, per-track
// records). Every access is wrapped in try/catch so the game still runs in
// private windows or with storage blocked/cleared.
//
// v4 bumps the key to v3 and migrates v2 / v1 saves forward in ONE step: this is
// the single canonical migration — later phases only read/write fields it already
// creates. normalize() deep-merges every sub-object so an old save gains the new
// fields without losing banked progress.
// ============================================================
import { CFG } from "./config.js";

const KEY = "grid-operator-live-v3";                              // v4 added the Book thread
const LEGACY_KEYS = ["grid-operator-live-v2", "grid-operator-live-v1"]; // newest-first

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
    // no v3 save yet — migrate the newest legacy save forward, if any
    for (const k of LEGACY_KEYS){
      const legacy = localStorage.getItem(k);
      if (legacy){
        const migrated = normalize(JSON.parse(legacy));
        saveProfile(migrated); // write it under the new key so this runs once
        return migrated;
      }
    }
  } catch (e) { /* storage unavailable — fall through to a fresh profile */ }
  return defaultProfile();
}

export function saveProfile(profile){
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) { /* ignore */ }
}
