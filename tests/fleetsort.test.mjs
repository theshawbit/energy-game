// Unit tests for the Manage → Fleet table comparators (v4, Phase A). No DOM.
// Run: `npm test`. Pins the needs-attention default order and each column sort.
import { attentionRank, compareNeedsAttention, makeFleetComparator, needsAttention, ATTENTION_BAND } from "../src/live/fleetsort.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const ids = arr => arr.map(u => u.id).join(",");

// A mixed fleet: tripped, worn + healthy thermal, a renewable, a battery. (v5.3 Phase 3:
// the "service" status is deleted — a worn online coal plant stands in as a second worn unit.)
const tripped = { id: "pk2", name: "Peaker B", status: "tripped",  condition: 55, kind: "peaker" };
const service = { id: "co1", name: "Coal",     status: "online",   condition: 20, kind: "firm" };
const worn    = { id: "pk1", name: "Peaker A", status: "online",   condition: 18, kind: "peaker" };
const mid     = { id: "nu1", name: "Nuclear",  status: "online",   condition: 70, kind: "firm" };
const healthy = { id: " cc", name: "CCGT",     status: "off",      condition: 99, kind: "peaker" };
const solar   = { id: "sol", name: "Solar",    status: "online",   condition: null, kind: "renew" };
const batt    = { id: "bat", name: "Battery",  status: "off",      condition: null, kind: "battery" };
const fleet = [mid, solar, tripped, healthy, worn, batt, service];

const strained = { id: "pk3", name: "Peaker C", status: "strained", condition: 40, kind: "peaker" };

// 1) attentionRank ordering primitives
check("tripped outranks strained", attentionRank(tripped) < attentionRank(strained));
check("strained outranks worn thermal", attentionRank(strained) < attentionRank(worn));
check("worn thermal outranks healthy thermal", attentionRank(worn) < attentionRank(mid));
check("thermal outranks condition-less units", attentionRank(mid) < attentionRank(solar));

// 2) default needs-attention sort: tripped first, then worn→healthy thermal by condition, renew/battery last
{
  const sorted = [...fleet].sort(compareNeedsAttention);
  check("needs-attention order", ids(sorted) === "pk2,pk1,co1,nu1, cc,bat,sol", ids(sorted));
}

// 3) condition column: ascending puts lowest condition first; null sinks to the end
{
  const asc = [...fleet].sort(makeFleetComparator("condition", 1));
  check("condition asc: worn first", asc[0].id === "pk1" && asc[1].id === "co1");
  check("condition asc: null-condition last", asc[asc.length - 1].condition == null && asc[asc.length - 2].condition == null);
  // desc: among the units with a condition, higher condition comes earlier
  const desc = [...fleet].sort(makeFleetComparator("condition", -1));
  const pos = id => desc.findIndex(u => u.id === id);
  check("condition desc: higher condition earlier", pos(" cc") < pos("nu1") && pos("nu1") < pos("pk2"), ids(desc));
}

// 4) output column uses the injected outputOf, ascending/descending
{
  const out = { pk2: 10, co1: 0, pk1: 40, nu1: 300, " cc": 5, sol: 120, bat: 0 };
  const of = u => out[u.id] ?? 0;
  const asc = [...fleet].sort(makeFleetComparator("output", 1, of));
  const desc = [...fleet].sort(makeFleetComparator("output", -1, of));
  check("output asc: lowest first", of(asc[0]) <= of(asc[1]) && of(asc[0]) === 0);
  check("output desc: highest first", of(desc[0]) === 300 && desc[0].id === "nu1");
}

// 5) name column, ascending alphabetical
{
  const asc = [...fleet].sort(makeFleetComparator("name", 1));
  check("name asc alphabetical", asc[0].name === "Battery" && asc[asc.length - 1].name === "Solar", ids(asc));
}

// 6) stable tiebreak: equal attention rank falls back to id, deterministically
{
  const a = { id: "aa", name: "A", status: "off", condition: 50, kind: "firm" };
  const b = { id: "bb", name: "B", status: "off", condition: 50, kind: "firm" };
  const s1 = [a, b].sort(compareNeedsAttention), s2 = [b, a].sort(compareNeedsAttention);
  check("equal rank: stable id tiebreak", ids(s1) === "aa,bb" && ids(s2) === "aa,bb");
}

// 7) needsAttention (v5.4 Phase 6): the promotion-by-exception predicate. Reuses status +
// condition; tripped/strained/maint always promote, worn-below-band promotes, healthy does not.
{
  check("tripped needs attention", needsAttention(tripped));
  check("strained needs attention", needsAttention(strained));
  check("in-shop (maint) needs attention", needsAttention({ id: "m", status: "maint", condition: 99, kind: "firm" }));
  check("maintDown needs attention", needsAttention({ id: "d", status: "off", maintDown: true, condition: 99, kind: "firm" }));
  check("worn below band needs attention", needsAttention(worn) && worn.condition < ATTENTION_BAND);
  check("healthy thermal does NOT (condition >= band)", !needsAttention(healthy) && healthy.condition >= ATTENTION_BAND);
  check("mid thermal below band promotes", needsAttention(mid) === (mid.condition < ATTENTION_BAND));
  check("condition-less idle renewable does NOT", !needsAttention(solar));
  check("condition-less idle battery does NOT", !needsAttention(batt));
  check("band is the trip-risk onset", ATTENTION_BAND === 85);
}

console.log(failed === 0 ? "\nAll fleetsort tests passed." : `\n${failed} fleetsort test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
