// ============================================================
// SCORECARD (v5.1 Phase 6) — the quarterly KPI → ⚡ faucet. PURE: reads the quarter's
// accumulated log (S.quarterLog) and computes a Scorecard — seven metrics in two channels,
// each scored 0..1 on its own curve, minting the quarter's ⚡ pool 50/50 by channel. This
// is what fixes the orphaned skill currency: the mint banks to profile.currency (the
// permanent skill tree) every quarter, not only at a run's end.
//
//   • PnL (did you run a good business): net MARGIN · COST discipline ($/MWh served) ·
//     CAPITAL efficiency (return on cash sunk into builds + upgrades).
//   • Satisfaction (did you serve the city): RELIABILITY (served fraction) · HEADROOM
//     (reserve margin kept) · CLEANLINESS (CO₂ intensity) · AFFORDABILITY (wholesale price).
//
// Each channel averages its metrics and mints its 50% share of the pool, so a lopsided
// operator (great profit, dark city) can't out-earn a balanced one, and no single metric
// can dominate the whole pool. No DOM, no RNG, no engine import; all numbers from CFG.
// ============================================================
import { CFG } from "./config.js";

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

// Score the closed quarter from its log alone → a Scorecard. Pure + deterministic: identical
// logs yield identical scorecards. Robust to an empty log (missing accumulators read as 0, and
// a channel with no signal scores neutrally rather than NaN).
export function scoreQuarter(S){
  const q = S.quarterLog || {};
  const sc = CFG.v5_1.score;
  const served = q.servedMWh || 0;
  const load = served + (q.shortfallMWh || 0);
  const revenue = (q.floorPay || 0) + (q.swingPay || 0);
  // v5.3 (C3): the mint reads the TRUE PnL — every cost, incl. opCost/interest/VOLL — matching verdict.js.
  const pnl = revenue - (q.opCost || 0) - (q.wages || 0) - (q.overruns || 0) - (q.breachFines || 0)
    - (q.shedFines || 0) - (q.interest || 0) - (q.unservedCost || 0);
  const hours = q.hours || 0;

  // --- PnL channel (0..1 each) ---
  // MARGIN — net margin as a fraction of revenue, normalised by the reference margin.
  const margin = revenue > 0 ? clamp01((pnl / revenue) / sc.marginRef) : 0;
  // COST discipline — operating $/MWh served; cheaper is better (0 at the ceiling). No served
  // load means no cost signal → neutral-full (you burned nothing).
  const costPerMWh = served > 0 ? (q.opCost || 0) / served : 0;
  const cost = served > 0 ? clamp01(1 - costPerMWh / sc.costCeil) : 1;
  // CAPITAL efficiency — return (pnl) on the cash sunk into builds + upgrades this quarter.
  // Sinking nothing is no signal → neutral (you neither grew nor wasted).
  const capEff = (q.capitalSunk || 0) > 0 ? clamp01((pnl / q.capitalSunk) / sc.capEffRef) : 0.5;

  // --- Satisfaction channel (0..1 each) ---
  // RELIABILITY — the served fraction of demanded load (1 = never short).
  const reliability = load > 0 ? clamp01(served / load) : 1;
  // HEADROOM — the average reserve margin kept over the quarter, vs the reference.
  const avgReserve = hours > 0 ? (q.reserveAccum || 0) / hours : 0;
  const headroom = clamp01(avgReserve / sc.headroomRef);
  // CLEANLINESS — lower CO₂ intensity (kg/MWh) scores higher (reuses the verdict's dirty ref).
  const intensity = served > 0 ? (q.emissions || 0) * 1e3 / served : 0;
  const clean = clamp01(1 - intensity / CFG.v5.econ.dirtyIntensity);
  // AFFORDABILITY — the average wholesale price kept reasonable (0 at the ceiling).
  const avgPrice = hours > 0 ? (q.priceAccum || 0) / hours : 0;
  const affordability = clamp01(1 - avgPrice / sc.priceCeil);

  // --- mint: each channel averages its metrics and mints its split of the pool ---
  const pnlScore = (margin + cost + capEff) / 3;
  const satScore = (reliability + headroom + clean + affordability) / 4;
  const pool = sc.mintPerQuarter;
  const mintPnL = pnlScore * pool * sc.channelSplit;
  const mintSat = satScore * pool * (1 - sc.channelSplit);
  // v5.3: the mint is SCARCE — a losing (true PnL ≤ 0) or dark (serve rate below the floor) quarter
  // mints nothing, no matter how the other metrics score. Progression is earned by a good business
  // that keeps the lights on, not merely by surviving.
  const scarce = pnl > 0 && reliability >= (sc.mintServeFloor ?? 0.98);
  const mintTotal = scarce ? mintPnL + mintSat : 0;

  return {
    pnl: { margin, cost, capEff }, sat: { reliability, headroom, clean, affordability },
    pnlScore, satScore, mintPnL, mintSat, mintTotal,
  };
}

// The ⚡ a scorecard mints this quarter — the rounded pool total, never negative. Kept separate
// from scoreQuarter so tests can assert the 50/50 channel split on the raw (unrounded) scores.
export function mintCurrency(scorecard){
  return Math.max(0, Math.round(scorecard?.mintTotal || 0));
}
