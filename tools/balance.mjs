// ============================================================
// ASSERTING BALANCE HARNESS (v5.3 Phase 2) — drives the headless v5 sim across a
// seed batch under several policies and ASSERTS incentive properties, not just
// reports distributions. This is the mechanism that enforces the revised principle,
// "measure the game, not just the modules": a green module suite can still certify a
// broken economy (B1 did), so the economy's INCENTIVES get asserted too — over a
// continuum and an adaptive probe, not a handful of endpoints.
//
// Determinism: the env + economic streams are seeded (Part A), and the construction-
// time Math.random (createGame draws weather at build) is pinned BEFORE createGame.
//
// Run:  node tools/balance.mjs [seedBatch]        (smoke = 3; CI runs this)
//       node tools/balance.mjs 24                  (heavier local / Phase 5 sweep)
// Exits NON-ZERO on any incentive violation; each assert prints an ok/FAIL line with
// the measured margin. Imported by tests/harness.test.mjs for a fast in-suite batch.
// ============================================================
import { createGame, step } from "../src/live/sim.js";
import { dispatchHour } from "../src/engine.js";
import { makeRng } from "../src/live/rng.js";
import { CFG } from "../src/live/config.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const DQ = CFG.v5.daysPerQuarter, SPD = CFG.secondsPerDay;
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

// ---- seeded headless run (pins the global for construction-time weather, then seeds
// all four streams so the run — env volatility included — replays from `seed`) ----
export function newRun(seed, { calm = false } = {}){
  const prev = Math.random; Math.random = makeRng((seed ^ 0x5151) >>> 0);
  const S = createGame();
  Math.random = prev;
  S.seed = seed;
  S.rng = makeRng(seed);
  S.rngForecast = makeRng((seed ^ 0xF0) >>> 0);
  S.rngDemand = makeRng((seed ^ 0xD3) >>> 0);
  S.rngEnv = makeRng((seed ^ 0xE4) >>> 0);
  S.running = true; S.briefEnabled = false; S.calm = calm;
  return S;
}

// Drive one game from the frozen start to the FIRST board review (S.economy.lastVerdict),
// applying `strategy(S)` each game-hour. Returns the verdict + the cash bracket for the
// conservation check. `budgetDays` is the frozen reach-a-quarter budget.
export function runQuarter(S, strategy, { dt = 1, decideEveryH = 1, budgetDays = DQ + 3 } = {}){
  const cash0 = S.cash;
  const maxSteps = Math.ceil(budgetDays * SPD / dt);
  const decideEverySec = decideEveryH * (SPD / 24);
  let acc = decideEverySec, guard = 0, prevCash = S.cash;
  while (!S.economy.lastVerdict && guard < maxSteps){
    if (S.clock && S.clock.speed <= 0) S.clock.speed = 1; // bot keeps the wheel; auto-pause never stalls the headless clock
    if (acc >= decideEverySec){ acc = 0; strategy(S); }
    prevCash = S.cash;           // cash at the end of the last FULL operating tick (before the rollover step)
    step(S, dt); acc += dt; guard++;
  }
  // The rollover is handled at the TOP of the verdict-producing step (settle + wages + bonus/fine),
  // then that same step runs one more operating tick into the NEW quarter — which would pollute a
  // raw cashEnd. The true board-review cash is prevCash with surviveDay's own mutations applied and
  // that trailing tick excluded; cashClose is what the game would show on the review screen.
  const v = S.economy.lastVerdict;
  const cashClose = v ? prevCash - (v.wages || 0) + (v.bonus || 0) - (v.fine || 0) : S.cash;
  return { reached: !!v, v, cash0, cashEnd: S.cash, cashClose, steps: guard };
}

