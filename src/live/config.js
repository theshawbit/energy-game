// ============================================================
// LIVE CONFIG — tuning knobs, the starting fleet, and a factory for
// newly-built units. Pure data (plus factories). No state, no DOM.
// ============================================================
import { SOLAR_CF, WIND_CF, TECH } from "../constants.js";
import { defaultDials } from "./dispatch.js";
import { freshKPIs } from "./kpi.js";

// ---- tuning (meant to be played with) ----
export const CFG = {
  // v5: a ~3-minute engaged day (was 48s). At 180s a game-hour ≈ 7.5 real-sec, so a
  // trip warning (strainWarn 1.6 gh ≈ 12s) and a peaker spin-up breathe — read-decide-act
  // with intent, not twitch. All code + tests read this constant, so the pacing is central.
  secondsPerDay: 180,         // real seconds for a 24h cycle (~3-min day; 1 game-hour ≈ 7.5s)
  startHour: 6,               // shift begins at 06:00
  startPeak: 780,             // MW peak demand, day 1
  startCash: 120000,          // $ on hand day 1, so the manage panel has an opening move
  peakGrowth: 1.06,           // demand growth per day survived
  spinCost: 11,               // $/MW/h default to keep a thermal plant synced (per-unit `spin` overrides)
  fixedOM: 10,                // $/MW/h fixed O&M on ONLINE dispatchable capacity (renewables exempt)
  fixedOMIdle: 0.3,           // v4.1: an off/reserve plant costs only this FRACTION of fixedOM to own
                              //   (idle peakers + the battery shouldn't bleed you dry — fixes the
                              //   cold-start insolvency; you only pay the full rate for what you run)
  unservedPenalty: 120,       // $/MWh extra penalty on unserved load (emergency purchases / fines)
  // v5 Phase 6 re-tune: the day grew from 48s → 180s (Phase 1), but strain/recover were
  // still per-real-second constants sized for the short day, so a brownout pinned strain
  // almost instantly. Scaled by ≈48/180 so the per-GAME-DAY feel is preserved on the long
  // day — strain now escalates over a meaningful stretch of a shortfall, never a snap. Strain
  // is no longer fatal (v5 removed game-over); it is the pain signal the view reacts to.
  strainRate: 14,             // strain gained per second at 100% shortfall (was 52 @ 48s/day)
  strainRecover: 12,          // strain shed per second when covered (was 45 @ 48s/day)
  instantBlackout: 0.42,      // only a catastrophic shortfall kills instantly; smaller ones
                              //   fill the strain meter instead, giving a window to react
                              //   (fire the battery, start peakers) — so deaths feel earned
  satDrain: 11,               // satisfaction lost per second at 100% shortfall (v5 P6: scaled for the 180s day; was 40 @ 48s)
  satRecover: 1.5,            // satisfaction regained per second when fully covered (slow — mistakes linger)
  outageRamp: 0.10,           // trip rate grows this much per day survived
  battRecharge: 70,           // MW recharge rate when idle
  carbonStartDay: 3,          // carbon pricing kicks in after the opening days
  carbonPerDay: 3.5,          // $/t added each day thereafter (~day 13 flips coal→gas)
  // v4.2.1 WEAR MODEL — deterioration is a function of LOAD × AGE, not a flat clock.
  //   wear/gh = wearRate × loadMult × ageMult × strainMult × (run mods)
  // loadMult ("both combined") = gridUtil (demand/online-capacity, the system stress)
  //   × assetLoad (this unit's own dispatch share of its cap). A baseload plant on a
  //   tight grid wears hard; a lightly-loaded reserve barely wears. Age accumulates
  //   only while generating and PERSISTS through service/upgrade, but each service
  //   partially relieves it (knocks it down, never to a full reset).
  wearRate: 0.5,              // base condition %/game-hour at full load, fresh plant
  wearLoadFloor: 0.35,        // gridUtil can't push loadMult below this (a slack grid still wears some)
  wearLoadMax: 1.25,          // …nor above this (an overloaded grid wears a touch harder)
  wearIdleFloor: 0.12,        // an online-but-undispatched plant still wears this share (spinning idle)
  ageRef: 180,                // game-hours of generation that adds ageWearK to the age multiplier
  ageWearK: 0.9,              // age multiplier gain per ageRef of accumulated runtime (fresh = 1.0)
  serviceAgeRelief: 0.55,     // a service multiplies accumulated ageHours by this (removes ~45%)
  upgradeAgeRelief: 0.30,     // an upgrade is deeper — keeps only this share of ageHours
  // v4.2.2: trip risk is tied to CONDITION via this lookup — [condition%, daily
  // strain probability] for a REFERENCE plant at fail = tripRefFail (coal). A
  // plant's own u.fail scales it (nuclear is more reliable; an upgrade that cuts
  // u.fail cuts trips too). HARD RULE: a plant at ≥85% NEVER trips (first point is
  // 0) — real plants rarely fail, so trips are now a rare, dramatic neglect event,
  // not a constant tax. Below 85% risk ramps; condition ≤ the last point plateaus.
  // The real moment-to-moment challenge lives in the volatile net-load curve (vol).
  tripOdds: [[85,0],[77,0.004],[70,0.012],[60,0.06],[50,0.18],[40,0.30],[30,0.40]],
  tripRefFail: 0.0045,        // the fail rate the tripOdds table is calibrated to (coal)
  tripOverhaul: 50,           // below this condition a service becomes a costly, slower OVERHAUL
  overhaulCostMult: 6,        // an overhaul costs this × the normal service charge (deep damage)
  overhaulTimeMult: 1.75,     // …and keeps the plant offline this × longer
                              //   (raised 3→5 — base rates are now low, so WEAR is the real trip
                              //   driver: a maintained plant almost never trips, a neglected one does)
  // v4.1 telegraphed trips: a hazard roll no longer drops a plant instantly — it enters a
  // STRAINED warning state for this many game-hours (still generating), giving you time to
  // fire reserves / shed load / stand a peaker down before it actually trips offline.
  strainWarn: 1.6,            // game-hours a plant strains before it trips (~3 real-seconds of warning)
  serviceTime: 4,             // game-hours a plant is offline for a full service
  // v4.2.2: service fee is strongly CONDITION-graduated. The per-MW-of-damage term
  // dominates (small flat floor), so a light touch-up at 80% is cheap and a heavy
  // service at 50% clearly isn't — condition visibly drives the bill.
  repairPerMW: 140,           // $/MW × damage fraction — the condition-driven term
  repairMin: 1500,            // small flat floor (call-out / fixed labour)
  // ---- v4.2.2 NET-LOAD VOLATILITY — the real moment-to-moment challenge ----
  // With trips now rare, difficulty comes from a choppy demand-vs-capacity curve:
  // intermittent renewables (gusts, cloud banks, lulls) and demand noise + spikes.
  // Both are mean-reverting random walks (toward 1.0 / 0) so they wander and recover
  // rather than ratcheting; a shortfall fills the strain meter (seconds to react),
  // so volatility rewards attention and a kept reserve margin, never instakills.
  // Each is a mean-reverting (Ornstein-Uhlenbeck) process: pull = revert×(μ−v)×dt,
  // noise = rand(-1,1)×vol×√dt. The √dt is the point — it makes volatility real and
  // FRAME-RATE INDEPENDENT (a linear ×dt noise averages out at 60fps, which is why the
  // old drift felt glassy). Equilibrium swing ≈ vol/√(2·revert)×0.577; correlation time
  // ≈ 1/revert real-seconds (a game-hour ≈ 2 real-sec), so swings last a few game-hours.
  vol: {
    sunRevert: 0.20, sunVol: 0.20, sunLo: 0.25, sunHi: 1.15,   // solar ≈ ±18% (cloud banks)
    windRevert: 0.15, windVol: 0.26, windLo: 0.15, windHi: 1.55, // wind ≈ ±27% (gusts & lulls)
    demandRevert: 0.20, demandVol: 0.11, demandJitMax: 0.14,   // continuous load wobble ≈ ±10%
    spikeChance: 0.14,  // probability per game-hour a demand spike begins
    spikeMin: 0.07, spikeMax: 0.20,  // +7%…+20% demand while a spike runs
    spikeDurMin: 0.6, spikeDurMax: 1.8, // game-hours a spike lasts
  },
  // ---- research / R&D lab (v3) ----
  rpPerDollar: 0.0006,        // RP per $ diverted into R&D. Tuned (F2) so a typical run
                              //   researches ~5–8 of 12 nodes — forcing a path choice —
                              //   instead of finishing the whole tree with RP to spare.
  rdFundingMax: 20000,        // $/game-hour cap on R&D funding
  // ---- per-run mutators (v3) — magnitudes live here so balance is central ----
  mut: {
    minRoll: 1,               // fewest mutators a run rolls
    maxRoll: 2,               // most mutators a run rolls
    fuelSpike: 1.5,           // gas fuel-price multiplier (re-sorts the merit order)
    heatwave: 1.18,           // demand multiplier (air-con all day)
    coldSnap: 1.12,           // demand multiplier (heating load)
    drought: 0.6,             // wind capacity-factor multiplier
    lull: 0.68,               // solar AND wind cf multiplier (F2: 0.55→0.68, it was the
                              //   deadliest mutator by a wide margin — evened toward the rest)
    fuelScarcity: 1.4,        // v4: fuel-spike also compounds the spot scarcity premium (b4)
    chaosVol: 0.6,            // v4 (E): chaotic-market adds this to the forecast-fog volatility axis
  },
  // ---- v4 "The Book": spot market + term contracts (Phase B) ----
  // Revenue = contracted blocks at a locked price + residual served load at spot.
  // Spot = a flat-ish baseline + a scarcity premium driven by the player's OWN
  // reserve margin (thin → spike, flush → crash); mutators compound it. Baseline
  // is deliberately small vs scarcityMax so the player's dispatch moves the price.
  // (g3 balance pass: scarcityMax 240→100 + spotCap 320→165 compress the old
  // spot WINDFALL — a tight unhedged grid used to ride spot to ~$1M; now the
  // net-worth p90 tail is ~$1–2M and the realized-spot CoV drops from ~1.0 to ~0.7.)
  spotBase: 50,               // $/MWh flat baseline the spot price sits around
  spotDaily: 0.25,            // how much the daily demand shape lifts/drops the baseline hour to hour
  spotDrift: 0.015,           // slow per-day upward drift of the baseline (a gentle cost-of-living climb)
  spotFloor: 8,               // $/MWh hard floor (a flush grid still clears above zero)
  spotCap: 165,               // $/MWh hard ceiling on spot (g3: 320→165 — scarcity can't run away)
  scarcityMax: 100,           // $/MWh premium at a tight/short grid (g3: 240→100; PLATEAUS — no deeper-shortfall windfall)
  crashMax: 54,               // $/MWh discount a flush grid suffers (g3: 42→54 — overbuild/flush bleeds; plateaus at rmCrash)
  rmRef: 0.25,                // reserve margin where the premium hits zero (healthy headroom)
  rmCrash: 0.80,              // reserve margin where the crash discount plateaus (hugely overbuilt)
  // term contracts (the hedge): lock load at a fixed price for a run of days
  hedgeDefault: 0.5,          // default hedge dial — commit ~half of expected output
  hedgeBaseFactor: 1.06,      // base lock ≈ baseline (g3: 0.90→1.06 — a 4-day lock prices ≈ the ~$60 average spot, so hedging is fair insurance, not a structural loss)
  hedgeTermBonus: 0.035,      // each extra day of term lifts the locked rate this much
  hedgePriceCap: 1.35,        // a long lock can't beat baseline by more than this
  contractTermMin: 2,         // shortest term the dial offers (game-days)
  contractTermMax: 6,         // longest term the dial offers (game-days)
  hedgeMaxContracts: 6,       // v4.1: most standing hedge legs you can ladder on the book at once
  // ---- v4 "The Book": financing — debt, credit, bankruptcy (Phase C) ----
  // A credit STANDING ∈ [0,100] carries across runs and sets both the interest
  // rate and the borrowing ceiling. Default craters it for the run and scars the
  // persistent record; sustained insolvency is a bankruptcy fail-state.
  creditStart: 70,            // starting credit standing ∈ [0,100] (≈ grade A — a clean operator)
  rateMin: 0.012,            // interest rate per GAME-DAY at perfect credit (100)
  rateMax: 0.085,            // interest rate per game-day at zero credit
  ceilingMin: 0,             // borrowing ceiling ($) at zero credit
  ceilingMax: 400000,        // borrowing ceiling ($) at perfect credit
  defaultCredit: 20,         // credit is slammed to ≤ this the moment you default
  defaultCeil: 55,           // and your credit ceiling is capped here for the rest of the run
  defaultFloor: 40,          // cross-run standing can't be written back above this after a default
  creditRecoverPerDay: 3,    // solvent days rebuild credit toward the (possibly capped) ceiling
  insolvencyFloor: 0,        // cash below this counts as insolvent
  hardInsolvency: -150000,   // cash this deep in the red = pain onset (v5: cratered credit, stalled growth — NOT a wind-up)
  bankruptcyGrace: 22,       // v5 P6: real-seconds insolvent before PAIN ONSET (not death — game-over is gone); scaled for the 180s day (was 6 @ 48s)
  // ---- v4 "The Book": multi-track scoring (Phase D) — each track earns ⚡ on its
  // own curve, so longevity, wealth, clean play and spot-trading can each be "the
  // point". Divisors are $/⚡ or %/⚡; higher = that track rewards more slowly.
  score: {
    longevityPerDay: 3,      // ⚡ per day survived
    netWorthPerCoin: 60000,  // $ of peak net worth per ⚡
    cleanPerPct: 0.4,        // ⚡ per percentage-point of clean-energy share
    spotKillPerCoin: 4000,   // $ of biggest single spot-spike capture per ⚡
  },
  // ---- v4 "The Book": earned forecast (Phase E) — the spot forecast starts
  // foggy, research sharpens it, volatility blurs it. fog = band half-width as a
  // fraction of price. ----
  forecast: {
    maxSkill: 3,             // forecasting research tops out at skill 3
    baseFog: 0.30,           // ±30% band with no forecasting skill, calm market
    skillGain: 0.28,         // each skill level narrows the base fog by this fraction
    volK: 1.2,               // how hard volatility widens the fog
    fogMin: 0.04,            // sharpest possible band (±4%)
    fogMax: 0.60,            // blurriest band (±60%)
  },
  // ---- v4 "The Book": meta blooms (Phase F) ----
  // A run is now a finite CONTRACT, not endless survival: it runs baseDays, grown
  // by the "Longer Shifts" economy unlocks, then ends as a graceful WIN.
  run: { baseDays: 5, tier1: 2, tier2: 2, tier3: 3 }, // 5 → 7 → 9 → 12 days
  // capacity market (advanced tier): get paid for available reserve MW, fined if
  // you can't deliver when called. A breach fine is recoverable — never fatal by
  // itself (only sustained insolvency ends a run).
  capacity: {
    pricePerMW: 9,        // $/MW/day availability payment while under obligation
    penaltyPerMw: 55,     // $/MW breach fine when called and short
    callBaseProb: 0.35,   // base per-day chance of a capacity call (rises with tightness)
  },
  // named-buyer special offers (the Rolodex): occasional standout contracts
  offers: { dailyChance: 0.25 }, // per-day chance a buyer brings an offer (with the unlock)
  // ---- v5 "The Persistent Grid" (Phase 1): the Year ▸ Quarter ▸ Day calendar +
  // the variable clock. The day LENGTH is the top-level CFG.secondsPerDay above
  // (one source, read by code + tests); these are the calendar/clock knobs. All
  // v5 tuning lands under CFG.v5 so the persistent-grid balance stays central. ----
  v5: {
    daysPerQuarter: 22,       // ~22 game-days per quarter (a ×4 compression of a real 90-day Q)
    quartersPerYear: 4,       // quarter = season = fiscal period; Q1 winter … Q4 autumn
    fastSpeed: 3,             // fast-forward multiplier (skip calm hours); 1× is the ~3-min day
    startYear: 1,             // the long arc begins at Year 1 …
    startQuarter: 1,          // … Quarter 1, Day 1
    // Phase 2: the dedicated peaker KIND is retired — fast gas is just a dial-able
    // thermal plant with a quick spin-up. These inherit the old peaker's ramp/start
    // characteristics so a gas unit dialled to a narrow high band is the former peaker.
    gas: {
      spin: 11,               // $/MW/h to keep synced (pricey top-up, as the old peaker)
      fail: 0.0030,           // per-tick trip reference (between coal and nuclear)
      recover: [1.5, 3],      // game-hours to come back from a trip
      startTime: 1.6,         // game-hours to spin up from cold (the "fast" in fast gas)
    },
    // Phase 3: the degradation keystone. Per-axis decay keyed to operating STYLE —
    // replaces the single wearRate. Wear is EARNED by how you dial a plant, never
    // ambient: push a high-load plant and Reliability/Output bleed; run it at part-
    // load and Efficiency drifts; cycle it and Flexibility (and a little Reliability)
    // takes the hit. Rates are %/game-hour at full stress; the hits are %/event.
    decay: {
      idleFloor:   0.12,      // a spinning-idle plant still carries this load share
      loadRefHigh: 0.70,      // loadFrac above this counts as "high load" (push bites here)
      partLoadRef: 0.50,      // loadFrac below this is "part-load" (efficiency drifts)
      reliability: 0.55,      // %/gh when push×high-load = 1
      output:      0.40,      // %/gh when push×high-load = 1
      efficiency:  0.45,      // %/gh at full part-load (loadFrac → idleFloor)
      rampHit:     1.0,       // flexibility % lost per ramp (band move)
      startHit:    2.5,       // flexibility % lost per start (cold → committed)
      startRelHit: 0.4,       // reliability % nicked per start
    },
    // Phase 3: KPI → effect curves. outputMin = derate floor at Output 0; heatRateMax
    // = extra $/MWh fraction at Efficiency 0; rampMin = ramp-speed floor at Flex 0;
    // minLoadMax = min stable load (as a cap fraction) at Flex 0.
    kpiCurve: { outputMin: 0.6, heatRateMax: 0.5, rampMin: 0.5, minLoadMax: 0.4 },
    // Phase 4: the soft-specialized, levelling crew pool. A crew is best at one trade
    // (KPI axis) but can take any task at the offTrade penalty (never 0 — fungible).
    // Levels up passively through use; ⚡ promotes standouts + raises the level ceiling.
    // Wages are a standing per-quarter cost (deducted in the rollover until Phase 6's
    // settleQuarter folds them into PnL). The roster ceiling gates hiring (⚡ raises it
    // in Phase 7). All crew/maintenance balance lives here so it tunes centrally.
    crews: {
      startCrews:    3,       // crews you begin the save with (one per core trade)
      baseRoster:    4,       // starting roster ceiling — max crews you can hold
      hireCost:      4000,    // $ to hire one crew (within the ceiling)
      wage:          1200,    // $/crew/quarter standing cost, deducted at settlement
      offTrade:      0.6,     // ×restore when a crew works off its trade (soft-specialized)
      levelEdge:     0.08,    // +restore per crew level above 1 (on-trade mastery compounds)
      xpPerTask:     12,      // XP a crew earns per completed task
      xpCurve:       20,      // cumulative XP to cross one level
      levelCapBase:  3,       // a fresh crew levels this high on XP alone …
      maxLevel:      6,       // … and never past here, even promoted
      promoteCost:   2,       // ⚡ to promote a crew (raise its level ceiling + bump level)
      promoteCapBump:1,       // levels the ceiling rises per promotion
    },
    // Phase 4: the per-KPI maintenance task catalogue. Each task restores exactly one
    // axis (overhaul→reliability, retune→efficiency, uprate→output, recalibrate→
    // flexibility). v5.1 Phase 4 made maintenance ROLLING: maint.js reads only `axis` +
    // `label` from here for the UI; the live cost / duration / restore now come from
    // CFG.v5_1.maint. The restore/quarters/cost fields below are legacy (quarter-end model).
    maint: {
      tasks: {
        overhaul:    { axis:"reliability", label:"Overhaul",    restore:45, quarters:1, cost:9000 },
        retune:      { axis:"efficiency",  label:"Retune",      restore:40, quarters:1, cost:6000 },
        uprate:      { axis:"output",      label:"Uprate",      restore:40, quarters:1, cost:7000 },
        recalibrate: { axis:"flexibility", label:"Recalibrate", restore:35, quarters:1, cost:5000 },
      },
    },
    // Phase 5: construction. A new plant is a multi-quarter capital project committed at
    // the quarter-end review — it produces NOTHING until it comes online (gas fast,
    // nuclear slow). There's no hard cap on concurrent builds, but push past `comfortable`
    // and projects SLIP: each quarter a crowded build may fail to progress and pay an
    // overrun. Under a steepening demand curve a delayed plant is a brownout, so the
    // forecast makes building ahead a real planning skill. Capital cost = BUILD[tech].cost.
    build: {
      leadTimes: {            // quarters from commit to first MW — gas short, nuclear long
        solar: 1, wind: 1, battery: 1, peaker: 1,
        coal: 2, ccs_coal: 2, ccs_gas: 2,
        geo: 3, nuclear: 4, smr: 4,
      },
      comfortable:  2,        // concurrent builds you can run with ~no slip
      slipPerExtra: 0.18,     // +slip probability per build beyond `comfortable`
      slipMaxProb:  0.6,      // slip probability never exceeds this (even a huge queue finishes)
      overrunRate:  0.12,     // a slipped quarter charges this fraction of the capital cost
    },
    // Phase 6: the hybrid economy settles on THREE money-surfaces — a regulated capacity
    // FLOOR (availability pay on reserve you hold ready, keyed to Reliability), a market
    // SWING (live spot PnL on the MW you push, sharpened by Efficiency/Output/Flexibility),
    // and the overlord's quarterly VERDICT (grades your KPIs + serve rate + clean standing,
    // ratchets next quarter's floor rate, hands a bonus or fine). Failure is stagnation —
    // a wrecked quarter stalls demand growth and tightens credit, never a game-over.
    econ: {
      floorRateStart: 6,      // $/MW/h availability pay on held reserve at game start (verdict ratchets it)
      floorRateMin:   2,      // the overlord never squeezes the floor rate below this …
      floorRateMax:   16,     // … nor rewards above this
      rateRatchet:    0.30,   // how hard a verdict moves next quarter's floor rate (× grade gap)
      gradeNeutral:   0.60,   // composite grade (0..1) the overlord treats as "par" — above earns, below is squeezed
      wKpi:   0.40,           // verdict grade weights: fleet KPI average …
      wServe: 0.40,           // … how much load you actually served …
      wClean: 0.20,           // … and your clean standing (emissions intensity). Sum = 1.
      dirtyIntensity: 650,    // kg CO₂/MWh at which clean standing hits 0 (cleaner → better verdict)
      bonusMax: 45000,        // $ bonus at a perfect grade (scales with the gap above neutral)
      fineMax:  45000,        // $ fine at a zero grade (scales with the gap below neutral)
      growthStallThreshold: 0.92, // a quarter serving below this fraction of load stalls next quarter's growth …
      growthStallMax: 0.6,    // … removing up to this fraction of the demand-growth step (stagnation, not death)
    },
    // Phase 7: per-axis SPECIALIZATION (cash) — retires the v4 Mk ladder. You spend cash
    // to raise any of a thermal plant's four KPI attainable-maxes (`u.caps[axis]`) along a
    // STEEPENING curve, so a plant drifts toward a shape with free development but no branch
    // lock (spreading thin is costly, never forbidden). Cash alone pushes an axis to
    // `baseCeiling`; RP (`raiseCeiling`) lifts a tech-family's hard ceiling further, up to
    // `axisMax`. KPI effect curves (kpi.js) read values past 100, so a specialized axis is a
    // real edge: Output → more MW, Efficiency → cheaper fuel, Flexibility → faster ramp,
    // Reliability → near-immunity + full floor. Maintenance restores toward the raised cap.
    upgrade: {
      base:        100,       // every axis's attainable max starts here (a fresh plant)
      step:        10,        // KPI points an axis's cap rises per cash upgrade
      cost0:       28000,     // $ for the first upgrade on an axis (at base) …
      costGrowth:  1.5,       // … and each further upgrade on that axis costs this much more
      baseCeiling: 120,       // (legacy Phase 7 RP-ceiling knobs — retired by v5.1 Phase 3's tier ladder)
      // v5.1 Phase 3: the KPI effect curves (kpi.js axisClamp) read up to here. It must cover the
      // upgrade ladder's TOP cap = base × (1 + tierMax × tierStep) ≈ 262 at the shipped v5_1.upgrade
      // values, so a tier-9 axis isn't silently clamped. Retune both together if the ladder changes.
      axisMax:     262,
      ceilingStep: 15,        // RP raises a tech-family axis's hard ceiling by this many points
      ceilingCost0: 55,       // RP for the first ceiling raise on a tech+axis …
      ceilingGrowth: 1.5,     // … steepening per raise
    },
    // Phase 7: ⚡ PERKS — Guild Cred expands reach. Roster + control-room conveniences buy
    // freely; AUTOMATION perks (auto-maintenance, dispatch assist) are deliberately gated to
    // a late grid GROWTH TIER (fleet size × year), so you feel the clerical burden of scale
    // before you earn the relief. automationTier(S) returns the highest tier whose fleet AND
    // year thresholds are both met; a perk tagged with a higher tier is refused even with ⚡.
    perks: {
      list: {
        roster:        { cost: 3, label: "Expand Roster",   kind: "roster", rosterBump: 1,
                         desc: "Raise the crew roster ceiling by one." },
        advgen:        { cost: 4, label: "Advanced Generation", kind: "research-branch", branch: "advgen",
                         desc: "Unlock the Advanced Generation research branch (SMR · geo · CCS)." },
        forecasting:   { cost: 3, label: "Forecasting Program", kind: "research-branch", branch: "forecasting",
                         desc: "Unlock the Forecasting research branch (sharper spot outlook)." },
        autoMaint:     { cost: 8, label: "Auto-Maintenance", kind: "automation", tier: 2,
                         desc: "At each review, crews are auto-assigned to the neediest plants (you still pay)." },
        dispatchAssist:{ cost: 6, label: "Dispatch Assist",  kind: "automation", tier: 2,
                         desc: "Unpinned plants auto-trim their dials to the margin each tick (within legal bands)." },
      },
      // growth tiers: the highest index whose BOTH thresholds (fleet size, calendar year) are
      // met is the grid's automation tier. A fresh grid (9 plants, Y1) sits at tier 0.
      tiers: [
        { fleet: 0,  year: 1 },  // tier 0 — the opening grid
        { fleet: 12, year: 2 },  // tier 1 — a growing grid
        { fleet: 15, year: 3 },  // tier 2 — a big grid that has earned automation
      ],
    },
    // Phase 8: the mid-quarter CRISIS toolkit. Because maintenance is quarter-end only,
    // the live day needs an EARNED, PENALISED escape hatch when a plant fails. Two tools:
    //  • LOAD-SHED — cut a pre-prioritised non-critical load tier (a controlled brownout:
    //    you choose the cut instead of the grid cascading). A real satisfaction hit + a fine
    //    that settles into the quarter PnL (quarterLog.shedFines) — cheaper than the blackout
    //    it averts, never free. `frac` = share of current load the tier sheds.
    //  • DEMAND RESPONSE — an active peak shave, gated STRICTLY on the demand-response
    //    research branch (rmods.demandShave > 0): foresight, never a panic button. One shot
    //    per window, then a cooldown.
    crisis: {
      shedTiers: [
        { id: "industrial",  label: "Industrial Park",      frac: 0.08, satHit: 3,  fine: 4000 },
        { id: "commercial",  label: "Commercial Districts",  frac: 0.14, satHit: 7,  fine: 9000 },
        { id: "residential", label: "Outer Residential",     frac: 0.22, satHit: 14, fine: 18000 },
      ],
      shedWindow: 2,          // game-hours a load-shed holds before the tier is restored
      drShave:    0.15,       // active demand response shaves this fraction of load …
      drWindow:   3,          // … for this many game-hours …
      drCooldown: 12,         // … then DR can't fire again for this many game-hours
    },
    // Phase 8: the seasonal EVENT REGIME. Each quarter (= season) carries a weather bias +
    // an event deck dealt from the shipped mutator ids. `bias` folds straight into the
    // computeMutatorMods shape (so `step` consumes it unchanged); `deck` is weighted draws;
    // `deal` is how many distinct events the quarter runs. Winter/summer peak hard; the
    // shoulder seasons (spring/autumn) are milder with their own flavour. Flavour TEXT stays
    // OUT of here (Phase 9 owns copy) — ids + mods only.
    regimes: {
      deal: 1,                // distinct events dealt per quarter from the active deck
      bySeason: {
        winter: { demandMult: 1.12, deck: [ { id: "cold-snap", weight: 3 }, { id: "fuel-spike", weight: 2 }, { id: "renewable-lull", weight: 1 } ] },
        spring: { demandMult: 1.0,  deck: [ { id: "renewable-lull", weight: 2 }, { id: "chaotic-market", weight: 2 }, { id: "drought", weight: 1 } ] },
        summer: { demandMult: 1.14, deck: [ { id: "heatwave", weight: 3 }, { id: "drought", weight: 2 }, { id: "fuel-spike", weight: 1 } ] },
        autumn: { demandMult: 1.0,  deck: [ { id: "chaotic-market", weight: 2 }, { id: "renewable-lull", weight: 2 }, { id: "cold-snap", weight: 1 } ] },
      },
    },
    // Phase 9: the WORLD layer — the Rust District → New Veridia identity arc, the C.A.S.S.
    // dispatch-AI barks, and the overlord's verdict voice. ALL copy lives here as DATA; world.js
    // is a pure selector over these tables. This layer COLOURS the sim, never gates it — strip
    // every string to "" and the mechanics are identical (see tests/world.test.mjs task 5).
    world: {
      // the aesthetic era, gated on monotonic inputs (year AND demand peak) so it never regresses.
      // A fresh grid is "rust"; it grows into "transition" then "veridia" as the city scales.
      eras: {
        transition: { year: 2, peak: 1400 },  // ≥Y2 AND peak ≥1400 MW → the district modernises
        veridia:    { year: 3, peak: 3000 },  // ≥Y3 AND peak ≥3000 MW → gleaming New Veridia
      },
      // era-aware place-name pools for mid-run builds. "rust" reuses the shipped PLACE_POOL below
      // (so every shipped name still appears); later eras override with their own pools. A tech
      // absent from an era's pool falls back to the rust foundry names — new content is a data drop.
      names: {
        veridia: {
          nuclear: ["Veridia Prime","Aurora Reach","Helios Spire","Meridian"],
          coal:    ["Reclaim One","Sunset Stack","Legacy Yard","Transition Works"],
          solar:   ["Solaris Fields","Brightmere","Lumen Park","Dawnspan","Clearwater","Apex Array"],
          wind:    ["Skyreach","Zephyr Line","Highcrest","Aeris Point","Windward","Crestfall"],
          peaker:  ["Swiftcore Gas","Nimbus Peak","Pulsegate","Flashpoint","Vanguard","Keenedge"],
          battery: ["Cellhaven","Fluxmere","Ionvault","Everstore","Reservoir","Keystone Cells"],
          smr:     ["Quantum Vale","Fission Court","Minervine","Coremantle"],
          geo:     ["Terravent","Deepwell Prime","Magmara","Corebloom"],
          ccs_coal:["Purecoal Works","Scrubspire","Cleanstack","Zerovault Coal"],
          ccs_gas: ["Pureflame","Capturine","Clearburn Prime","Azure Gas"],
        },
      },
      // C.A.S.S. (the deadpan dispatch AI). Barks keyed to real game ids/states — every shipped
      // mutator/event id and key state has a pool, so cassLine never falls through to empty.
      // Flavour only; what the player READS, never what the sim DOES.
      cass: {
        "fuel-spike":     ["Gas just got expensive. The merit order disagrees with your budget.", "Fuel markets are panicking. You should not. (You may.)"],
        "heatwave":       ["Eight million air conditioners just voted. Demand wins.", "The basin is sweating. Find firm headroom or explain the dark."],
        "cold-snap":      ["Heating load spikes. The cold does not file paperwork.", "Everyone turned the heat up at once. Reserves, now."],
        "drought":        ["Still air, low water. The wind turbines are decorative today.", "Hydrology is not cooperating. Neither is the wind."],
        "renewable-lull": ["Overcast and calm. Solar and wind have both clocked out.", "The weather is holding its breath. So is your margin."],
        "chaotic-market": ["Prices are lurching. The forecast is a rumour.", "The spot market is improvising. Hedge, or pray."],
        trip:             ["A plant just tripped. The city noticed faster than you did.", "Unit offline. Unscheduled. Unhelpful."],
        strain:           ["That plant is straining. You have seconds, not minutes.", "Telegraphed failure in progress. Decide."],
        brownout:         ["Load exceeds supply. Shed something or answer for the dark.", "The grid is short. The slums go first unless you say otherwise."],
        milestone:        ["Demand record. The city grows; so does the scrutiny.", "New peak served. The board will expect it again."],
        calm:             ["Nominal. Enjoy it. It is temporary.", "All green. Suspiciously so."],
      },
      // the overlord's quarter-end verdict voice — never a thank-you. Keyed to grade bands; the
      // selector reads the Verdict fields (grade, serveRate, cleanScore). overlordNote replaces
      // the Phase 6 stub string (verdict.verdictNote) — pure, cosmetic, grade-driven.
      overlord: {
        dark:     ["The city noticed the dark. So did we. Keep the lights on or answer for it.", "You let the basin go black. The board does not forget outages."],
        praise:   ["Adequate. The board is, grudgingly, not displeased. Your rate improves.", "A competent quarter. We will pretend not to be surprised."],
        tolerate: ["Within tolerance. Do not mistake tolerance for approval.", "Acceptable. Barely. The rate holds."],
        dirty:    ["Your smokestacks embarrass us. The fine is for the optics.", "The emissions figures are a liability. We bill you for the exposure."],
        fail:     ["Underwhelming. The rate is cut. Perform, or be replaced by someone who will.", "A poor quarter. The squeeze is instructive. Learn from it."],
      },
    },
  },
  // ============================================================
  // v5.1 REBALANCE knobs (docs/plan-v5.1/). A separate sub-namespace so v5 knobs
  // stay put. Phase 1 owns `demand`; later phases add their own keys here.
  // ============================================================
  v5_1: {
    // Phase 1 — the hybrid demand curve. Retires the old +6%/day compounding (which
    // doubled demand in ~12 days and outran every capacity lever). Demand now holds a
    // plannable per-QUARTER baseline that steps up at the rollover, with the live daily
    // S.peak wobbling around it by a bounded, season-dependent weather noise.
    demand: {
      stepFrac: 0.12,   // +12% baseline per quarter (was ≈1.06^22 ≈ +280%/quarter under daily compounding)
      yearScale: 0.0,   // optional EXTRA step growth per year past Y1 (0 = flat cadence; a long-arc dial)
      // ± daily swing of the live peak around the quarter baseline, by season (summer days swing hardest).
      noiseAmp: { winter: 0.06, spring: 0.04, summer: 0.08, autumn: 0.04, default: 0.05 },
    },
    // Phase 2 — the grid-stability HP bar and the fail-state. A reservoir that fills on a
    // shortfall (asymmetric by cause) and drains on served hours; topping out ends the run
    // into a roguelite restart. Numbers are PLACEHOLDER balance data — the tests pin the
    // RELATIONSHIPS (fillCapacity > fillDispatch > drainRate; verdict heals and damages),
    // not these values; the real curve is settled by tools/balance.mjs + a UI prototype.
    // (Re-seating strainRate/strainRecover/bankruptcyGrace against this model is likewise
    // deferred to that balance pass, per the v5.1 "exact tuning numbers" decision.)
    stability: {
      max: 100,            // reservoir ceiling; hp ≥ max ends the run
      epsilon: 0.5,        // a shortfall under this MW counts as "served" (float slack)
      fillCapacity: 8,     // hp/game-hour on a TRUE capacity shortfall (every lever exhausted)
      fillDispatch: 3,     // hp/game-hour on a dispatch shortfall (a move remained) — < fillCapacity
      drainRate: 1.5,      // hp/game-hour recovered on a served hour — < fillCapacity (flicker nets up)
      verdictPar: 0.5,     // the 0..1 verdict grade that neither heals nor harms (par)
      verdictHeal: 25,     // max hp healed by a perfect quarter (scaled by grade above par)
      verdictDamage: 15,   // max hp damage from a zero-grade quarter (scaled by grade below par)
      verdictFillBump: 0.5,// max added to fillMult by a zero-grade quarter (accelerates next quarter)
    },
    // Phase 3 — per-plant UPGRADE LADDERS + the contractor queue. Reworks Phase 7's instant
    // cash specialization into FOUR parallel 9-tier ladders (one per KPI axis), applied on a
    // rolling contractor line (its own labor, never the maintenance crew pool). u.tiers[axis]
    // (0..9) drives u.caps[axis] via axisTierValue; each tier ~+tierStep of base (nine tiers →
    // ~2.6× base), with a GEOMETRIC cost so you can't rush to max. Numbers are balance data —
    // the tests pin "nine tiers, geometric cost, ~2–3× at max" + the lead time, not the figures.
    upgrade: {
      base:       100,      // tier 0 cap (a fresh plant's KPI base) — matches CFG.v5.upgrade.base
      tierMax:    9,        // nine cash tiers per axis; tier 9 is the cap
      tierStep:   0.18,     // each tier adds this fraction of base to the axis cap → tier 9 ≈ 2.6× base
      costBase:   20000,    // $ for the first tier (tier 0 → 1) …
      costGrowth: 1.55,     // … geometric steepening per tier (money + time gate, not a single buy)
      leadDays:   6,        // contractor lead time per upgrade job (rolling; lands mid-quarter)
    },
    // Phase 4 — ROLLING MAINTENANCE. Reverses Phase 4-v5's quarter-end-only batch: a maint job
    // is queued any day, draws a crew from the pool (the maintenance-only limiter), resolves on a
    // rolling `daysLeft`, and on completion restores the worked axis toward u.caps (which Phase 3
    // upgrades raise — maint fights decay, upgrades raise the ceiling). The plant is OFFLINE while
    // in the shop (the teeth), but for days now, not a whole quarter. restore/cost scale with how
    // far the axis decayed below its cap. Balance numbers; crew effectiveness reuses CFG.v5.crews.
    maint: {
      leadDays:    3,       // base rolling duration of a maint job …
      severityDays: 4,      // … + up to this many more, scaling with the axis's deficit vs its cap
      costBase:    2500,    // $ floor to queue a restore …
      costPerPoint: 130,    // … + this per KPI point of deficit (a near-dead plant costs more)
      // base KPI points restored by a level-1 ON-TRADE crew, per axis (level + off-trade scale it).
      restore: { reliability: 48, efficiency: 42, output: 42, flexibility: 38 },
    },
    // Phase 5 — the DAILY BRIEF interrupt thresholds. The brief is blocking-but-skippable:
    // once the queues are set it auto-advances through quiet days and only yanks the player
    // back on an exception. These are the exception gates (shouldInterrupt). This is the most
    // FEEL-dependent dial in v5.1 — too twitchy and it's 22 pauses a quarter, too lax and the
    // player sleeps through a crisis; PLACEHOLDER, to be tuned against a prototype by play.
    brief: {
      headroomPct: 0.10,     // interrupt when (capacity − peak)/peak falls below this (getting tight)
      cashFloor:   20000,    // interrupt when cash drops under this
      stabilityDanger: 0.6,  // interrupt when the stability bar is ≥ this fraction of its ceiling
    },
  },
};

