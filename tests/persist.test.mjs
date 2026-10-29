// Unit tests for the cross-run profile persistence. v5 is a CLEAN BREAK: a new
// `gridop.v5` key, and v4 (`grid-operator-live-*`) saves are ignored, never
// migrated. A tiny in-memory localStorage stub stands in for the browser.
// Run: `npm test`.
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

// seed a v4 legacy save that MUST be ignored under the v5 clean break
store.set("grid-operator-live-v3", JSON.stringify({ currency: 999, skills: { reserves: 3 }, best: { days: 9, score: 500, peak: 1600 } }));

const { loadProfile, saveProfile } = await import("../src/live/persist.js");

// 1) Clean break: a v4 save is NOT migrated — the v5 profile starts fresh
{
  const p = loadProfile();
  check("v5 ignores the v4 legacy save (no migration)", p.currency === 0 && !p.skills.reserves && p.best.days === 0,
    `currency ${p.currency}`);
  check("the v4 key is left untouched (not consumed/rewritten)", store.get("grid-operator-live-v3").includes("999"));
  check("loading does not auto-write a v5 save when nothing is stored there", !store.has("gridop.v5"));
}

// 2) Fresh profile carries the full current shape
{
  store.clear();
  const fresh = loadProfile();
  check("fresh profile: default shape",
    fresh.currency === 0 && Object.keys(fresh.skills).length === 0 && Object.keys(fresh.researchUnlocked).length === 0 &&
    fresh.credit.standing === CFG.creditStart && fresh.records.netWorth.value === 0 && Object.keys(fresh.economyUnlocked).length === 0);
}

// 3) Round-trip save/load under the v5 key preserves the whole thread (deep copies)
{
  store.clear();
  const p = loadProfile();
  p.currency = 42; p.skills.battery = 2; p.researchUnlocked.storage = true;
  p.credit.standing = 61; p.credit.history.push(61);
  p.records.spotKill = { value: 123, at: 4 };
  p.economyUnlocked["capacity-market"] = true;
  saveProfile(p);
  check("a v5 save is written under the gridop.v5 key", store.has("gridop.v5"));
  const p2 = loadProfile();
  check("saved progress survives a reload",
    p2.currency === 42 && p2.skills.battery === 2 && p2.researchUnlocked.storage === true &&
    p2.credit.standing === 61 && p2.credit.history.includes(61) && p2.records.spotKill.value === 123 &&
    p2.economyUnlocked["capacity-market"] === true);
}

// 4) normalize back-fills missing fields on a partial v5 save (forward-compatible)
{
  store.clear();
  store.set("gridop.v5", JSON.stringify({ currency: 7, records: { netWorth: { value: 500000, at: 3 } } }));
  const p = loadProfile();
  check("a partial v5 save keeps its values and gains the missing shape",
    p.currency === 7 && p.records.netWorth.value === 500000 &&
    p.records.spotKill.value === 0 && p.credit.standing === CFG.creditStart && Array.isArray(p.credit.history));
}

console.log(failed === 0 ? "\nAll persist tests passed." : `\n${failed} persist test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
