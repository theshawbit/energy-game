// Unit tests for v5 Phase 4 — the soft-specialized, levelling crew pool
// (src/live/crews.js). A crew is best at one trade but fungible across all; it levels
// through use; ⚡ promotes standouts; the roster ceiling and wages bite. Run: `npm test`.
import { makeCrew, tradeModifier, gainXP, canLevelUp, promote, hireCrew, wageBill, TRADES } from "../src/live/crews.js";
import { axisRestore } from "../src/live/maint.js";
import { CFG } from "../src/live/config.js";

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
}
const cc = CFG.v5.crews;

// 6) On-trade beats off-trade, but off-trade is never blocked (fungible pool).
{
  const onCrew = makeCrew("reliability", 1);   // overhaul restores reliability → on-trade
  const offCrew = makeCrew("efficiency", 2);   // … → off-trade
  const on = axisRestore("reliability", onCrew), off = axisRestore("reliability", offCrew);
  check("tradeModifier is 1.0 on-trade, the penalty off-trade (never 0)",
    tradeModifier(onCrew, "reliability") === 1 && tradeModifier(onCrew, "efficiency") === cc.offTrade && cc.offTrade > 0);
  check("a crew restores more on its trade than off it, and off-trade still > 0", on > off && off > 0,
    `on ${on.toFixed(1)} vs off ${off.toFixed(1)}`);
}

// 7) Crews level passively through use — crossing the XP curve raises the level + edge.
{
  const crew = makeCrew("output", 3);
  const before = axisRestore("output", crew); // level 1 on-trade (uprate → output)
  gainXP(crew, cc.xpCurve);                        // exactly one level's worth of work
  check("banking a full XP curve raises the crew's level", crew.level === 2, `Lv ${crew.level}`);
  const after = axisRestore("output", crew);
  check("a higher level sharpens the on-trade edge", after > before, `${before.toFixed(1)} → ${after.toFixed(1)}`);
  // XP alone can't climb past the fresh ceiling …
  gainXP(crew, cc.xpCurve * 10);
  check("passive levelling is capped at the crew's level ceiling", crew.level === crew.levelCap && crew.levelCap === cc.levelCapBase,
    `Lv ${crew.level}/${crew.levelCap}`);
}

// 8) ⚡ promotes a standout — spends the configured ⚡, raises the ceiling + level.
{
  const S = { crews: [makeCrew("flexibility", 1)], zap: 0 };
  check("promotion refused when ⚡ is short", promote(S, "crew1") === false && S.crews[0].levelCap === cc.levelCapBase);
  S.zap = cc.promoteCost;
  const capBefore = S.crews[0].levelCap;
  const ok = promote(S, "crew1");
  check("⚡ promotion spends the cred and raises the level ceiling",
    ok && S.zap === 0 && S.crews[0].levelCap === capBefore + cc.promoteCapBump,
    `cap ${capBefore} → ${S.crews[0].levelCap}`);
  check("canLevelUp is false once a crew is at the hard max level",
    !canLevelUp({ ...S.crews[0], levelCap: cc.maxLevel }));
}

// 9) Roster ceiling gates hiring; within it, cash buys a crew at its trade.
{
  const S = { crews: [], cash: 1e7, rosterCap: cc.baseRoster, crewSeq: 0 };
  while (S.crews.length < S.rosterCap) hireCrew(S, "reliability");
  const cashAtCeiling = S.cash;
  check("hiring is refused at the roster ceiling (no crew, no charge)",
    S.crews.length === cc.baseRoster && hireCrew(S, "output") === null && S.cash === cashAtCeiling,
    `${S.crews.length}/${S.rosterCap}`);
  const S2 = { crews: [], cash: cc.hireCost, rosterCap: 3, crewSeq: 0 };
  const hired = hireCrew(S2, "efficiency");
  check("within the ceiling, hiring deducts cash and adds a crew at its trade",
    !!hired && hired.trade === "efficiency" && S2.cash === 0 && S2.crews.length === 1);
  check("hiring is refused without the cash", hireCrew(S2, "output") === null && S2.crews.length === 1);
  check("an invalid trade is refused", hireCrew({ crews: [], cash: 1e7, rosterCap: 4 }, "magic") === null);
}

// 10) Wages are a standing cost — N crews × the per-quarter wage.
{
  const S = { crews: [makeCrew("reliability", 1), makeCrew("output", 2), makeCrew("efficiency", 3)] };
  check("wageBill is N × wage", wageBill(S) === 3 * cc.wage, `$${wageBill(S)} for 3 crews`);
  check("the four trades are the four KPI axes", TRADES.length === 4 && TRADES.includes("reliability") && TRADES.includes("flexibility"));
}

console.log(failed === 0 ? "\nAll crews tests passed." : `\n${failed} crews test(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
