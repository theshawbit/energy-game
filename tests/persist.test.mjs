// Unit tests for the cross-run profile persistence & the canonical v1→v2→v3
// migration (v4 p0). A tiny in-memory localStorage stub stands in for the
// browser. Run: `npm test`.
import { CFG } from "../src/live/config.js";

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

// seed a legacy v1 save (no researchUnlocked, no v4 Book thread)
store.set("grid-operator-live-v1", JSON.stringify({ currency: 12, skills: { reserves: 2 }, best: { days: 5, score: 300, peak: 1200 } }));

const { loadProfile, saveProfile } = await import("../src/live/persist.js");

// 1) A v1 save migrates all the way forward: progress kept, every v3/v4 field added
const p = loadProfile();
check("migration keeps currency & skills", p.currency === 12 && p.skills.reserves === 2);
check("migration keeps best record", p.best.days === 5 && p.best.score === 300 && p.best.peak === 1200);
check("migration adds an empty researchUnlocked (v3)", p.researchUnlocked && Object.keys(p.researchUnlocked).length === 0);
check("migration adds the v4 credit standing", p.credit && p.credit.standing === CFG.creditStart && p.credit.everDefaulted === false && Array.isArray(p.credit.history));
check("migration adds economyUnlocked + the four record tracks", p.economyUnlocked && Object.keys(p.economyUnlocked).length === 0 &&
  p.records.longevity.value === 0 && p.records.netWorth.value === 0 && p.records.cleanShare.value === 0 && p.records.spotKill.value === 0);
check("migration writes the v3 key so it runs once", store.has("grid-operator-live-v3"));

// 2) A v3 save takes precedence over legacy keys and preserves the Book thread
store.set("grid-operator-live-v3", JSON.stringify({ currency: 99, skills: {}, researchUnlocked: { storage: true },
  best: {}, credit: { standing: 42, best: 88, everDefaulted: true, defaults: 2, history: [42] },
  economyUnlocked: { capacity: true }, records: { netWorth: { value: 750000, at: 9 } } }));
const p2 = loadProfile();
check("v3 save is preferred and preserves unlocks + credit", p2.currency === 99 && p2.researchUnlocked.storage === true &&
  p2.credit.standing === 42 && p2.credit.defaults === 2 && p2.economyUnlocked.capacity === true && p2.records.netWorth.value === 750000);
check("partial records sub-object is back-filled with the missing tracks", p2.records.spotKill && p2.records.spotKill.value === 0 && p2.records.cleanShare.value === 0);

// 3) A round-trip save/load preserves the whole v4 thread (deep copies, not shared)
p2.credit.history.push(55); p2.records.spotKill = { value: 123, at: 4 }; saveProfile(p2);
const p3 = loadProfile();
check("saved credit history + records survive a reload", p3.credit.history.includes(55) && p3.records.spotKill.value === 123 && p3.researchUnlocked.storage);

// 4) A v2 save (no Book thread) migrates forward keeping v3 unlocks, gaining v4 fields
store.clear();
store.set("grid-operator-live-v2", JSON.stringify({ currency: 30, skills: { battery: 1 }, researchUnlocked: { advgen: true }, best: { days: 3, score: 120, peak: 900 } }));
const pv2 = loadProfile();
check("v2 → v3 keeps unlocks and gains the credit standing", pv2.currency === 30 && pv2.researchUnlocked.advgen === true && pv2.credit.standing === CFG.creditStart && pv2.records.longevity.value === 0);

// 5) Fresh profile when nothing is stored
store.clear();
const fresh = loadProfile();
check("no save → default profile with the full v4 shape", fresh.currency === 0 && Object.keys(fresh.skills).length === 0 &&
  Object.keys(fresh.researchUnlocked).length === 0 && fresh.credit.standing === CFG.creditStart && fresh.records.netWorth.value === 0);

console.log(failed === 0 ? "\nAll persist tests passed." : `\n${failed} persist test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
