// ============================================================
// PERSIST — the cross-run profile in browser localStorage: meta-currency,
// purchased skills, and best record. Every access is wrapped in try/catch so
// the game still runs in private windows or with storage blocked/cleared.
// ============================================================
const KEY = "grid-operator-live-v1";

function defaultProfile(){ return { currency:0, skills:{}, best:{ days:0, score:0, peak:0 } }; }

export function loadProfile(){
  try {
    const raw = localStorage.getItem(KEY);
    if (raw){
      const p = JSON.parse(raw);
      return { ...defaultProfile(), ...p, skills: { ...(p.skills || {}) }, best: { ...defaultProfile().best, ...(p.best || {}) } };
    }
  } catch (e) { /* storage unavailable — fall through to a fresh profile */ }
  return defaultProfile();
}

export function saveProfile(profile){
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) { /* ignore */ }
}
