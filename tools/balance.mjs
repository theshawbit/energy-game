// Balance harness (v4 "The Book") — drives the pure live sim with a heuristic
// "competent operator" across a batch of seeded runs and HEDGE PERSONAS, then
// reports the distributions that tell us whether the economy is tuned: run
// length, hedge spread, bankruptcy rate, realized spot volatility, net worth,
// credit-rating curve, and per-mutator FINANCIAL lethality. Report-only (locked
// decision 11): judgment stays in the g3 tuning pass. No DOM, no Math.random in
// the economy — every economic draw is seeded (S.rng / S.rngForecast) so a run
// replays from its logged seed.
//
// Run: `node tools/balance.mjs [runsPerPersona] [skillsJSON] [baseSeed]`
import { createGame, step } from "../src/live/sim.js";
import { toggleUnit, buildCapacity, upgradeUnit, serviceUnit, setRdFunding, researchNode,
         setHedge, hedgeContract, acceptOffer, declineOffer, borrow, repay, takeCapacityObligation } from "../src/live/actions.js";
import { canResearch } from "../src/live/research.js";
import { rollMutators } from "../src/live/mutators.js";
import { rollSpecialOffer } from "../src/live/offers.js";
import { creditRating, gradeFor } from "../src/live/finance.js";
import { makeRng } from "../src/live/rng.js";
import { CFG } from "../src/live/config.js";

const RUNS = parseInt(process.argv[2] || "60", 10);       // runs PER persona
const SKILLS = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const BASE_SEED = parseInt(process.argv[4] || "1337", 10);
// The harness plays with every research branch meta-unlocked AND the full economy
// unlocked (capacity market, Rolodex offers, Longer Shifts → 12-day contract, and
// the forecasting research branch), so the policy can exercise the whole book.
const UNLOCKED = { storage: true, demand: true, advgen: true, forecasting: true };
const ECONOMY = { "capacity-market": true, "special-offers": true, "runlen-1": true, "runlen-2": true, "runlen-3": true };
const MAX_RUN_DAYS = CFG.run.baseDays + CFG.run.tier1 + CFG.run.tier2 + CFG.run.tier3; // 12

// Research priority: cheap efficiency first, then storage/demand levers, build
// unlocks, and the forecasting branch (so the Desk's forecast sharpens over a run).
const RESEARCH_PRIORITY = [
  "buff-wear", "grid-efficiency", "amp-upgrades", "fast-ramp",
  "storage-power", "demand-response", "storage-depth", "storage-recharge",
  "smart-grid", "fc-desk", "fc-models", "fc-nowcast",
  "unlock-smr", "unlock-geo", "unlock-ccs",
];

// ---- hedge personas ----
// Each persona is a strategy for the Desk: how much expected output to lock on
// term contracts, and how it treats offers. Spread across the batch measures
// whether hedging is neither pointless nor mandatory (each best under some run).
const PERSONAS = {
  // naive = a first-timer who ignores the Desk entirely (no hedge, no offers, no
  // borrowing, no capacity market) and just runs the grid + basic maintenance. The
  // key fairness bar: a naive player should survive several days, not go insolvent
  // on day 1–2 from fixed costs alone (the v4.1 cold-start fix).
  naive:             { hedge: () => 0,    takeOffers: false, minimal: true, label: "naive (no Desk)" },
  hedger:            { hedge: () => 0.85, takeOffers: true,  label: "hedger ~85%" },
  balanced:          { hedge: () => 0.50, takeOffers: true,  label: "balanced ~50%" },
  naked:             { hedge: () => 0.10, takeOffers: false, label: "naked ~10%" },
  // forecast-reactive: hedge harder when the forecast is foggy / the market is
  // volatile (uncertainty → buy certainty), lighter when it can see clearly.
  "forecast-reactive": { hedge: (S) => clamp01(0.3 + 1.1 * (S.spotForecastFog ?? CFG.forecast.baseFog)), takeOffers: true, label: "forecast-reactive" },
};
const clamp01 = x => Math.max(0, Math.min(1, x));