// ---- canned strategies (pure S → void; mutate only the surviving commit dial) ----
// serve-everything is defined OPERATIONALLY (commit gas when the margin is thin, stand it
// down when comfortably long) and is the intended winner. do-nothing is the DISTINCT
// baseline bot (never touches a dial — the default opening). The race isn't circular.
export const strategies = {
  "do-nothing": _S => {},
  "serve-everything": S => {
    const margin = (S.capacity - S.demand) / Math.max(1, S.demand);
    for (const u of S.fleet) if (u.kind === "gas" && u.dials){
      if (margin < 0.15 && u.status === "off") u.dials.commit = true;
      else if (margin > 0.40 && (u.status === "online" || u.status === "starting")) u.dials.commit = false;
    }
  },
  "overbuild-and-hold": S => { for (const u of S.fleet) if ((u.kind === "firm" || u.kind === "gas") && u.dials) u.dials.commit = true; },
  "cheap-baseload": S => { for (const u of S.fleet) if (u.kind === "gas" && u.dials) u.dials.commit = false; },
};

// ============================================================
// ASSERTS — each returns { ok, msg } (msg carries the measured margin).
// ============================================================

// 1a) Continuity — priceServed is the same whether the last sliver is covered or lost;
//     the cap only ever lands on the scarcity SIGNAL (hr.price). (The engine keystone.)
export function assertContinuity(){
  const AVAIL = { nuclear: 100, peaker: 100 }, eps = 1e-4;
  const atCap = dispatchHour(AVAIL, 200), over = dispatchHour(AVAIL, 200 + eps);
  const ok = Math.abs(atCap.priceServed - over.priceServed) < 1e-9 && over.price > atCap.price + 1;
  return { ok, msg: `priceServed ${atCap.priceServed}==${over.priceServed}, signal ${atCap.price}→${over.price}` };
}

// 1b) Incentive U-sweep — profit is STRICTLY DECREASING in how much load you leave short,
//     over a sub-MW→100 MW continuum (the sub-MW optimum the go-dark exploit lived at must
//     be in range). Uses the real engine (dispatchHour → priceServed) + the real VOLL knob;
//     revenue = served×priceServed, cost = varCost + N×VOLL — the sim's own revenue identity.
export function assertUSweep(){
  const AVAIL = { nuclear: 100, peaker: 100 }, C = 200; // 200 MW firm available
  const voll = CFG.v5_3.market.voll;
  const sweep = [0, 0.1, 0.5, 1, 5, 20, 50, 100];
  const profit = N => {
    const hr = dispatchHour(AVAIL, C + N);          // demand = capacity + N → exactly N unserved
    return hr.served * hr.priceServed - hr.varCost - N * voll; // the sim's per-MWh revenue less fuel less forced-VOLL
  };
  let ok = true, prev = Infinity, trail = [];
  for (const N of sweep){ const p = profit(N); trail.push(`${N}:${Math.round(p)}`); if (p >= prev) ok = false; prev = p; }
  return { ok, msg: `π(short) ↓ : ${trail.join(" ")}` };
}

// 1c) Price-taking / hold-sweep — the retired reserveHold dial moves NOTHING. On a real
//     short run, setting every unit's (ignored) reserveHold across {0,.3,.6,.9} leaves the
//     quarter PnL identical — no interior floor-farm, no withholding lever (Phase 1 Option 1).
export function assertHoldSweep(seed = 4242){
  const run = hold => {
    const S = newRun(seed, { calm: true });
    const strat = S => { strategies["serve-everything"](S); for (const u of S.fleet) if (u.dials) u.dials.reserveHold = hold; };
    return runQuarter(S, strat).v?.pnl ?? NaN;
  };
  const base = run(0);
  const ok = [0.3, 0.6, 0.9].every(h => run(h) === base);
  return { ok, msg: `pnl invariant to reserveHold: ${base}` };
}