// Cost to service a unit back to 100% condition: scales with how worn it is and
// how big it is, plus a floor. Proactive service on a healthy plant is cheap — but
// let it fall below CFG.tripOverhaul and it's a wreck: a full OVERHAUL at a steep
// premium (overhaulCostMult). The cliff is the point — service before 50%.
export function serviceCost(u){
  const cond = u.condition ?? 100;
  const damage = Math.max(0, 1 - cond / 100);
  let cost = CFG.repairPerMW * u.cap * damage + CFG.repairMin;
  if (cond < CFG.tripOverhaul) cost *= CFG.overhaulCostMult;
  return Math.round(cost);
}

// Game-hours a service takes: a routine service is CFG.serviceTime; an overhaul
// (condition below CFG.tripOverhaul) keeps the plant offline overhaulTimeMult× longer.
export function serviceTimeFor(u){
  return CFG.serviceTime * ((u.condition ?? 100) < CFG.tripOverhaul ? CFG.overhaulTimeMult : 1);
}

// Salvage cash recovered by decommissioning a unit — a fraction of its notional
// build value (scaled by current capacity, so upgraded plants salvage higher).
export const SALVAGE_FRAC = 0.3;
export function salvageValue(u){
  const b = BUILD[u.tech];
  const perMw = b ? b.cost / b.mw : 800; // fallback $/MW for techs not in the build catalogue
  return Math.round(SALVAGE_FRAC * perMw * u.cap);
}