// ---- heuristic player (dispatch) ----
// Pre-arm peakers through the evening ramp (and any time the margin is thin),
// fire the battery in emergencies when the forecast says spot is spiking, and
// stand reserves down when comfortable and spot is cheap.
function play(S){
  const margin = (S.capacity - S.demand) / Math.max(1, S.demand);
  const spot = S.spot || 0, fc = S.spotForecast || spot;
  const spikeAhead = fc > (S.spotBaseline || CFG.spotBase) * 1.5; // forecast says it's worth running
  const wantPeakers = (S.t >= 14.5 && S.t <= 20.5) || margin < 0.12 || (spikeAhead && margin < 0.25);
  for (const u of S.fleet){
    if (u.kind === "peaker"){
      if (wantPeakers && u.status === "off") toggleUnit(S, u.id);
      else if (!wantPeakers && (u.status === "online" || u.status === "starting") && margin > 0.30) toggleUnit(S, u.id);
    }
    if (u.kind === "battery"){
      if ((margin < 0.05 || (spikeAhead && margin < 0.12)) && u.status !== "discharge" && u.energy > 1) toggleUnit(S, u.id);
      else if (margin > 0.25 && !spikeAhead && u.status === "discharge") toggleUnit(S, u.id);
    }
  }
}
function fund(S){
  const margin = (S.capacity - S.demand) / Math.max(1, S.demand);
  const comfortable = S.cash > 150000 && margin > 0.15 && (S.t < 14.5 || S.t > 21);
  setRdFunding(S, comfortable ? Math.round(CFG.rdFundingMax * 0.5) : 0);
}
function manage(S){
  if (S.t < 13 || S.t > 21){
    const worn = S.fleet.filter(u => u.condition != null && u.status !== "service" && u.condition < 40).sort((a, b) => a.condition - b.condition);
    for (const u of worn){ if (S.cash > 120000 && serviceUnit(S, u.id).ok) break; }
  }
  for (const id of RESEARCH_PRIORITY){ if (canResearch(S, id)){ researchNode(S, id); break; } }
  const dispatchable = S.fleet.filter(u => u.kind === "firm" || u.kind === "peaker").reduce((a, u) => a + u.cap, 0);
  if (S.cash > 260000 && dispatchable < S.peak * 1.35){
    const up = S.fleet.find(u => (u.tier || 1) < 3 && (u.kind === "firm" || u.kind === "peaker"));
    if (up) upgradeUnit(S, up.id); else buildCapacity(S, "peaker");
  }
}

// ---- the Desk (v4) — once each morning, per persona ----
// Set the hedge dial from the persona, roll the standing hedge forward on a
// mid-length term, work the pending offer, manage debt by cash health, and sign
// a capacity obligation when the grid is comfortably long.
function desk(S, persona){
  const p = PERSONAS[persona];
  if (p.minimal){ if (S.pendingOffer) declineOffer(S); return; } // a naive player ignores the Desk entirely
  setHedge(S, p.hedge(S));
  hedgeContract(S, 4);                       // replace-model: one standing dial hedge
  // special offer (populated by the day roll): take it if the persona hedges and
  // the premium is worthwhile, otherwise pass.
  if (S.pendingOffer){
    if (p.takeOffers && (S.pendingOffer.priceMult ?? 1) >= 1.0) acceptOffer(S); else declineOffer(S);
  }
  // financing: borrow working capital when cash is thin but the grid is viable;
  // repay aggressively when flush so interest doesn't compound.
  const margin = (S.capacity - S.demand) / Math.max(1, S.demand);
  if (S.cash < 40000 && margin > -0.05){
    const room = creditRating(S.credit).ceiling - S.debt;
    if (room > 0) borrow(S, Math.min(room, 80000));
  } else if (S.cash > 300000 && S.debt > 0){
    repay(S, Math.min(S.debt, S.cash - 250000));
  }
  // capacity market: pledge reserve when there's firm headroom to back it.
  if (!S.capacityObligation && margin > 0.30) takeCapacityObligation(S, 4);
}

