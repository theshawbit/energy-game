// ============================================================
// THE WORLD LAYER (v5 Phase 9) — the identity arc, the C.A.S.S. dispatch-AI voice,
// and the overlord's verdict copy. This module is PURE and COSMETIC: it selects
// strings from the CFG.v5.world data tables and never mutates S or touches any
// economic/dispatch state. Strip every table to "" and the sim is identical —
// flavour colours the grid, it never gates it (tests/world.test.mjs task 5).
//
// Imports config only (no cycle): construct.js / verdict.js / render.js import
// from here at runtime.
// ============================================================
import { CFG } from "./config.js";

// Era rank: the aesthetic stage of the district. Monotonic because its inputs are:
// the calendar year only advances, and peak demand only grows (a stalled quarter
// freezes growth, never reverses it). rust → transition → New Veridia.
const ERA_RANK = { rust: 0, transition: 1, veridia: 2 };

// The current era. A later era is reached only when BOTH its gates clear — enough
// years AND enough demand — so a fast-growing young grid still reads as rust, and a
// mature-but-small one does too. Pure read of S.calendar.year + S.peak.
export function eraOf(S){
  const w = CFG.v5?.world?.eras;
  if (!w) return "rust";
  const year = S?.calendar?.year ?? 1;
  const peak = S?.peak ?? 0;
  if (year >= w.veridia.year && peak >= w.veridia.peak) return "veridia";
  if (year >= w.transition.year && peak >= w.transition.peak) return "transition";
  return "rust";
}

// Numeric era rank, for render accents that want an ordering.
export function eraRank(era){ return ERA_RANK[era] ?? 0; }

// A deterministic C.A.S.S. bark for a game id or state (a mutator id like
// "fuel-spike", or a state like "trip"/"brownout"/"strain"/"milestone"/"calm").
// Deterministic WITHOUT consuming S.rng — it indexes by the day so it never perturbs
// the economic RNG stream (and so task 5's strip test leaves mechanics identical).
// An unknown key falls back to the "calm" pool, so a known id never returns empty
// unless the table itself was stripped to "".
export function cassLine(S, event){
  const table = CFG.v5?.world?.cass || {};
  const pool = table[event] || table.calm || [];
  if (!pool.length) return "";
  const i = (S?.day ?? 0) % pool.length;
  return pool[i];
}

// The overlord's quarter-end line, a pure function of the Verdict fields. The band
// logic mirrors verdict.verdictNote (dark → praise → tolerate → dirty → fail) so the
// voice tracks the grade; a praise line is never warm, a fine line is always barbed.
// Deterministic pick keyed off the quarter so successive verdicts vary.
export function overlordNote(v){
  const o = CFG.v5?.world?.overlord || {};
  const band = o[overlordBand(v)] || [];
  if (!band.length) return "";
  const i = Math.max(0, ((v?.year ?? 1) * 4 + (v?.quarter ?? 1))) % band.length;
  return band[i];
}

// Which overlord band a verdict falls in. Exported so a test can assert the mapping
// without reaching into the string tables.
export function overlordBand(v){
  const serveRate = v?.serveRate ?? 1;
  const grade = v?.grade ?? 0;
  const cleanScore = v?.cleanScore ?? 1;
  if (serveRate < 0.9) return "dark";
  if (grade >= 0.85) return "praise";
  if (grade >= CFG.v5.econ.gradeNeutral) return "tolerate";
  if (cleanScore < 0.3) return "dirty";
  return "fail";
}