// ---- build catalogue: spend in-run cash to add a block of capacity ----
// cost is a live-tuned capital cost ($); mw is the block size. Batteries are now
// buildable (the sim tracks any number of storage units); `hours` sets a built
// battery's energy depth (MWh = mw × hours), matching the starting 2h battery.
export const BUILD = {
  solar:   { label:"Solar farm", mw:60,  cost:50000 },
  wind:    { label:"Wind",       mw:50,  cost:55000 },
  battery: { label:"Battery",    mw:60,  cost:60000, hours:2 },
  nuclear: { label:"Nuclear",    mw:100, cost:220000 },
  coal:    { label:"Coal",       mw:60,  cost:70000 },
  peaker:  { label:"Gas (fast)", mw:55,  cost:45000 }, // builds dial-able fast gas (the former peaker)
  // ---- v3 advanced generation: buildable only once their research unlocks them ----
  smr:      { label:"SMR",       mw:90,  cost:240000 },
  geo:      { label:"Geothermal",mw:80,  cost:180000 },
  ccs_coal: { label:"Coal + CCS",mw:80,  cost:150000 },
  ccs_gas:  { label:"Gas + CCS", mw:90,  cost:130000 },
};
export const BUILD_ORDER = ["solar", "wind", "battery", "coal", "peaker", "nuclear", "smr", "geo", "ccs_coal", "ccs_gas"];

