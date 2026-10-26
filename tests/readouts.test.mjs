// Unit tests for the v4.2 "Control Room" (CR-2) derived operator readouts.
// No DOM. Pure functions of state `S`; also checks that step() surfaces the
// read-only live fields (served / contractRevenue / flowRate). Run: `npm test`.
import {
  PEAK_HOUR, armableOf, potentialCapacity, onlineHeadroom, armableHeadroom,
  timeToPeak, hedgedShare, exposedMW, blendedPrice
} from "../src/live/readouts.js";
import { createGame, step } from "../src/live/sim.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// A hand-built fleet so capacity math is deterministic (no weather RNG).
const fleet = [
  { kind: "firm",    status: "online",  cap: 250 },
  { kind: "peaker",  status: "off",     cap: 100 }, // cold reserve — armable
  { kind: "battery", status: "off",     cap: 120, energy: 200 }, // charged — armable
  { kind: "peaker",  status: "tripped", cap: 80 },  // tripped — NOT armable
];
const S = { fleet, demand: 250, capacity: 300, rmods: {}, weather: { sun: 1, wind: 1 } };

// 1) peak hour is derived from the demand curve (evening ramp)
check("PEAK_HOUR is 18 (curve max)", PEAK_HOUR === 18, String(PEAK_HOUR));

// 2) armableOf per kind
check("firm counts its full cap", armableOf(S, fleet[0]) === 250);
check("cold peaker reserve is armable at cap", armableOf(S, fleet[1]) === 100);
check("charged battery is armable at cap", armableOf(S, fleet[2]) === 120);
check("tripped unit is NOT armable", armableOf(S, fleet[3]) === 0);
check("empty battery is NOT armable", armableOf(S, { kind: "battery", status: "off", cap: 120, energy: 0 }) === 0);

// 3) potential / headroom
check("potentialCapacity sums armable only", potentialCapacity(S) === 470, String(potentialCapacity(S)));
check("onlineHeadroom = capacity − demand", onlineHeadroom(S) === 50);
check("armableHeadroom = potential − demand", armableHeadroom(S) === 220);
check("deficit shows as negative online headroom", onlineHeadroom({ capacity: 180, demand: 250 }) === -70);

// 4) renewable armable follows weather-limited output, not rated cap
const sun = { kind: "renew", tech: "solar", cap: 100, cf: [1, 1, 1] };
check("renewable armable = current output (weather-limited)",
  near(armableOf({ weather: { sun: 0.5, wind: 1 }, t: 0, mmods: {} }, sun), 50),
  String(armableOf({ weather: { sun: 0.5, wind: 1 }, t: 0, mmods: {} }, sun)));

// 5) time-to-peak countdown (game-hours until the next hour-18 peak)
check("time-to-peak from 06:00 is 12h", timeToPeak({ t: 6 }) === 12);
check("time-to-peak at the peak is 0", timeToPeak({ t: 18 }) === 0);
check("time-to-peak wraps past the peak", timeToPeak({ t: 20 }) === 22);

// 6) hedged share of demand (capped at 1, safe at zero demand)
check("hedgedShare = contracted / demand", near(hedgedShare({ contractedMW: 120, demand: 200 }), 0.6));
check("hedgedShare caps at 1 when over-contracted", hedgedShare({ contractedMW: 300, demand: 200 }) === 1);
check("hedgedShare is 0 with no demand", hedgedShare({ contractedMW: 50, demand: 0 }) === 0);

// 7) spot exposure + blended price
check("exposedMW = served − contracted", exposedMW({ served: 200, contractedMW: 120 }) === 80);
check("exposedMW never negative", exposedMW({ served: 100, contractedMW: 150 }) === 0);
// 120 MW locked at $40 ($4800/h) + 80 MW residual at $60 ($4800/h) over 200 MW = $48/MWh
check("blendedPrice mixes contract + spot",
  near(blendedPrice({ served: 200, contractedMW: 120, contractRevenue: 4800, spot: 60 }), 48),
  String(blendedPrice({ served: 200, contractedMW: 120, contractRevenue: 4800, spot: 60 })));
check("blendedPrice falls back to spot when nothing served",
  blendedPrice({ served: 0, contractedMW: 0, contractRevenue: 0, spot: 72 }) === 72);

// 8) step() surfaces the read-only live fields (integration)
const G = createGame();
for (let i = 0; i < 6; i++) step(G, 1);
check("step() sets S.served (load delivered)", G.served > 0, String(Math.round(G.served)));
check("step() sets a finite S.flowRate", Number.isFinite(G.flowRate), String(Math.round(G.flowRate)));
check("step() sets S.contractRevenue (≥0)", G.contractRevenue >= 0, String(Math.round(G.contractRevenue)));
check("blendedPrice on a live game is a finite $/MWh", Number.isFinite(blendedPrice(G)), String(Math.round(blendedPrice(G))));

console.log(failed === 0 ? "\nAll readouts tests passed." : `\n${failed} readouts test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
