// Unit tests for v5 Phase 9 WORLD layer (no DOM). Run: `npm test`.
// Pins the identity arc (eraOf monotonic over the growth inputs), era-aware plant
// naming (shipped names preserved + stable once assigned), the C.A.S.S. bark
// selector (every real id/state resolves, never empty, never touches the RNG), the
// overlord verdict voice (grade-driven + pure), and the cardinal rule: flavour
// COLOURS the sim, it never GATES it — strip every copy table to "" and the
// mechanics (cash, dispatch, KPIs) are bit-for-bit identical.
import { createGame, step } from "../src/live/sim.js";
import { eraOf, eraRank, cassLine, overlordNote, overlordBand } from "../src/live/world.js";
import { CFG, plantName, makeUnit } from "../src/live/config.js";
import { makeRng } from "../src/live/rng.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}

// 1) The era maps to the growth arc, and is MONOTONIC over its (year, peak) inputs.
{
  const S = createGame();
  check("a fresh grid is the rust district", eraOf(S) === "rust", `${S.calendar.year}/${S.peak}`);

  // both gates must clear: lots of years but a small grid stays rust; a big grid in
  // year 1 stays rust too. Only year AND peak together advance the era.
  S.calendar.year = 9; S.peak = 800;
  check("many years but a small grid is still rust", eraOf(S) === "rust");
  S.calendar.year = 1; S.peak = 9000;
  check("a huge grid in year 1 is still rust", eraOf(S) === "rust");

  const w = CFG.v5.world.eras;
  S.calendar.year = w.transition.year; S.peak = w.transition.peak;
  check("transition gates cleared → transition", eraOf(S) === "transition");
  S.calendar.year = w.veridia.year; S.peak = w.veridia.peak;
  check("veridia gates cleared → New Veridia", eraOf(S) === "veridia");
  check("era rank orders rust < transition < veridia",
    eraRank("rust") < eraRank("transition") && eraRank("transition") < eraRank("veridia"));

  // monotonic: walk a real growth timeline — year and peak only ever climb (a stalled
  // quarter freezes peak, never drops it) — and assert the rank never regresses.
  let prev = -1, ok = true;
  const T = createGame();
  const timeline = [[1,700],[1,1200],[2,1200],[2,1500],[2,2400],[3,2400],[3,3100],[4,5000],[6,9000]];
  for (const [y, p] of timeline){
    T.calendar.year = y; T.peak = p;
    const r = eraRank(eraOf(T));
    if (r < prev) ok = false;
    prev = r;
  }
  check("eraRank never regresses as (year, peak) climb", ok);
}

// 2) Plant names are era-aware, preserve the shipped set, and are stable once set.
{
  // the pre-Phase-9 signature (no era) is unchanged, and "rust" is identical to it.
  check("plantName(tech,n) unchanged for coal", plantName("coal", 1) === "Sootbank Coal", plantName("coal", 1));
  check('"rust" era === the shipped signature', plantName("coal", 2, "rust") === plantName("coal", 2));

  // every shipped place name is still reachable (rust preserves PLACE_POOL).
  const shippedCoal = ["Sootbank","Emberly","Colliers Rise","Dunsmere","Blackdyke","Furnace Hill"];
  const reachable = shippedCoal.every((_, i) => plantName("coal", i + 1).startsWith(shippedCoal[i]));
  check("shipped rust names all preserved", reachable);

  // a veridia-era build draws from the New Veridia pool (distinct from rust).
  const vName = plantName("solar", 1, "veridia");
  check("veridia era draws a New Veridia name", vName === "Solaris Fields Solar", vName);
  check("veridia name differs from the rust name", plantName("solar", 1, "veridia") !== plantName("solar", 1, "rust"));

  // the fuel word never changes by era.
  check("fuel word stays with the tech across eras", plantName("wind", 1, "veridia").endsWith(" Wind"));

  // a tech with no era override falls back to the rust pool gracefully.
  check("no veridia pool for a tech → rust fallback, non-empty",
    typeof plantName("peaker", 1, "veridia") === "string" && plantName("peaker", 1, "veridia").length > 0);

  // makeUnit assigns the name ONCE from the era and it never drifts afterwards.
  const u = makeUnit("coal", 1, 1, "veridia");
  const firstName = u.name;
  check("makeUnit names from the era at birth", typeof firstName === "string" && firstName.length > 0, firstName);
  step(createGame(), 0.1); // advancing time elsewhere must not rename a built unit
  check("a built unit's name is stable", u.name === firstName);
}