// Build gates: a tech here can only be built once the named research mod is set
// (see research.computeResearchMods). Techs absent from this map are always
// buildable. CCS (coal & gas) shares one unlock.
export const BUILD_GATE = {
  smr:      "smrUnlocked",
  geo:      "geoUnlocked",
  ccs_coal: "ccsUnlocked",
  ccs_gas:  "ccsUnlocked",
};

// Per-tech firm-plant operating params for units built mid-run (spin $/MW/h,
// per-second trip rate, and the [min,max] game-hours to recover from a trip).
const FIRM_PARAMS = {
  nuclear:  { spin:2, fail:0.0020, recover:[5, 9] },
  smr:      { spin:2, fail:0.0020, recover:[5, 9] },
  geo:      { spin:3, fail:0.0025, recover:[3, 6] },
  coal:     { spin:4, fail:0.0045, recover:[1.5, 3] },
  ccs_coal: { spin:4, fail:0.0045, recover:[1.5, 3] },
  ccs_gas:  { spin:4, fail:0.0040, recover:[1.5, 3] },
};

// v5 Phase 7: the v4 Mk I→II→III upgrade ladder is RETIRED. Progression is now per-axis
// SPECIALIZATION — spend cash to raise a plant's four KPI attainable-maxes along a
// steepening curve (progression.js: upgradeCost / applyUpgrade), RP to lift the hard
// ceilings (raiseCeiling), ⚡ for perks + late-game automation. The four axes subsume the
// old ladder's effects: Output → capacity (effectiveMax), Reliability → fewer trips,
// Efficiency → cheaper fuel, Flexibility → faster ramp. Tuning lives in CFG.v5.upgrade.

