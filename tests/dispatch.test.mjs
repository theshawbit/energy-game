// Unit tests for v5 Phase 2 — dial-able dispatch (src/live/dispatch.js) and its
// wiring into the sim. The dials shape the OFFER; the SACRED engine still clears.
// Determinism is pinned with S.calm + a fixed Math.random. Run: `npm test`.
import { applyDials, defaultDials, cycleCost } from "../src/live/dispatch.js";
import { effectiveMax } from "../src/live/kpi.js"; // Phase 3 moved the Output-derated cap here
import { makeFleet, makeUnit, CFG } from "../src/live/config.js";
import { createGame, step } from "../src/live/sim.js";
import { dispatchHour } from "../src/engine.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// pin noise for every createGame/step below
const realRandom = Math.random;
Math.random = () => 0.5;
function freshGame(){ const S = createGame(); S.calm = true; S.running = true; return S; }

// 1) Default dials make a sane offer, and a fresh fleet runs untouched.
{
  const nuc = makeFleet().find(u => u.id === "nuc"); // baseload firm
  nuc.dials = defaultDials(nuc);
  const o = applyDials(nuc);
  check("default dials: baseload is committed, offers its full cap, floor 0",
    o.committed === true && near(o.max, nuc.cap) && near(o.min, 0), `max ${o.max} cap ${nuc.cap}`);

  const S = freshGame();
  step(S, 0.5); // morning: baseload + renewables cover demand with nobody touching a dial
  check("fresh createGame() fleet serves the opening demand on defaults (no brownout)",
    S.capacity >= S.demand - 1 && S.brownout === false, `cap ${Math.round(S.capacity)} vs dem ${Math.round(S.demand)}`);
}

// 2) Commit off zeros the offer (and so contributes 0 to the avail map).
{
  const u = makeFleet().find(u => u.id === "nuc");
  u.dials = defaultDials(u); u.dials.commit = false;
  const o = applyDials(u);
  check("commit off → {min:0, max:0, committed:false}",
    o.committed === false && o.max === 0 && o.min === 0);

  const S = freshGame();
  const g = S.fleet.find(x => x.id === "colA"); // an online baseload
  step(S, 0.3); const withCoal = S.capacity;
  g.dials.commit = false; step(S, 0.3); const withoutCoal = S.capacity;
  check("standing a committed plant down drops it out of the avail map",
    withoutCoal < withCoal - 100, `${Math.round(withCoal)} → ${Math.round(withoutCoal)}`);
}

// 3) Output band clamps and never inverts.
{
  const u = { cap: 100, kind: "firm", dials: { commit: true, bandMin: -20, bandMax: 150, reserveHold: 0 } };
  const o = applyDials(u);
  check("band clamps to [0, cap]", near(o.max, 100) && near(o.min, 0), `max ${o.max} min ${o.min}`);
  const inv = { cap: 100, kind: "firm", dials: { commit: true, bandMin: 80, bandMax: 50, reserveHold: 0 } };
  const oi = applyDials(inv);
  check("inverted band normalises (min wins, max raised to min)", near(oi.max, 80) && oi.max >= oi.min, `max ${oi.max} min ${oi.min}`);
}

// 4) Reserve hold shaves the OFFERED max; the held headroom is surfaced on S.
{
  const u = { cap: 100, kind: "firm", dials: { commit: true, bandMin: 0, bandMax: 100, reserveHold: 0.3 } };
  const o = applyDials(u);
  check("reserveHold 0.3 → offered max is 70% of band; held is 30%", near(o.max, 70) && near(o.held, 30));
  u.dials.reserveHold = 0; check("reserveHold 0 → full band offered", near(applyDials(u).max, 100));

  const S = freshGame();
  S.fleet.find(x => x.id === "nuc").dials.reserveHold = 0.3; // hold 30% of 250 MW baseload
  step(S, 0.3);
  check("S.reserveOffered surfaces the held headroom", S.reserveOffered > 70 && S.reserveOffered < 80, `${Math.round(S.reserveOffered)} MW`);
}

