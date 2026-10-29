// ============================================================
// CALENDAR (v5, Phase 1) — the Year ▸ Quarter ▸ Day arithmetic. Pure: it reads
// and writes only S.calendar and returns which boundaries a day-advance crossed,
// so the sim orchestrator can fire the quarter-end review / year hooks. It does
// NOT touch demand, economy, or any other subsystem — just the calendar.
//
// S.calendar = { year, quarter:1..4, dayInQuarter:1..daysPerQuarter, absDay, mode }
//   absDay is a monotonic day counter that never resets across the whole save
//   (the persistent grid has no runs), so it mirrors the sim's demand clock S.day.
// ============================================================
import { CFG } from "./config.js";

const SEASONS = ["winter", "spring", "summer", "autumn"]; // Q1…Q4 (northern grid)

// Build a fresh calendar at the configured start of the arc (Y1 Q1 D1, operating).
export function freshCalendar(){
  return {
    year: CFG.v5.startYear,
    quarter: CFG.v5.startQuarter,
    dayInQuarter: 1,
    absDay: 1,
    mode: "operating", // "operating" (live day) | "planning" (quarter-end board review)
  };
}

// Advance the calendar by one day. Bumps dayInQuarter + absDay; rolls the quarter
// when a quarter's last day completes, and the year after Q4. Returns which
// boundaries were crossed so the caller can fire the right hooks. Pure w.r.t.
// S.calendar — mutates it, reads nothing else.
export function advanceCalendar(S){
  const c = S.calendar;
  const perQ = CFG.v5.daysPerQuarter, perY = CFG.v5.quartersPerYear;
  c.absDay += 1;
  c.dayInQuarter += 1;
  let rolledQuarter = false, rolledYear = false;
  if (c.dayInQuarter > perQ){
    c.dayInQuarter = 1;
    c.quarter += 1;
    rolledQuarter = true;
    if (c.quarter > perY){ c.quarter = 1; c.year += 1; rolledYear = true; }
  }
  return { rolledDay: true, rolledQuarter, rolledYear };
}

// True on the last day of a quarter — the day whose completion triggers the
// quarter-end board review (the heavy planning beat).
export function isQuarterEnd(S){
  return S.calendar.dayInQuarter === CFG.v5.daysPerQuarter;
}

// Season for a quarter (1→winter … 4→autumn) — the hook Phase 8's event regime reads.
export function seasonOf(quarter){
  return SEASONS[(quarter - 1) % SEASONS.length];
}

// A human-readable calendar stamp for the operating-room readout.
export function quarterLabel(S){
  const c = S.calendar, season = seasonOf(c.quarter);
  const cap = season.charAt(0).toUpperCase() + season.slice(1);
  return `Y${c.year} · Q${c.quarter} ${cap} · Day ${c.dayInQuarter}/${CFG.v5.daysPerQuarter}`;
}
