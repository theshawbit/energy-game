// ============================================================
// PERSIST — the cross-run profile in browser localStorage: meta-currency,
// purchased skills, unlocked research branches (v3), and best record. Every
// access is wrapped in try/catch so the game still runs in private windows or
// with storage blocked/cleared.
// ============================================================
const KEY = "grid-operator-live-v2";          // v3 added researchUnlocked
const LEGACY_KEYS = ["grid-operator-live-v1"]; // older saves migrate forward

function defaultProfile(){ return { currency:0, skills:{}, researchUnlocked:{}, best:{ days:0, score:0, peak:0 } }; }

// Fill any missing fields from the current shape (so an older save gains
// researchUnlocked, etc.) without dropping the player's banked progress.
function normalize(p){
  const d = defaultProfile();
  return { ...d, ...p,
    skills: { ...(p.skills || {}) },
    researchUnlocked: { ...(p.researchUnlocked || {}) },
    best: { ...d.best, ...(p.best || {}) } };
}

export function loadProfile(){
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
    // no v2 save yet — migrate the newest legacy save forward, if any
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
