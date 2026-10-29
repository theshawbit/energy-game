// Unit tests for the v5 Year▸Quarter▸Day calendar (no DOM). Run: `npm test`.
// Pins the calendar arithmetic + rollovers the whole v5 loop hangs off.
import { freshCalendar, advanceCalendar, isQuarterEnd, seasonOf, quarterLabel } from "../src/live/calendar.js";
import { createGame } from "../src/live/sim.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const D = CFG.v5.daysPerQuarter, Q = CFG.v5.quartersPerYear;
const freshS = () => ({ calendar: freshCalendar() });

// 1) A fresh game starts at Y1 Q1 D1, operating
{
  const S = createGame();
  const c = S.calendar;
  check("fresh game starts Y1 Q1 D1, absDay 1, operating",
    c.year === 1 && c.quarter === 1 && c.dayInQuarter === 1 && c.absDay === 1 && c.mode === "operating",
    JSON.stringify(c));
}

// 2) A day advances within a quarter
{
  const S = freshS();
  const r = advanceCalendar(S);
  check("advance within a quarter bumps dayInQuarter + absDay only",
    S.calendar.dayInQuarter === 2 && S.calendar.absDay === 2 && S.calendar.quarter === 1 && S.calendar.year === 1);
  check("advance reports rolledDay only", r.rolledDay === true && r.rolledQuarter === false && r.rolledYear === false);
}

// 3) The quarter rolls on the last day
{
  const S = freshS();
  S.calendar.dayInQuarter = D; S.calendar.absDay = D;
  const r = advanceCalendar(S);
  check("last day of a quarter rolls to Q2 D1",
    S.calendar.quarter === 2 && S.calendar.dayInQuarter === 1 && S.calendar.absDay === D + 1 && r.rolledQuarter === true && r.rolledYear === false,
    `Q${S.calendar.quarter} D${S.calendar.dayInQuarter} abs${S.calendar.absDay}`);
}

// 4) The year rolls after Q4
{
  const S = freshS();
  S.calendar.quarter = Q; S.calendar.dayInQuarter = D; S.calendar.absDay = Q * D;
  const r = advanceCalendar(S);
  check("rolling past Q4 advances the year to Y2 Q1 D1",
    S.calendar.year === 2 && S.calendar.quarter === 1 && S.calendar.dayInQuarter === 1 && r.rolledYear === true && r.rolledQuarter === true);
}

// 5) absDay is strictly monotonic across rollovers
{
  const S = freshS();
  const N = Q * D + 3; // past a full year
  for (let i = 0; i < N; i++) advanceCalendar(S);
  check("absDay is monotonic across quarter + year rollovers",
    S.calendar.absDay === N + 1 && S.calendar.year === 2 && S.calendar.quarter === 1,
    `abs${S.calendar.absDay}, Y${S.calendar.year} Q${S.calendar.quarter}`);
}

// 6) isQuarterEnd fires exactly once per quarter (on the last day)
{
  const S = freshS();
  let ends = 0;
  for (let i = 0; i < D; i++){ if (isQuarterEnd(S)) ends++; advanceCalendar(S); }
  check("isQuarterEnd is true exactly once across a quarter (the last day)", ends === 1, `${ends} day(s) flagged`);
  // and it is the last day specifically
  const S2 = freshS(); S2.calendar.dayInQuarter = D;
  check("isQuarterEnd is true on dayInQuarter === daysPerQuarter", isQuarterEnd(S2) === true);
  S2.calendar.dayInQuarter = D - 1;
  check("isQuarterEnd is false the day before", isQuarterEnd(S2) === false);
}

// 7) seasonOf maps the four quarters to the four seasons
{
  check("seasonOf maps Q1..Q4 → winter/spring/summer/autumn",
    seasonOf(1) === "winter" && seasonOf(2) === "spring" && seasonOf(3) === "summer" && seasonOf(4) === "autumn");
  const S = freshS();
  check("quarterLabel reads the calendar", /Y1 · Q1 Winter · Day 1\//.test(quarterLabel(S)), quarterLabel(S));
}

console.log(failed === 0 ? "\nAll calendar tests passed." : `\n${failed} calendar test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
