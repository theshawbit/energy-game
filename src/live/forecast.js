// ============================================================
// FORECAST (v4, Phase E) — the spot-price forecast's ACCURACY model: how wide
// the uncertainty band is. Earned and conditional: it starts foggy, a research
// branch sharpens it, and market volatility (the chaotic-market mutator) blurs it
// back. Pure: no DOM, no sim import (local clamp avoids a cycle), reads only what
// the caller passes. This module owns the fog WIDTH; the band geometry (applying
// the fog to a predicted price with a separate RNG stream) lives in the sim/IA.
// ============================================================
import { CFG } from "./config.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Fog = the forecast band's half-width, as a FRACTION of price. Research (skill)
// sharpens it; volatility blurs it; clamped to [fogMin, fogMax].
export function forecastFog({ skill = 0, volatility = 0 }){
  const sk = clamp(skill, 0, CFG.forecast.maxSkill);
  const sharpened = CFG.forecast.baseFog * (1 - CFG.forecast.skillGain * sk);
  const blurred = sharpened * (1 + CFG.forecast.volK * volatility);
  return clamp(blurred, CFG.forecast.fogMin, CFG.forecast.fogMax);
}

// Pull the fog inputs off game state: the earned forecasting skill (research) and
// the summed volatility (persistent market + the chaotic-market mutator).
export function forecastInputs(S){
  return {
    skill: S.rmods?.forecastSkill ?? 0,
    volatility: (S.marketVolatility ?? 0) + (S.mmods?.volatility ?? 0),
  };
}
