// ============================================================
// DAILY BRIEF (v5.1 Phase 5) — the blocking-but-skippable daily planning beat. It is
// the channel where the player reviews the fleet and adds to the two ROLLING queues:
// maintenance (Phase 4, crew pool) and upgrades (Phase 3, contractor line). Reintroduces
// the pre-grill daily summary without the 22 forced pauses a quarter:
//
//   • At each day boundary the sim can pause into the brief (sim.surviveDay, gated on
//     S.briefEnabled so headless runs stay operating).
//   • AUTO-ADVANCE through quiet days — once the queues are set, the brief only *yanks
//     the player back* on an EXCEPTION (shouldInterrupt): a rolling job completed, a
//     crisis auto-pause, demand headroom gone tight, cash under a floor, or the
//     stability bar in its danger band. Entering on an exception clears S.autoAdvance
//     until the player re-arms "advance".
//   • Builds are SURFACED here (status + forecast nudge) but committed only at the
//     quarter-end board review — the brief is for the rolling channels.
//
// Pure-ish over `S`: shouldInterrupt / briefSummary are pure reads (no mutation);
// openBrief / closeBrief flip S.calendar.mode (+ the clock) and are the only mutators.
// No DOM, no RNG, no engine import. All thresholds live in CFG.v5_1.brief.
// ============================================================
import { CFG } from "./config.js";
import { autoPause } from "./clock.js";
import { forecastPeak } from "./demand.js";

// Capacity headroom over the live peak, as a fraction of peak (negative = short). The
// planning signal the brief nags on: thin headroom means you're one wobble from a shortfall.
function headroomFrac(S){
  const peak = S.peak || 0;
  if (peak <= 0) return Infinity;
  return ((S.capacity ?? 0) - peak) / peak;
}

// The stability bar as a 0..1 fraction of its ceiling (0 = pristine, 1 = collapse).
function stabilityFrac(S){
  const st = S.stability;
  return st && st.max > 0 ? st.hp / st.max : 0;
}

// Does something this day demand the player's attention? The auto-advance gate: true when
// ANY exception fires. Pure read of current S (the per-day completion count S.jobsDone is
// accumulated by sim.step and consumed at the boundary). When false on a day the player has
// armed auto-advance, the brief stays shut and the sim keeps running.
export function shouldInterrupt(S){
  const b = CFG.v5_1.brief;
  if ((S.jobsDone || 0) > 0) return true;              // a rolling maint/upgrade job landed
  if (S.clock?.autoPaused) return true;                // a crisis/strain auto-pause fired
  if (headroomFrac(S) < b.headroomPct) return true;    // capacity headroom gone tight
  if ((S.cash ?? 0) < b.cashFloor) return true;        // cash under the planning floor
  if (stabilityFrac(S) >= b.stabilityDanger) return true; // grid stability in the danger band
  return false;
}

// The data the brief panel renders — a PURE read (returns copies; never mutates S). Reports
// the day's recap, both rolling queues with their ETAs, demand vs capacity + the next-quarter
// forecast, and the active alerts. render.js turns this into the skippable panel.
export function briefSummary(S){
  const b = CFG.v5_1.brief;
  const peak = S.peak || 0, cap = S.capacity || 0, head = headroomFrac(S);
  const events = [];
  const n = S.jobsDone || 0;
  if (n > 0) events.push(`${n} rolling job${n > 1 ? "s" : ""} completed`);
  if (S.ticker) events.push(S.ticker);
  const alerts = [];
  if (head < b.headroomPct) alerts.push(`Tight headroom — capacity ${Math.round(head * 100)}% over peak`);
  if ((S.cash ?? 0) < b.cashFloor) alerts.push(`Cash low — ${Math.round(S.cash ?? 0)}`);
  if (stabilityFrac(S) >= b.stabilityDanger) alerts.push(`Grid stability in the danger band — ${Math.round(stabilityFrac(S) * 100)}%`);
  if (S.clock?.autoPaused && S.clock.pauseReason) alerts.push(S.clock.pauseReason);
  return {
    events,
    maintQueue: (S.maintQueue || []).map(j => ({ ...j })),
    contractorQueue: (S.contractor || []).map(j => ({ ...j })),
    builds: (S.builds || []).map(bd => ({ ...bd })),
    demand: { peak, capacity: cap, headroom: head },
    forecast: { thisQuarter: S.quarterPeak ?? peak, nextQuarter: S.nextQuarterPeak ?? forecastPeak(S, 1) },
    alerts,
  };
}

// Open the brief: pause into "brief" mode and hold the clock (the player reads a frozen
// grid). Entering clears S.autoAdvance — an exception took the wheel back; the player must
// re-arm "advance" to resume auto-skipping. Mutates S.calendar.mode + S.clock.
export function openBrief(S){
  if (!S.calendar) return;
  S.calendar.mode = "brief";
  S.autoAdvance = false;
  autoPause(S, "Daily brief");
}

// Close the brief and resume the live day: operating mode, clock running at 1×, the
// per-day completion signal consumed. The caller (main.js) sets S.autoAdvance first —
// "advance" re-arms auto-skip, "step a day" leaves it off so the next boundary reopens here.
export function closeBrief(S){
  if (!S.calendar) return;
  S.calendar.mode = "operating";
  S.jobsDone = 0;
  if (S.clock){ S.clock.speed = 1; S.clock.autoPaused = false; S.clock.pauseReason = ""; }
}