function runOne(persona, seed){
  const mutators = rollMutators(makeRng((seed ^ 0xA5A5) >>> 0)); // seeded mutator roll (reproducible)
  const S = createGame(SKILLS, UNLOCKED, mutators, CFG.creditStart, ECONOMY, MAX_RUN_DAYS);
  S.seed = seed; S.rng = makeRng(seed); S.rngForecast = makeRng((seed ^ 0xF0) >>> 0);
  S.running = true;
  desk(S, persona); // opening morning
  let playAcc = 0, manageAcc = 0, minCash = S.cash, spotSum = 0, spotSqSum = 0, spotN = 0, peakDebt = 0;
  const DT = 0.05;
  let guard = 0;
  while (!S.over && guard < 2_000_000){
    guard++;
    const dayBefore = S.day;
    const endedByStep = step(S, DT);
    if (S.day !== dayBefore && !S.over){ rollDailyOffer(S); desk(S, persona); } // a new morning
    minCash = Math.min(minCash, S.cash);
    peakDebt = Math.max(peakDebt, S.debt || 0);
    if (S.spot > 0){ spotSum += S.spot; spotSqSum += S.spot * S.spot; spotN++; }
    playAcc += DT; manageAcc += DT * (24 / 48);
    if (playAcc >= 0.25){ playAcc = 0; play(S); fund(S); }
    if (manageAcc >= 6){ manageAcc = 0; manage(S); }
    if (endedByStep) break;
  }
  const r = S.reason;
  const cause = S.won ? "won"
    : /bankrupt|wound up/i.test(r) ? "bankrupt"
    : /collapsed/i.test(r) ? "instant"
    : /cascaded|confidence/i.test(r) ? "strain"
    : "other";
  const spotMean = spotN ? spotSum / spotN : 0;
  const spotVar = spotN ? Math.max(0, spotSqSum / spotN - spotMean * spotMean) : 0;
  const spotCoV = spotMean > 0 ? Math.sqrt(spotVar) / spotMean : 0;
  return {
    persona, seed, days: S.day - 1, won: S.won, cause,
    netWorth: Math.round(S.cash - (S.debt || 0)), cash: Math.round(S.cash), minCash: Math.round(minCash),
    peakDebt: Math.round(peakDebt), defaulted: S.defaulted, credit: Math.round(S.credit),
    grade: gradeFor(S.credit), spotCoV, spotMean: Math.round(spotMean),
    hedgeMW: Math.round((S.contracts || []).reduce((a, c) => a + (c.mw || 0), 0)),
    mutators,
  };
}

// mirror main.js's daily offer roll (seeded), so personas actually see offers.
function rollDailyOffer(S){
  if (S.pendingOffer && S.day >= S.pendingOffer.expiresDay) S.pendingOffer = null;
  const offer = rollSpecialOffer(S, S.rng || Math.random);
  if (offer) S.pendingOffer = offer;
}

// ---- batch ----
const ALL = [];
for (const persona of Object.keys(PERSONAS)){
  for (let i = 0; i < RUNS; i++) ALL.push(runOne(persona, (BASE_SEED + i * 2654435761) >>> 0));
}

// ---- helpers ----
const med = arr => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const pctOf = (arr, pred) => arr.length ? Math.round(100 * arr.filter(pred).length / arr.length) : 0;
const quant = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0; };
const money = n => "$" + Math.round(n).toLocaleString();

console.log(`\n=== v4 Balance — ${RUNS} runs × ${Object.keys(PERSONAS).length} personas = ${ALL.length} runs  (base seed ${BASE_SEED}, maxRunDays ${MAX_RUN_DAYS}, skills ${JSON.stringify(SKILLS)}) ===`);

// --- per-persona: run length + net worth + bust rate (the core spread) ---
console.log(`\n--- by persona: survival, net worth, bust rate ---`);
console.log(`persona            median_days  p25  p75   won%   median_netWorth      p90_netWorth     bankrupt%`);
for (const key of Object.keys(PERSONAS)){
  const rs = ALL.filter(r => r.persona === key);
  const days = rs.map(r => r.days);
  const nw = rs.map(r => r.netWorth);
  console.log(
    `${PERSONAS[key].label.padEnd(18)} ${String(med(days)).padStart(6)}    ${String(quant(days, .25)).padStart(3)}  ${String(quant(days, .75)).padStart(3)}  ${String(pctOf(rs, r => r.won)).padStart(4)}%   ${money(med(nw)).padStart(14)}   ${money(quant(nw, .90)).padStart(14)}   ${String(pctOf(rs, r => r.cause === "bankrupt")).padStart(5)}%`);
}