// ---- plant naming ----
// Real grids name their iron after the place it stands on, not "Coal Plant A".
// Each name is `<place> <fuel>` so it reads like a real station (Blackmoor Coal,
// Fellcrest Wind) while still telegraphing the tech at a glance. The fuel word is
// the clarifier; the fleet table's sub-line carries kind + MW separately. Pure
// data — a fuller named-territory scheme is the v5 "Identity" work.
const FUEL_WORD = {
  nuclear:"Nuclear", coal:"Coal", solar:"Solar", wind:"Wind", peaker:"Gas",
  battery:"Battery", smr:"SMR", geo:"Geothermal", ccs_coal:"Coal CCS", ccs_gas:"Gas CCS",
};
// Place-name pools for units built mid-run. Indexed by the per-tech build count,
// so the first new coal plant is "Sootbank Coal", the second "Emberly Coal", … .
// Starting-fleet names are set directly in makeFleet() and don't draw from here,
// so there's no collision. Wraps with a numeral only in very long runs.
const PLACE_POOL = {
  nuclear: ["Dunmoor","Severn Reach","Kesterling","Thornwick"],
  coal:    ["Sootbank","Emberly","Colliers Rise","Dunsmere","Blackdyke","Furnace Hill"],
  solar:   ["Harbrook","Oakfield","Sunderley","Marsh End","Pennington","Goldacre"],
  wind:    ["Stormholt","Gale Point","Hollowfell","Ravensmoor","Netherby","Cragwind"],
  peaker:  ["Sparkbridge","Quickfell","Flintlock","Dormer Gate","Tindall","Risewood"],
  battery: ["Fenwick","Hollowmere","Tanfield","Larkstone","Brindle","Saltmarsh"],
  smr:     ["Aldermint","Beacon Hill","Quellstone","Vale End"],
  geo:     ["Cauldwell","Hotspring Vale","Ironvent","Deepcombe"],
  ccs_coal:["Carbonmoor","Scrubbdale","Greycap","Ashworth"],
  ccs_gas: ["Cleanburn","Methermere","Vaporton","Blueflame"],
};
// Name for the n-th (1-based) mid-run build of a tech: `<place> <fuel>`, with a
// numeral suffix if the run outlasts the pool. v5 Phase 9: the `era` param draws
// the place pool from the era-specific CFG.v5.world.names[era] table when one
// exists for the tech; omitted or "rust" (and any era/tech with no override)
// falls back to the shipped PLACE_POOL, so every shipped name still appears and
// the pre-Phase-9 signature keeps working. The fuel word never changes by era.
export function plantName(tech, n, era){
  const eraPool = era && era !== "rust" ? CFG.v5?.world?.names?.[era]?.[tech] : null;
  const pool = (eraPool && eraPool.length) ? eraPool : (PLACE_POOL[tech] || PLACE_POOL.coal);
  const fuel = FUEL_WORD[tech] || (BUILD[tech]?.label ?? tech);
  const i = (n - 1) % pool.length;
  const wrap = Math.floor((n - 1) / pool.length);
  return `${pool[i]} ${fuel}${wrap ? " " + (wrap + 1) : ""}`;
}