// 3) C.A.S.S. barks map to real ids/states, never fall through to empty, never touch the RNG.
{
  const S = createGame();
  const ids = ["fuel-spike","heatwave","cold-snap","drought","renewable-lull","chaotic-market"];
  const states = ["trip","strain","brownout","milestone","calm"];
  for (const k of [...ids, ...states]){
    const line = cassLine(S, k);
    check(`C.A.S.S. has a bark for "${k}"`, typeof line === "string" && line.length > 0, line);
  }
  // an unknown key falls back to a bark (the calm pool), never empty.
  check("unknown key falls back, non-empty", cassLine(S, "no-such-id").length > 0);

  // deterministic for a given day; keyed off the day, not the RNG stream.
  S.day = 3;
  check("same day → same bark", cassLine(S, "heatwave") === cassLine(S, "heatwave"));
  const before = makeRng(5); const drawA = before(); // the bark must not consume any rng
  S.rng = makeRng(5);
  cassLine(S, "heatwave"); cassLine(S, "drought");
  check("cassLine does not consume S.rng", S.rng() === drawA);
}

// 4) overlordNote reads the verdict, differs by grade, and is a pure function of its fields.
{
  const dark     = { grade: 0.95, serveRate: 0.80, cleanScore: 0.9, year: 2, quarter: 1 }; // blackout dominates
  const praise   = { grade: 0.90, serveRate: 0.99, cleanScore: 0.9, year: 2, quarter: 1 };
  const tolerate = { grade: 0.70, serveRate: 0.99, cleanScore: 0.9, year: 2, quarter: 1 };
  const dirty    = { grade: 0.50, serveRate: 0.99, cleanScore: 0.10, year: 2, quarter: 1 };
  const fail     = { grade: 0.40, serveRate: 0.99, cleanScore: 0.9, year: 2, quarter: 1 };

  check("blackout → dark band", overlordBand(dark) === "dark");
  check("strong grade → praise band", overlordBand(praise) === "praise");
  check("par grade → tolerate band", overlordBand(tolerate) === "tolerate");
  check("dirty-and-subpar → dirty band", overlordBand(dirty) === "dirty");
  check("weak-and-clean → fail band", overlordBand(fail) === "fail");

  // every band yields a non-empty line, and the voice differs across the grade bands.
  const notes = [dark, praise, tolerate, dirty, fail].map(overlordNote);
  check("every band yields a non-empty note", notes.every(n => typeof n === "string" && n.length > 0));
  check("the note differs by grade band", new Set(notes).size === notes.length, notes.join(" | "));

  // praise is never a blackout line; a fine band is never the praise line (barbed, not warm).
  check("praise line is not the dark line", overlordNote(praise) !== overlordNote(dark));
  check("fail line is not the praise line", overlordNote(fail) !== overlordNote(praise));

  // pure: identical fields → identical output.
  check("overlordNote is pure", overlordNote(praise) === overlordNote({ ...praise }));
}

// 5) THE CARDINAL RULE: flavour never gates. Strip every copy table to "" and the
// game runs identically — same cash, same dispatch, same fleet condition.
{
  // a deterministic run signature: fixed seed, calm jitter off, many steps.
  function run(){
    // pin global entropy BEFORE createGame (it draws Math.random for the fresh weather)
    // so the only variable between the two runs is the copy tables, not the RNG.
    const realRandom = Math.random; Math.random = () => 0.5;
    const S = createGame(); S.calm = true; S.rng = makeRng(123); S.rngForecast = makeRng(456);
    for (let i = 0; i < 400; i++) step(S, 0.1);
    Math.random = realRandom;
    return { cash: Math.round(S.cash), served: Math.round(S.servedMWh || 0),
             conds: S.fleet.map(u => Math.round((u.condition ?? 100) * 100)).join(","),
             peak: S.peak };
  }
  const baseline = run();

  // stash and strip every world copy table (names, cass, overlord) to empty.
  const w = CFG.v5.world;
  const saved = { names: w.names, cass: w.cass, overlord: w.overlord };
  w.names = {};
  w.cass = Object.fromEntries(Object.keys(saved.cass).map(k => [k, [""]]));
  w.overlord = Object.fromEntries(Object.keys(saved.overlord).map(k => [k, [""]]));
  // the selectors must now return empty strings — proving copy is gone, not cached.
  check("stripped C.A.S.S. returns empty", cassLine(createGame(), "heatwave") === "");
  check("stripped overlord returns empty",
    overlordNote({ grade: 0.9, serveRate: 0.99, cleanScore: 0.9, year: 2, quarter: 1 }) === "");

  const stripped = run();
  CFG.v5.world = { ...w, ...saved }; // restore copy for any later test in the harness

  check("stripped run: cash identical", stripped.cash === baseline.cash, `${stripped.cash} vs ${baseline.cash}`);
  check("stripped run: served identical", stripped.served === baseline.served);
  check("stripped run: fleet condition identical", stripped.conds === baseline.conds);
  check("stripped run: demand peak identical", stripped.peak === baseline.peak);
}

console.log(failed === 0 ? "\nAll world tests passed." : `\n${failed} world test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