// --- death causes across the whole batch (bankruptcy should be real but minority) ---
console.log(`\n--- death causes (whole batch) ---`);
const deaths = ALL.filter(r => !r.won);
const causeTally = ALL.reduce((m, r) => (m[r.cause] = (m[r.cause] || 0) + 1, m), {});
for (const [c, n] of Object.entries(causeTally).sort((a, b) => b[1] - a[1])){
  console.log(`  ${c.padEnd(10)} ${String(Math.round(100 * n / ALL.length)).padStart(3)}% of runs` + (c !== "won" && deaths.length ? `   (${Math.round(100 * n / deaths.length)}% of deaths)` : ""));
}
console.log(`  → bankruptcy is ${deaths.length ? Math.round(100 * (causeTally.bankrupt || 0) / deaths.length) : 0}% of deaths (target band ~15–35%)`);

// --- realized spot volatility (should sit in its design band, CoV ~0.15–0.30 calm) ---
console.log(`\n--- realized spot ---`);
const covs = ALL.map(r => r.spotCoV);
console.log(`  mean spot:    median ${money(med(ALL.map(r => r.spotMean)))}   (floor ${money(CFG.spotFloor)} / cap ${money(CFG.spotCap)})`);
console.log(`  spot CoV:     median ${med(covs).toFixed(3)}   mean ${mean(covs).toFixed(3)}   p90 ${quant(covs, .90).toFixed(3)}`);

// --- credit-rating curve + debt use ---
console.log(`\n--- financing ---`);
const gradeTally = ALL.reduce((m, r) => (m[r.grade] = (m[r.grade] || 0) + 1, m), {});
console.log(`  end credit grade:  ` + Object.entries(gradeTally).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} ${Math.round(100 * n / ALL.length)}%`).join("  "));
console.log(`  defaulted:         ${pctOf(ALL, r => r.defaulted)}% of runs`);
console.log(`  peak debt:         median ${money(med(ALL.map(r => r.peakDebt)))}   p90 ${money(quant(ALL.map(r => r.peakDebt), .90))}`);
console.log(`  min cash dipped <−$50k in ${pctOf(ALL, r => r.minCash < -50000)}% of runs`);

// --- hedge-ratio distribution (each persona's committed MW; sanity that the Desk fires) ---
console.log(`\n--- hedge book (committed MW, end of run) ---`);
for (const key of Object.keys(PERSONAS)){
  const rs = ALL.filter(r => r.persona === key);
  console.log(`  ${PERSONAS[key].label.padEnd(18)} median ${String(med(rs.map(r => r.hedgeMW))).padStart(4)} MW   p90 ${String(quant(rs.map(r => r.hedgeMW), .90)).padStart(4)} MW`);
}

// --- per-mutator FINANCIAL lethality (bankruptcy share when that mutator is present) ---
console.log(`\n--- per-mutator financial lethality (bankruptcy rate when present) ---`);
const MUT_IDS = ["fuel-spike", "heatwave", "cold-snap", "drought", "renewable-lull", "chaotic-market"];
for (const id of MUT_IDS){
  const withIt = ALL.filter(r => r.mutators.includes(id));
  if (!withIt.length){ console.log(`  ${id.padEnd(16)} — not rolled`); continue; }
  console.log(`  ${id.padEnd(16)} seen ${String(Math.round(100 * withIt.length / ALL.length)).padStart(3)}%   median days ${String(med(withIt.map(r => r.days))).padStart(2)}   bankrupt ${String(pctOf(withIt, r => r.cause === "bankrupt")).padStart(3)}%   median netWorth ${money(med(withIt.map(r => r.netWorth)))}`);
}

console.log(`\n(replay any run from its seed; harness is report-only — tuning judgment lives in g3.)`);