// 5) The engine clears WITHIN the offered band — and dials-at-full == v4 on/off.
{
  const S = freshGame();
  S.fleet.find(x => x.id === "pk1").dials.commit = true; // commit a gas unit so it's in the merit order
  step(S, 0.3); // populate a real S.demand / running fleet
  const avail = {};
  for (const u of S.fleet){
    if (u.kind === "firm" || u.kind === "gas"){ const o = applyDials(u); avail[u.tech] = (avail[u.tech] || 0) + o.max; }
  }
  const hr = dispatchHour(avail, S.demand, S.carbon, 1);
  let withinBand = true;
  for (const t in avail) if ((hr.stack[t] || 0) > avail[t] + 1e-6) withinBand = false;
  check("each tech's dispatched MW ≤ its offered band", withinBand);

  // full-band dials must clear at the same price as feeding the summed cap directly.
  const availV4 = {};
  for (const u of S.fleet) if (u.kind === "firm" || u.kind === "gas") availV4[u.tech] = (availV4[u.tech] || 0) + u.cap;
  const dialsFull = {};
  for (const u of S.fleet) if (u.kind === "firm" || u.kind === "gas"){ u.dials.commit = true; u.dials.reserveHold = 0; const o = applyDials(u); dialsFull[u.tech] = (dialsFull[u.tech] || 0) + o.max; }
  const pV4 = dispatchHour(availV4, S.demand, S.carbon, 1).price;
  const pDials = dispatchHour(dialsFull, S.demand, S.carbon, 1).price;
  check("engine untouched: full-band dials clear at the same price as v4 caps", near(pV4, pDials), `v4 $${pV4} vs dials $${pDials}`);
}

// 6) Push is stored (no effect yet); cycleCost flags starts and ramps.
{
  const S = freshGame();
  const u = S.fleet.find(x => x.id === "nuc");
  u.dials.push = 0.8; check("push round-trips on u.dials", u.dials.push === 0.8);
  const started = cycleCost(u, { commit: false, bandMin: 0, bandMax: 100 }, { commit: true, bandMin: 0, bandMax: 100 });
  check("cycleCost flags a start on committed false→true", started.started === true && started.ramped === false);
  const ramped = cycleCost(u, { commit: true, bandMin: 0, bandMax: 100 }, { commit: true, bandMin: 0, bandMax: 60 });
  check("cycleCost flags a ramp when the band moves", ramped.started === false && ramped.ramped === true);
}

// 7) The peaker KIND is retired — the former peaker is dial-able fast gas.
{
  const fleet = makeFleet();
  check("makeFleet() contains no kind:'peaker'", fleet.every(u => u.kind !== "peaker"));
  const gas = fleet.filter(u => u.kind === "gas");
  check("the former peakers are now kind:'gas' (3 of them)", gas.length === 3);
  check("fast gas keeps a spin-up time (CFG.v5.gas)", gas[0].startTime > 0 && CFG.v5.gas && CFG.v5.gas.startTime > 0, `startTime ${gas[0].startTime}`);
  const built = makeUnit("peaker", 1, 99);
  check("a built 'peaker' is now a gas unit (no peaker kind re-enters the fleet)", built.kind === "gas");
  // a gas unit dialled to a narrow high band is the old peaker: a fast, pricey top-up.
  gas[0].dials = { commit: true, bandMin: 90, bandMax: 110, reserveHold: 0 };
  check("gas dialled to a narrow high band offers that band through the same engine", near(applyDials(gas[0]).max, Math.min(110, gas[0].cap)));
}

// 8) Determinism: a scripted dial sequence reproduces identical dispatch.
{
  function run(){
    const S = freshGame();
    const script = [["pk1", true], ["pk2", true], ["nuc", false]];
    for (let i = 0; i < 40; i++){
      if (i === 10) for (const [id, c] of script){ const u = S.fleet.find(x => x.id === id); if (u) u.dials.commit = c; }
      step(S, 0.1);
    }
    return { cash: S.cash, cap: S.capacity, cond: S.fleet.find(x => x.id === "colA").condition };
  }
  const a = run(), b = run();
  check("scripted dials reproduce identical dispatch across runs",
    near(a.cash, b.cash) && near(a.cap, b.cap) && near(a.cond, b.cond), `cash ${Math.round(a.cash)} / ${Math.round(b.cash)}`);
}

Math.random = realRandom;
console.log(failed === 0 ? "\nAll dispatch tests passed." : `\n${failed} dispatch test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
