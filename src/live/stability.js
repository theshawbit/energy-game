// ============================================================
// STABILITY (v5.1 Phase 2) — the grid-stability HP bar and the fail-state it drives.
// Reverses the v5 "no game-over" pillar: a blackout now has BOTH teeth and an exit.
//
// A reservoir `S.stability.hp` (0..max) FILLS while the grid is short and DRAINS while
// it is served. The fill rate is asymmetric by CAUSE — the fairness guarantee:
//   • CAPACITY shortfall — every recovery lever is already exhausted (all dispatchables
//     committed, reserves released, bands wide, load-shed firing, DR active/ungated) and
//     supply is STILL short → fills at the FULL rate. A real, unavoidable collapse.
//   • DISPATCH shortfall — short, but a usable move remained (an uncommitted plant, a held
//     reserve, a throttled band, an un-fired DR, an un-shed tier, an idle charged battery)
//     → fills at the HALF rate. Ignoring a crisis you could have handled is still slowly
//     fatal (punish incompetence), but you are NEVER killed while a lever remains.
// A served hour drains it, slower than it fills, so a grid that keeps scraping back from the
// brink still nets upward and eventually dies. Topping out sets S.over → roguelite restart.
//
// Pure over `S` (no DOM, no RNG). sim.step calls tickStability each tick; the quarter
// rollover calls applyVerdictToStability (the Phase 6 coupling: a strong verdict heals the
// bar, a weak one damages it and accelerates the next quarter's fill).
// ============================================================
import { CFG } from "./config.js";
import { effectiveMax } from "./kpi.js";
import { canDemandRespond, activeShedMW, loadShedTiers } from "./crisis.js";

// The fresh reservoir, seeded by createGame. fillMult (≥1) is the verdict accelerator:
// a weak quarter bumps it so the next quarter's shortfalls bite harder; a strong one
// resets it to 1. lastShortfall mirrors the most recent classification for the readout.
export function freshStability(){
  return { hp: 0, max: CFG.v5_1.stability.max, fillPaused: true, fillMult: 1, lastShortfall: "none" };
}

// Does the operator still have an UNUSED move that could close (some of) the gap? This is
// the heart of the fairness gate — reuse the shipped dispatch dials + Phase 8 crisis levers
// rather than approximating with "supply < demand". A single available lever is enough to
// downgrade a shortfall from "capacity" to "dispatch".
export function hasDispatchLever(S){
  const eps = 1e-6;
  for (const u of (S.fleet || [])){
    if (u.maintDown || u.status === "maint") continue;              // in the shop — not a live move
    if (u.kind === "firm" || u.kind === "gas"){
      if (!u.dials) continue;
      // an uncommitted, idle dispatchable could be brought online (tripped/service can't)
      if (!u.dials.commit){ if (u.status === "off") return true; continue; }
      // a committed unit still holding reserve back, or not dialled to its full band
      if ((u.dials.reserveHold ?? 0) > eps) return true;
      if ((u.dials.bandMax ?? 0) < effectiveMax(u) - eps) return true;
    } else if (u.kind === "battery"){
      // a charged battery sitting idle could be set to discharge
      if (u.status !== "discharge" && (u.energy ?? 0) > eps) return true;
    }
  }
  if (canDemandRespond(S)) return true;                             // DR built ahead, off cooldown, not firing
  if (activeShedMW(S) <= 0 && loadShedTiers(S).some(t => t.mw > 0)) return true; // a load tier left to shed
  return false;
}

// Classify the CURRENT grid state from S.demand vs S.capacity (the canonical per-tick
// values the sim sets before calling this). "none" when served; otherwise "dispatch" if a
// lever remains, "capacity" if every lever is exhausted. Consumed by tickStability + the UI.
export function classifyShortfall(S){
  const short = (S.demand ?? 0) - (S.capacity ?? 0);
  if (short <= CFG.v5_1.stability.epsilon) return "none";
  return hasDispatchLever(S) ? "dispatch" : "capacity";
}

// Advance the reservoir by dtH game-hours from the tick's supplied vs demanded MW. Fills by
// fillCapacity / fillDispatch (× the verdict accelerator) per the cause, drains by drainRate
// when served; clamps to [0, max]. Tops out → S.over + S.reason, which freezes the run.
export function tickStability(S, suppliedMW, demandMW, dtH){
  const st = S.stability;
  if (!st || S.over || dtH <= 0) return;
  const cfg = CFG.v5_1.stability;
  const short = (demandMW ?? 0) - (suppliedMW ?? 0);
  if (short <= cfg.epsilon){
    st.lastShortfall = "none";
    st.fillPaused = true;
    st.hp = Math.max(0, st.hp - cfg.drainRate * dtH);
  } else {
    const cls = hasDispatchLever(S) ? "dispatch" : "capacity";
    const rate = (cls === "capacity" ? cfg.fillCapacity : cfg.fillDispatch) * (st.fillMult ?? 1);
    st.lastShortfall = cls;
    st.fillPaused = false;
    st.hp = Math.min(st.max, st.hp + rate * dtH);
    if (st.hp >= st.max){ st.hp = st.max; S.over = true; S.reason = "grid-collapse"; }
  }
}

// The Phase 6 verdict coupling (pure read of the Verdict's 0..1 grade). A quarter ABOVE par
// heals the bar in proportion to how far above, and resets the fill accelerator; a quarter
// BELOW par damages it and bumps the accelerator so the next quarter's shortfalls bite
// harder. KPIs thus matter to survival, not just score. May itself end the run.
export function applyVerdictToStability(S, verdict){
  const st = S.stability;
  if (!st || verdict == null || S.over) return;
  const cfg = CFG.v5_1.stability;
  const par = cfg.verdictPar;
  const g = verdict.grade ?? par;
  if (g >= par){
    const frac = par < 1 ? (g - par) / (1 - par) : 0;              // 0 at par → 1 at a perfect grade
    st.hp = Math.max(0, st.hp - cfg.verdictHeal * frac);
    st.fillMult = 1;
  } else {
    const frac = par > 0 ? (par - g) / par : 0;                    // 0 at par → 1 at a zero grade
    st.hp = Math.min(st.max, st.hp + cfg.verdictDamage * frac);
    st.fillMult = (st.fillMult ?? 1) + cfg.verdictFillBump * frac;
    if (st.hp >= st.max){ st.hp = st.max; S.over = true; S.reason = "grid-collapse"; }
  }
}
