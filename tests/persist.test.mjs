// Unit tests for the cross-run profile persistence & v1→v2 migration (v3, C1).
// A tiny in-memory localStorage stub stands in for the browser. Run: `npm test`.
let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}

// in-memory localStorage shim, installed before importing persist.js
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

// seed a legacy v1 save (no researchUnlocked field)
store.set("grid-operator-live-v1", JSON.stringify({ currency: 12, skills: { reserves: 2 }, best: { days: 5, score: 300, peak: 1200 } }));

const { loadProfile, saveProfile } = await import("../src/live/persist.js");

// 1) A v1 save migrates forward: progress kept, researchUnlocked added
const p = loadProfile();
check("migration keeps currency & skills", p.currency === 12 && p.skills.reserves === 2);
check("migration keeps best record", p.best.days === 5 && p.best.score === 300 && p.best.peak === 1200);
check("migration adds an empty researchUnlocked", p.researchUnlocked && Object.keys(p.researchUnlocked).length === 0);
check("migration writes the v2 key so it runs once", store.has("grid-operator-live-v2"));

// 2) A v2 save takes precedence over the legacy key
store.set("grid-operator-live-v2", JSON.stringify({ currency: 99, skills: {}, researchUnlocked: { storage: true }, best: {} }));
const p2 = loadProfile();
check("v2 save is preferred and preserves unlocks", p2.currency === 99 && p2.researchUnlocked.storage === true);

// 3) A round-trip save/load preserves researchUnlocked
p2.researchUnlocked.advgen = true; saveProfile(p2);
const p3 = loadProfile();
check("saved unlocks survive a reload", p3.researchUnlocked.storage && p3.researchUnlocked.advgen);

// 4) Fresh profile when nothing is stored
store.clear();
const fresh = loadProfile();
check("no save → default profile", fresh.currency === 0 && Object.keys(fresh.skills).length === 0 && Object.keys(fresh.researchUnlocked).length === 0);

console.log(failed === 0 ? "\nAll persist tests passed." : `\n${failed} persist test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
