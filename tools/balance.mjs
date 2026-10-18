// Balance harness — drives the pure live sim with a heuristic "competent
// player" and reports the survival distribution + death causes over many runs.
// No DOM; tuning is data-driven, not eyeballed. Run: `node tools/balance.mjs [runs] [skillsJSON]`
import { createGame, step } from "../src/live/sim.js";
import { toggleUnit, buildCapacity, upgradeUnit, serviceUnit, setRdFunding, researchNode } from "../src/live/actions.js";
import { canResearch } from "../src/live/research.js";
import { rollMutators } from "../src/live/mutators.js";
import { CFG } from "../src/live/config.js";

const RUNS = parseInt(process.argv[2] || "80", 10);
const SKILLS = process.argv[3] ? JSON.parse(process.argv[3]) : {};
// The harness plays with every research branch meta-unlocked, so the policy can
// exercise the whole tree (what we're here to balance).
const UNLOCKED = { storage: true, demand: true, advgen: true };

// Research priority for the heuristic player: cheap efficiency first, then storage
// / demand levers, then the build unlocks. One node per manage tick, cheapest-first
// within reach.
const RESEARCH_PRIORITY = [
  "buff-wear", "grid-efficiency", "amp-upgrades", "fast-ramp",
  "storage-power", "demand-response", "storage-depth", "storage-recharge",
  "smart-grid", "unlock-smr", "unlock-geo", "unlock-ccs",
];

// ---- heuristic player ----
// Pre-arm peakers through the evening ramp, stand them down off-peak to save
// cash, fire the battery in emergencies, service worn plants and invest surplus.
function play(S){
  const margin = (S.capacity - S.demand) / Math.max(1, S.demand);
  // arm reserves through the evening ramp, OR any time the margin gets thin
  // (e.g. a plant trips off-peak) — a competent player reacts to emergencies.
  const wantPeakers = (S.t >= 14.5 && S.t <= 20.5) || margin < 0.12;
  for (const u of S.fleet){
    if (u.kind === "peaker"){
      if (wantPeakers && u.status === "off") toggleUnit(S, u.id);
      else if (!wantPeakers && (u.status === "online" || u.status === "starting") && margin > 0.30) toggleUnit(S, u.id);
    }
    if (u.id === "bat"){
      if (margin < 0.05 && u.status !== "discharge" && u.energy > 1) toggleUnit(S, u.id);
      else if (margin > 0.25 && u.status === "discharge") toggleUnit(S, u.id);
    }
  }
}
// R&D funding policy: divert cash into Research Points when there's comfortable
// headroom and we're clear of the evening ramp; cut funding to $0 when stressed.
function fund(S){
  const margin = (S.capacity - S.demand) / Math.max(1, S.demand);
  const comfortable = S.cash > 150000 && margin > 0.15 && (S.t < 14.5 || S.t > 21);
  setRdFunding(S, comfortable ? Math.round(CFG.rdFundingMax * 0.5) : 0);
}

function manage(S){
  // service badly worn plants off-peak (avoid pulling capacity near the peak)
  if (S.t < 13 || S.t > 21){
    const worn = S.fleet.filter(u => u.condition != null && u.status !== "service" && u.condition < 40).sort((a, b) => a.condition - b.condition);
    for (const u of worn){ if (S.cash > 120000 && serviceUnit(S, u.id).ok) break; }
  }
  // spend banked RP on the next affordable research node (cheapest-first priority)
  for (const id of RESEARCH_PRIORITY){ if (canResearch(S, id)){ researchNode(S, id); break; } }
  // invest surplus cash to stay ahead of demand growth
  const dispatchable = S.fleet.filter(u => u.kind === "firm" || u.kind === "peaker").reduce((a, u) => a + u.cap, 0);
  if (S.cash > 260000 && dispatchable < S.peak * 1.35){
    const up = S.fleet.find(u => (u.tier || 1) < 3 && (u.kind === "firm" || u.kind === "peaker"));
    if (up) upgradeUnit(S, up.id); else buildCapacity(S, "peaker");
  }
}