// 2) Conservation — on a clean one-quarter run (no builds / R&D / borrowing / shed / capacity
//    obligation), the board-review cash reconciles to pnl + bonus − fine. Every per-tick cash flow
//    (swing, floor, fuel/O&M, spin, recharge, interest, VOLL) is mirrored in the quarterLog the PnL
//    reads, so the two must agree to the rounding granularity — this is the ledger, not a reimplementation.
export function assertConservation(seed = 909){
  const S = newRun(seed, { calm: true });
  const clean = !S.capacityObligation && !S.debt && !(S.rdFunding > 0); // the fixture must actually be clean
  const r = runQuarter(S, strategies["serve-everything"]);
  const v = r.v;
  const dCash = r.cashClose - r.cash0;
  const expected = v.pnl + (v.bonus || 0) - (v.fine || 0);
  const ok = clean && Math.abs(dCash - expected) <= Math.max(2, Math.abs(expected) * 1e-6);
  return { ok, msg: `Δcash ${Math.round(dCash)} == pnl+bonus−fine ${Math.round(expected)} (gap ${Math.round(dCash - expected)})${clean ? "" : " [fixture not clean]"}` };
}

// 3) Dominant-strategy search + ADAPTIVE PROBE (the point of this phase). The integrity invariant
//    Phase 1 restored is NOT "my reactive bot earns the most" (that's a Phase-5 balance question —
//    the floor pays for AVAILABLE firm iron, so a static overbuild can out-EARN a reactive one, which
//    is a tuning call, not a correctness bug). The invariant is: the PROFIT-MAXIMISING strategy KEEPS
//    THE LIGHTS ON. Pre-Phase-1 the optimum was to short the peak by a sliver and bank the cap; now
//    going dark forgoes continuous revenue and draws VOLL, so every profit-seeking policy — canned or
//    hill-climbed — must land at a near-perfect serve rate. We assert the SERVE RATE of the winner,
//    not a profit margin, and that serving MORE beats serving less (covering dominates under-committing).
const SERVE_FLOOR = CFG.v5_3.score?.mintServeFloor ?? 0.98; // the "lights stayed on" bar the scarce-mint gate also uses

export function assertDominant(seeds){
  const names = Object.keys(strategies);
  const pnl = {}, serve = {};
  for (const n of names){
    const rs = seeds.map(sd => runQuarter(newRun(sd, { calm: true }), strategies[n]).v);
    pnl[n] = mean(rs.map(v => v?.pnl ?? -1e12));
    serve[n] = mean(rs.map(v => v?.serveRate ?? 0));
  }
  const winner = names.reduce((a, b) => pnl[a] >= pnl[b] ? a : b);
  // the profit-max policy keeps the lights on, AND covering (serve-everything) out-earns under-committing (do-nothing).
  const ok = serve[winner] >= SERVE_FLOOR && pnl["serve-everything"] >= pnl["do-nothing"];
  return { ok, msg: `winner=${winner} serve=${(serve[winner] * 100).toFixed(1)}%  pnl{${names.map(n => `${n}:${Math.round(pnl[n])}`).join(", ")}}`, pnl, serve };
}

// commit gas by hour-of-day bit vector (length 24) — the policy space the probe searches.
function hourlyGasPolicy(bits){
  return S => { const on = bits[Math.floor(S.t) % 24]; for (const u of S.fleet) if (u.kind === "gas" && u.dials) u.dials.commit = on; };
}
// The greedy adaptive probe: from gas-always-on, flip each hour's commit bit and keep the change if it
// raises PnL — a hill-climb through the per-hour policy space. The point is temporal: a static sweep of
// endpoints can't find an interior "short THIS hour" optimum, which is exactly where the B1 exploit lived.
// The assert is that the climbed PROFIT optimum still serves ~all load — the search cannot discover a
// profitable way to go dark. (It CAN discover standing idle gas down off-peak; that only saves fuel while
// still covering, so the serve rate stays pinned high — the correct outcome.)
export function adaptiveProbe(seed){
  const evalBits = bits => { const v = runQuarter(newRun(seed, { calm: true }), hourlyGasPolicy(bits)).v; return { pnl: v?.pnl ?? -1e12, serve: v?.serveRate ?? 0 }; };
  let bits = new Array(24).fill(true);
  let best = evalBits(bits);
  for (let h = 0; h < 24; h++){ const t = bits.slice(); t[h] = !t[h]; const r = evalBits(t); if (r.pnl > best.pnl + 1){ best = r; bits = t; } }
  return { ok: best.serve >= SERVE_FLOOR, climbed: best.pnl, serve: best.serve, bits };
}