// Phase 4: crew call-signs — operator surnames for the maintenance pool, so a crew
// reads as a person ("Okonkwo · Reliability"), never "Crew 3". Wraps with a numeral
// only past the pool. Matches the fleet's no-generic-placeholder naming taste.
const CREW_NAMES = [
  "Okonkwo","Vance","Reyes","Halloran","Novak","Ferreira","Driscoll","Sato",
  "Abara","Quill","Mensah","Dray","Lindqvist","Torres","Ashby","Ng",
];
export function crewName(n){
  const i = (n - 1) % CREW_NAMES.length, wrap = Math.floor((n - 1) / CREW_NAMES.length);
  return `${CREW_NAMES[i]}${wrap ? " " + (wrap + 1) : ""}`;
}

// ---- fleet definition ----
// kind: firm (dial-able baseload thermal), gas (dial-able FAST thermal — the former
// peaker, retired as a kind in v5 Phase 2), renew (variable), battery.
// `tech` maps each unit onto an engine resource; `mc` mirrors TECH so the cards
// and the dispatchHour() clearing agree on one set of economics. Every dispatchable
// unit carries its Core+ dials (defaultDials); baseload commits by default, gas
// sits in reserve, so a fresh fleet runs like v4 until the player dials it.
export function makeFleet() {
  const g = CFG.v5.gas;
  const fleet = [
    { id:"nuc",  name:"Harrowgate Nuclear", kind:"firm",   tech:"nuclear", cap:250, mc:TECH.nuclear.mc, spin:2,  tier:1, condition:100, status:"online", ctrl:false, fail:0.0020, recover:[5,9],  key:null },
    { id:"colA", name:"Blackmoor Coal",     kind:"firm",   tech:"coal",    cap:180, mc:TECH.coal.mc,    spin:4,  tier:1, condition:100, status:"online", ctrl:false, fail:0.0045, recover:[1.5,3], key:null },
    { id:"colB", name:"Cinderhope Coal",    kind:"firm",   tech:"coal",    cap:140, mc:TECH.coal.mc,    spin:4,  tier:1, condition:100, status:"online", ctrl:false, fail:0.0045, recover:[1.5,3], key:null },
    { id:"sol",  name:"Meadowbank Solar",   kind:"renew",  tech:"solar",   cap:220, mc:TECH.solar.mc,   tier:1, status:"online", ctrl:false, cf:SOLAR_CF, key:null },
    { id:"wnd",  name:"Fellcrest Wind",     kind:"renew",  tech:"wind",    cap:160, mc:TECH.wind.mc,    tier:1, status:"online", ctrl:false, cf:WIND_CF,  key:null },
    { id:"pk1",  name:"Ashgate Gas",        kind:"gas",    tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:g.spin, tier:1, condition:100, status:"off", ctrl:true, fail:g.fail, recover:[...g.recover], startTime:g.startTime, key:"1" },
    { id:"pk2",  name:"Kilnbrook Gas",      kind:"gas",    tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:g.spin, tier:1, condition:100, status:"off", ctrl:true, fail:g.fail, recover:[...g.recover], startTime:g.startTime, key:"2" },
    { id:"pk3",  name:"Forgewell Gas",      kind:"gas",    tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:g.spin, tier:1, condition:100, status:"off", ctrl:true, fail:g.fail, recover:[...g.recover], startTime:g.startTime, key:"3" },
    { id:"bat",  name:"Weircross Battery",  kind:"battery",tech:"battery", cap:120, mc:TECH.battery.mc, tier:1, status:"off",    ctrl:true,  energy:240, maxEnergy:240, key:"B" },
  ];
  for (const u of fleet){
    u.dials = defaultDials(u);                       // Phase 2: Core+ dials on every unit
    if (u.condition != null){
      u.kpis = freshKPIs();                           // Phase 3: four KPI axes on mechanical plants
      u.caps = freshCaps();                           // Phase 7: per-axis attainable-max (maint restore target)
      u.tiers = freshTiers();                         // v5.1 Phase 3: per-axis upgrade tier (0..9) drives caps
      u.prevDials = dialSnapshot(u.dials);            // Phase 3: baseline for cycle (ramp/start) detection
    }
  }
  return fleet;
}