function runOne(){
  const mutators = rollMutators();
  const S = createGame(SKILLS, UNLOCKED, mutators);
  S.running = true;
  let playAcc = 0, manageAcc = 0, minCash = S.cash;
  const DT = 0.05; // ~20 decision frames per real second
  let guard = 0;
  while (!S.over && guard < 2_000_000){
    guard++;
    const endedByStep = step(S, DT);
    minCash = Math.min(minCash, S.cash);
    playAcc += DT; manageAcc += DT * (24 / 48); // manageAcc in game-hours
    if (playAcc >= 0.25){ playAcc = 0; play(S); fund(S); } // ~5× per real second
    if (manageAcc >= 6){ manageAcc = 0; manage(S); }        // 4× per in-game day
    if (endedByStep) break;
  }
  const cause = S.reason.includes("collapsed") ? "instant" : S.reason.includes("cascaded") ? "strain" : "other";
  const online = S.fleet.filter(u => (u.kind === "firm" || u.kind === "peaker") && u.status === "online").length;
  const tripped = S.fleet.filter(u => u.status === "tripped").length;
  const days = S.day - 1;
  return { days, peak: S.peak, cash: Math.round(S.cash), minCash: Math.round(minCash), cause,
           deathHour: Math.round(S.t), deathShort: Math.round((S.demand - S.capacity) / Math.max(1, S.demand) * 100), tripped, online,
           researched: Object.keys(S.research).length, rpBanked: Math.round(S.rp),
           mutators };
}

const res = Array.from({ length: RUNS }, runOne);
const days = res.map(r => r.days).sort((a, b) => a - b);
const pct = q => days[Math.min(days.length - 1, Math.floor(q * days.length))];
const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
const causes = res.reduce((m, r) => (m[r.cause] = (m[r.cause] || 0) + 1, m), {});
const survN = n => Math.round(100 * res.filter(r => r.days >= n).length / RUNS);

console.log(`\n=== Balance over ${RUNS} runs (skills: ${JSON.stringify(SKILLS)}) ===`);
console.log(`days survived:  min ${days[0]}  p25 ${pct(0.25)}  median ${pct(0.5)}  p75 ${pct(0.75)}  max ${days[days.length - 1]}  mean ${mean(days).toFixed(1)}`);
console.log(`reached day:    ≥1 ${survN(1)}%   ≥3 ${survN(3)}%   ≥5 ${survN(5)}%   ≥8 ${survN(8)}%   ≥12 ${survN(12)}%`);
console.log(`death cause:    ${Object.entries(causes).map(([k, v]) => `${k} ${Math.round(100 * v / RUNS)}%`).join("   ")}`);
console.log(`end cash:       median $${(pct2(res.map(r => r.cash))).toLocaleString()}`);
console.log(`min cash:       median $${(pct2(res.map(r => r.minCash))).toLocaleString()}   dipped <−$50k in ${Math.round(100 * res.filter(r => r.minCash < -50000).length / RUNS)}% of runs`);
const dh = res.map(r => r.deathHour).sort((a, b) => a - b);
console.log(`death hour:     p25 ${dh[Math.floor(.25*dh.length)]}h  median ${dh[Math.floor(.5*dh.length)]}h  p75 ${dh[Math.floor(.75*dh.length)]}h`);
console.log(`at death:       median shortfall ${pct2(res.map(r => r.deathShort))}%  tripped plants ${pct2(res.map(r => r.tripped))}  avg online firm/peaker ${mean(res.map(r => r.online)).toFixed(1)}`);

// ---- v3: research economy + mutator fairness ----
console.log(`\n--- research economy (R&D lever + tree) ---`);
console.log(`nodes researched: median ${pct2(res.map(r => r.researched))}  mean ${mean(res.map(r => r.researched)).toFixed(1)}  max ${Math.max(...res.map(r => r.researched))} / 12`);
console.log(`RP left banked:   median ${pct2(res.map(r => r.rpBanked))}  mean ${mean(res.map(r => r.rpBanked)).toFixed(0)} (persistently high ⇒ RP outpaces useful spends)`);

console.log(`\n--- mutator incidence & lethality (median days when present) ---`);
const MUT_IDS = ["fuel-spike", "heatwave", "cold-snap", "drought", "renewable-lull"];
for (const id of MUT_IDS){
  const withIt = res.filter(r => r.mutators.includes(id));
  if (!withIt.length){ console.log(`  ${id.padEnd(16)} — not rolled`); continue; }
  const md = pct2(withIt.map(r => r.days));
  console.log(`  ${id.padEnd(16)} seen ${Math.round(100 * withIt.length / RUNS)}%   median days ${md}   ≥3d ${Math.round(100 * withIt.filter(r => r.days >= 3).length / withIt.length)}%`);
}

function pct2(arr){ const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