// 4) Reach-a-quarter — the distinct baseline bot (do-nothing) reaches the Q1 board review
//    from the frozen start within the frozen budget (DQ+3 game-days), across the seed batch.
export function assertReachQuarter(seeds){
  const budgetDays = DQ + 3;
  const reached = seeds.map(sd => runQuarter(newRun(sd), strategies["do-nothing"], { budgetDays }).reached);
  const ok = reached.every(Boolean);
  return { ok, msg: `${reached.filter(Boolean).length}/${seeds.length} reached Q1 within ${budgetDays} game-days` };
}

// 5) Mint correlates with true PnL — the serve-everything (profitable) quarter mints more ⚡
//    than a losing policy, and a losing/dark quarter mints 0 (the scarce-mint gate).
export function assertMint(seeds){
  const serve = mean(seeds.map(sd => runQuarter(newRun(sd, { calm: true }), strategies["serve-everything"]).v?.mintTotal ?? 0));
  const cheap = mean(seeds.map(sd => runQuarter(newRun(sd, { calm: true }), strategies["cheap-baseload"]).v?.mintTotal ?? 0));
  const ok = serve >= cheap;
  return { ok, msg: `mint serve-everything ${serve.toFixed(1)} ≥ cheap-baseload ${cheap.toFixed(1)}` };
}

// 6) No dead content — a registry of the LIVE economic mechanics, each paired with a state-delta
//    fixture: toggle the mechanic and prove it MOVES game state. This is the structural guard against
//    the failure the whole milestone was born from — a green suite coexisting with inert mechanics. It
//    is a registry of what must be live, NOT an exceptions file for what is allowed dead: a mechanic
//    that silently goes inert (a regression) drops its delta to zero and this fails. (Intentionally
//    inert items pending a later phase — dispatchAssist, the service manager — are simply absent from
//    the registry until Phase 3 makes them live or deletes them; they are tracked in the plan, not
//    whitelisted here.) Each probe returns a measured delta that must be non-zero.
export function assertNoDeadContent(seed = 2026){
  const reg = [
    // commit dial: committing gas delivers load a gas-off grid can't — serve rate must move.
    ["commit-dial", () => {
      const on = runQuarter(newRun(seed, { calm: true }), strategies["serve-everything"]).v?.serveRate ?? 0;
      const off = runQuarter(newRun(seed, { calm: true }), strategies["do-nothing"]).v?.serveRate ?? 0;
      return { delta: on - off, note: `serve ${(off * 100).toFixed(1)}%→${(on * 100).toFixed(1)}%` };
    }],
    // carbon pricing: with a dirty unit on the margin, a carbon price lifts the clearing cost.
    ["carbon-pricing", () => {
      const avail = { nuclear: 100, coal: 100 };
      const c0 = dispatchHour(avail, 150, 0, 1).varCost, c1 = dispatchHour(avail, 150, 100, 1).varCost;
      return { delta: c1 - c0, note: `varCost ${Math.round(c0)}→${Math.round(c1)} @carbon 0→100` };
    }],
    // priceServed scarcity: the continuous clearing price climbs the merit order as load rises.
    ["priceServed-merit-order", () => {
      const avail = { nuclear: 100, peaker: 100 };
      const lo = dispatchHour(avail, 80, 0, 1).priceServed, hi = dispatchHour(avail, 180, 0, 1).priceServed;
      return { delta: hi - lo, note: `priceServed ${lo}→${hi} as load 80→180` };
    }],
    // capacity floor: firm iron kept available pays the availability floor — floorPay must be positive.
    ["floor-availability-pay", () => {
      const v = runQuarter(newRun(seed, { calm: true }), strategies["serve-everything"]).v;
      return { delta: v?.floorPay ?? 0, note: `floorPay ${Math.round(v?.floorPay ?? 0)}` };
    }],
    // scarce mint: a profitable, well-served quarter mints ⚡ (the KPI→currency faucet is wired).
    ["scarce-mint-faucet", () => {
      const v = runQuarter(newRun(seed, { calm: true }), strategies["serve-everything"]).v;
      return { delta: v?.mintTotal ?? 0, note: `mint ${(v?.mintTotal ?? 0).toFixed(1)}` };
    }],
    // wear model: running the fleet a quarter degrades its KPIs below pristine (100).
    ["kpi-degradation", () => {
      const v = runQuarter(newRun(seed, { calm: true }), strategies["overbuild-and-hold"]).v;
      return { delta: 100 - (v?.kpiScore ?? 100), note: `kpiScore ${v?.kpiScore ?? 100}/100` };
    }],
  ];
  const rows = reg.map(([id, probe]) => { const r = probe(); return { id, ...r, ok: Math.abs(r.delta) > 1e-6 }; });
  const dead = rows.filter(r => !r.ok);
  return { ok: dead.length === 0, msg: dead.length ? `DEAD: ${dead.map(r => r.id).join(", ")}` : rows.map(r => `${r.id} ✓`).join(" "), rows };
}