// A minimal dials snapshot the sim diffs each tick to spot ramps/starts (cycleCost).
export function dialSnapshot(d){ return { commit: d.commit, bandMin: d.bandMin, bandMax: d.bandMax }; }

// Phase 7 / v5.1 Phase 3: a fresh plant's per-axis attainable-max — the ceiling maintenance
// restores toward. Every axis starts at base (= tier 0). The caps are now DERIVED from
// u.tiers via progression.axisTierValue once upgrades land; freshCaps seeds the tier-0 value.
export function freshCaps(){ const b = CFG.v5.upgrade.base; return { reliability: b, efficiency: b, output: b, flexibility: b }; }
// v5.1 Phase 3: a fresh plant's per-axis UPGRADE TIER (0..9). Contractor jobs raise a tier,
// which recomputes the matching cap. Every axis starts untiered.
export function freshTiers(){ return { reliability: 0, efficiency: 0, output: 0, flexibility: 0 }; }

// Factory for a unit added mid-run via the build catalogue. `n` numbers the
// unit for display; `seq` makes its id unique. v5 Phase 9: `era` (from world.eraOf)
// steers the place-name pool so late-era builds read as New Veridia, not the rust
// district; omitted → shipped names (the pre-Phase-9 behaviour).
export function makeUnit(tech, n, seq, era){
  const b = BUILD[tech];
  const kind = (tech === "solar" || tech === "wind") ? "renew"
             : tech === "peaker" ? "gas"       // v5 Phase 2: "peaker" builds dial-able fast gas
             : tech === "battery" ? "battery" : "firm";
  const u = { id:`${tech}-${seq}`, name:plantName(tech, n, era), kind, tech, cap:b.mw, mc:TECH[tech].mc, tier:1,
              status: (kind === "gas" || kind === "battery") ? "off" : "online",
              ctrl: (kind === "gas" || kind === "battery"), key:null };
  if (kind === "firm" || kind === "gas"){ u.condition = 100; u.ageHours = 0; u.kpis = freshKPIs(); u.caps = freshCaps(); u.tiers = freshTiers(); } // mechanical plants wear (Phase 3 KPIs) & upgrade (v5.1 P3 tiers→caps)
  if (kind === "renew") u.cf = tech === "solar" ? SOLAR_CF : WIND_CF;
  if (kind === "battery"){ u.maxEnergy = u.energy = Math.round(b.mw * (b.hours || 2)); }
  if (kind === "firm"){ const p = FIRM_PARAMS[tech] || FIRM_PARAMS.coal; u.spin = p.spin; u.fail = p.fail; u.recover = [...p.recover]; }
  if (kind === "gas"){ const g = CFG.v5.gas; u.spin = g.spin; u.fail = g.fail; u.recover = [...g.recover]; u.startTime = g.startTime; }
  u.dials = defaultDials(u); // Phase 2: Core+ dials
  if (u.kpis) u.prevDials = dialSnapshot(u.dials); // Phase 3: cycle-detection baseline
  return u;
}