// ---- the batch runner: run every assert, print ok/FAIL, exit non-zero on any violation ----
export function runAsserts(nSeeds = 3){
  const seeds = Array.from({ length: nSeeds }, (_, i) => (1337 + i * 2654435761) >>> 0);
  const results = [];
  const add = (name, r) => results.push([name, r]);

  add("continuity: priceServed is continuous; cap only on the signal", assertContinuity());
  add("incentive U-sweep: π strictly decreasing in MW left short", assertUSweep());
  add("price-taking: pnl invariant to the retired reserveHold dial", assertHoldSweep());
  add("conservation: Δcash = pnl + bonus − fine (clean quarter)", assertConservation());
  add("reach-a-quarter: baseline bot reaches Q1 within budget", assertReachQuarter(seeds));
  add("dominant strategy: the profit-max policy keeps the lights on", assertDominant(seeds));
  add("mint tracks true PnL (serve ≥ cheap-baseload)", assertMint(seeds));
  add("no dead content: every registered mechanic moves state", assertNoDeadContent(seeds[0]));

  // the adaptive probe runs on the first seed (heavy); the batch runs it on each.
  const probes = seeds.map(adaptiveProbe);
  const probeOk = probes.every(p => p.ok);
  add("adaptive probe: the profit-max hourly commit policy keeps the lights on",
    { ok: probeOk, msg: probes.map(p => `climbed pnl ${Math.round(p.climbed)} @ serve ${(p.serve * 100).toFixed(1)}%`).join(" | ") });

  let failed = 0;
  console.log(`\n=== v5.3 asserting harness — ${nSeeds} seed(s), ${DQ}-day quarters ===`);
  for (const [name, r] of results){ console.log(`${r.ok ? "  ok" : "FAIL"}  ${name}${r.msg ? "  — " + r.msg : ""}`); if (!r.ok) failed++; }
  console.log(failed === 0 ? `\nAll ${results.length} incentive asserts passed.` : `\n${failed} incentive assert(s) FAILED.`);
  return failed;
}

// CLI entry (not when imported by the test). Robust across OS / url-encoded paths.
const invoked = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (invoked){
  const n = parseInt(process.argv[2] || "3", 10);
  process.exit(runAsserts(n) === 0 ? 0 : 1);
}
