// ============================================================
// LIVE RENDER — paints the DOM/canvas from state `S`. Pure view: never
// mutates S. Player actions are delegated to callbacks passed in from main.js
// (onToggle, onRestart), so this file imports no action logic.
// ============================================================
import { unitOutput, clamp } from "./sim.js";
import { quarterLabel } from "./calendar.js";
import { applyDials } from "./dispatch.js";
import { TASKS, axisRestore, maintCost } from "./maint.js";
import { TRADES, tradeModifier } from "./crews.js";
import { BUILDABLES, forecastDemand, concurrencySlip } from "./construct.js";
import { CFG, BUILD_ORDER, BUILD_GATE, salvageValue } from "./config.js";
import { AXES, upgradeCost, canUpgrade, axisTierValue, upgradeTierMax, PERKS, isAutomationUnlocked, automationTier, canUnlockPerk } from "./progression.js";
import { contractorLoad } from "./contractor.js";
import { briefSummary } from "./brief.js"; // v5.1 Phase 5: the daily brief data
import { loadShedTiers, canDemandRespond } from "./crisis.js";
import { eraOf, cassLine } from "./world.js"; // v5 Phase 9: identity arc + C.A.S.S. voice (cosmetic)
import { SKILLS, skillCost, RESEARCH_UNLOCKS, ECONOMY_UNLOCKS, SCORE_TRACKS, scoreTracks } from "./meta.js";
import { RESEARCH, canResearch } from "./research.js";
import { mutatorById } from "./mutators.js";
import { makeFleetComparator, compareNeedsAttention } from "./fleetsort.js";
import { marginalCost } from "../engine.js";
import { dailyBaseline } from "./market.js";
import { contractPrice, expectedOutput, creditRating, gradeFor, debtCapacity } from "./finance.js";
import { potentialCapacity, onlineHeadroom, armableHeadroom, timeToPeak, hedgedShare, exposedMW, blendedPrice } from "./readouts.js";

const $ = id => document.getElementById(id);
// Theme tokens are static (single committed dark theme), so read each once and
// memoize — render() runs every frame and getComputedStyle forces style resolution.
const _cssCache = {};
const css = v => _cssCache[v] !== undefined ? _cssCache[v]
  : (_cssCache[v] = getComputedStyle(document.documentElement).getPropertyValue(v).trim());
function money(x){ const a = Math.abs(x), s = x < 0 ? "−" : ""; if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + "M"; if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(0) + "k"; return s + "$" + a.toFixed(0); }
function clock(t){ const h = Math.floor(t), m = Math.floor((t - h) * 60); return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"); }

// v5 Phase 3: the four KPI axes replace the single condition bar. Rendered as a
// compact 2×2 cluster of labelled micro-bars (R·E·O·F), each banded by its own value.
const KPI_AXES = [["reliability", "R"], ["efficiency", "E"], ["output", "O"], ["flexibility", "F"]];
const kpiBand = v => v > 60 ? "ok" : v > 30 ? "warn" : "bad";
const kpiColor = band => css(band === "ok" ? "--good" : band === "warn" ? "--warn" : "--bad");
const kpiTitle = (k, v) => `${k[0].toUpperCase()}${k.slice(1)} ${v}%`;
// Static cluster (Manage view, string-rendered each open): fills painted inline now.
function kpiClusterStatic(kpis){
  return `<span class="kpis">` + KPI_AXES.map(([k, l]) => {
    const v = Math.round(kpis[k]);
    return `<span class="kq" title="${kpiTitle(k, v)}"><b>${l}</b><span class="kb"><i style="width:${v}%;background:${kpiColor(kpiBand(v))}"></i></span></span>`;
  }).join("") + `</span>`;
}
// Live cluster (fleet rail): empty bars + a data-k hook per axis, painted by updateUnits.
function kpiClusterLive(){
  return `<span class="kpis">` + KPI_AXES.map(([k, l]) =>
    `<span class="kq" data-kq="${k}"><b>${l}</b><span class="kb"><i data-k="${k}"></i></span></span>`
  ).join("") + `</span>`;
}

// v4.2 CR-2: status-cluster state. Last demand sample for the rising/easing trend.
let _prevDemand = null;
// v4.2.3: the readable numbers refresh on a calm ~5Hz cadence, decoupled from the
// render frame rate. With net-load volatility the raw values move every frame (60Hz),
// which strobes the tiles into an unreadable blur — but the *chart*, the urgency
// vignette/shake, the alarm pills and the sparklines stay fully live (they're meant
// to move). So volatility keeps its teeth where it belongs and the instruments read.
const READOUT_MS = 200;
let _lastReadout = 0;
// v4.2 CR-4: annunciator event log — a short rolling feed of timestamped events,
// severity-colored. Built in the render layer from the sim's one-line ticker (no
// sim change): each new ticker message is captured once with the game clock.
const _log = [];
let _lastTicker = null;
const ANN_MAX = 5;
function annSeverity(msg){
  if (msg.startsWith("✓")) return "ok";
  if (msg.startsWith("⚠")) return "alarm";
  return "advisory";
}
// Light a backlit lamp a given status color (with a soft glow), or dim it when faint.
function setLamp(el, color){
  if (!el) return;
  const faint = color === css("--faint");
  el.style.background = color;
  el.style.boxShadow = faint ? "none" : `0 0 7px ${color}`;
  el.style.opacity = faint ? ".5" : "1";
}

// v5.1 Phase 7: the top-strip grid-stability HP gauge. Reads S.stability (0% pristine →
// 100% collapse). Width + colour ramp track the fill; a data-state attr carries fill vs
// drain vs danger for the CSS pulse; the label names the live mode. Pure patch (no teardown).
export function renderStabilityBar(S){
  const st = S.stability; const bar = $("hpbar"); if (!st || !bar) return;
  const pct = clamp(Math.round((st.hp / st.max) * 100), 0, 100);
  const fill = $("hp-fill"), label = $("hp-label");
  const danger = pct >= 66, warn = pct >= 33;
  const state = st.fillPaused
    ? (st.hp > 0 ? "recovering" : "stable")
    : (st.lastShortfall === "capacity" ? "collapsing" : "straining");
  if (fill){
    fill.style.width = pct + "%";
    fill.style.background = danger ? css("--bad") : warn ? css("--warn") : css("--good");
  }
  bar.dataset.state = state;
  bar.setAttribute("aria-valuenow", String(pct));
  if (label){
    const human = state === "collapsing" ? "COLLAPSING" : state;
    label.textContent = `${pct}% · ${human}`;
  }
}

export function render(S){
  const now = performance.now();
  const tick = now - _lastReadout >= READOUT_MS; // ~5Hz readable cadence
  if (tick){
  _lastReadout = now;
  $("s-cal").textContent = quarterLabel(S); // v5: Year▸Quarter▸Day stamp
  $("s-clock").textContent = clock(S.t);
  $("s-cash").textContent = money(S.cash);
  $("s-cash").style.color = S.cash < 0 ? css("--bad") : css("--fg");
  // research points + live R&D funding rate (so the lever is legible without pausing)
  $("s-rp").childNodes[0].nodeValue = Math.floor(S.rp || 0) + " ";
  const funding = (S.rdFunding || 0) > 0;
  $("s-rdsub").textContent = funding ? `+${((S.rdFunding || 0) * CFG.rpPerDollar).toFixed(1)}/h` : "";
  $("s-rp").style.color = funding ? css("--accent") : css("--fg");
  $("s-price").textContent = "$" + Math.round(S.price);
  $("s-co2").textContent = Math.round(S.co2);
  $("s-co2").style.color = S.co2 < 100 ? css("--good") : S.co2 < 450 ? css("--warn") : css("--bad");
  $("s-carbon").textContent = "$" + Math.round(S.carbon);
  $("s-carbon").style.color = S.carbon > 0 ? css("--warn") : css("--faint");
  // v5.1 Phase 7: grid-stability HP bar in the top strip (was a text readout). Always visible,
  // colour-ramping as it fills toward collapse; reads filling vs recovering so the fail-state is
  // legible without the chart.
  renderStabilityBar(S);

  // ---- v4.2 CR-2: master status cluster ---------------------------------
  // DEMAND — level + which way it's moving this tick.
  $("s-demand").textContent = Math.round(S.demand);
  const dTrend = _prevDemand == null ? 0 : S.demand - _prevDemand;
  // deadband at ~1.5% of load so the volatile jitter reads "steady" and the label
  // only flips on a real directional move (the ramp, or a spike) — no flip-flopping.
  $("cl-demand-sub").textContent = Math.abs(dTrend) < Math.max(1, S.demand * 0.015) ? "steady"
    : (dTrend > 0 ? "▲ rising" : "▼ easing");
  _prevDemand = S.demand;

  // ONLINE — capacity now, headroom over demand, lamp by margin band.
  const margin = S.demand > 0 ? (S.capacity - S.demand) / S.demand * 100 : 0;
  const col = margin >= 15 ? css("--good") : margin >= 0 ? css("--warn") : css("--bad");
  $("s-capacity").textContent = Math.round(S.capacity);
  $("s-capacity").style.color = S.capacity >= S.demand ? css("--fg") : css("--bad");
  const head = onlineHeadroom(S);
  $("cl-headroom").textContent = (head >= 0 ? "+" : "−") + Math.round(Math.abs(head)) + " MW headroom";
  $("cl-headroom").style.color = col;
  setLamp($("cl-online-lamp"), col);

  // ARMABLE — ceiling if every reserve were armed, with a countdown to the peak.
  const pot = potentialCapacity(S);
  $("cl-armable").textContent = Math.round(pot);
  const ttp = timeToPeak(S);
  $("cl-topeak").textContent = ttp < 0.5 ? "AT PEAK" : "peak in " + clock(ttp);
  // amber nudge: peak is near, online margin is thin, and you still hold reserves to arm
  const armNudge = margin < 0 ? css("--bad")
    : (ttp <= 3 && margin < 15 && pot > S.capacity + 1 ? css("--warn") : css("--faint"));
  setLamp($("cl-armable-lamp"), armNudge);
  $("cl-topeak").style.color = armNudge === css("--faint") ? css("--muted") : armNudge;

  // RESERVE MARGIN — the dial.
  $("s-margin").textContent = (margin >= 0 ? "+" : "") + margin.toFixed(0) + "%";
  $("s-margin").style.color = col;
  const f = clamp((margin + 30) / 60, 0, 1);       // -30%..+30% across the sweep
  const rot = (f - 0.5) * 180;                      // -90° (left) .. +90° (right)
  const needle = $("cl-dial-needle");
  needle.setAttribute("transform", `rotate(${rot.toFixed(1)} 60 62)`);
  needle.style.stroke = col;

  // CASH — balance + live flow rate ($/h and /day) + financing standing.
  $("s-cash").textContent = money(S.cash);
  $("s-cash").style.color = S.cash < 0 ? css("--bad") : css("--fg");
  const flow = S.flowRate || 0;
  if (Math.abs(flow) < 1){ $("cl-flow").textContent = "flat"; $("cl-flow").style.color = css("--muted"); }
  else {
    const sign = flow > 0 ? "+" : "−", a = Math.abs(flow);
    $("cl-flow").textContent = `${sign}${money(a).slice(1)}/h · ${sign}${money(a * 24).slice(1)}/day`;
    $("cl-flow").style.color = flow > 0 ? css("--good") : css("--bad");
  }
  const debt = Math.round(S.debt || 0), fin = $("cl-fin");
  if (debt > 0){ fin.textContent = `debt ${money(debt)} · ${gradeFor(S.credit)} @ ${(creditRating(S.credit).rate * 100).toFixed(1)}%/d`; fin.style.color = css("--warn"); }
  else { fin.textContent = `credit ${gradeFor(S.credit)} · debt-free`; fin.style.color = css("--faint"); }

  // SPOT · P&L — spot now, how much of load is hedged, and the live exposure.
  const spot = Math.round(S.spot || 0);
  const spotCol = spot > CFG.spotBase * 1.5 ? css("--bad") : spot < CFG.spotBase * 0.7 ? css("--warn") : css("--good");
  $("cl-spot").textContent = "$" + spot;
  $("cl-spot").style.color = spotCol;
  const skill = S.rmods?.forecastSkill ?? 0;
  $("cl-spot-unit").textContent = skill > 0 ? `/MWh · nxt ~$${Math.round(S.spotForecast || 0)}` : "/MWh";
  const hShare = Math.round(hedgedShare(S) * 100);
  $("cl-hedge").textContent = (S.contractedMW || 0) > 0.5 ? `${hShare}% hedged` : "spot only";
  $("cl-hedge").style.color = (S.contractedMW || 0) > 0.5 ? css("--good") : css("--muted");
  const exp = Math.round(exposedMW(S)), blend = Math.round(blendedPrice(S));
  $("cl-exposure").textContent = (S.served || 0) > 0.5 ? `${exp} MW at spot · blend $${blend}` : " ";

  // Capacity pledge — only visible under an obligation.
  const ob = S.capacityObligation, pledge = $("cl-pledge");
  if (ob){ pledge.style.display = ""; $("cl-pledge-v").textContent = `${Math.round(ob.reserveMW)} MW`; $("cl-pledge-sub").textContent = `${ob.daysLeft}d left${ob.calledToday ? " · called" : ""}`; }
  else pledge.style.display = "none";
  } // end throttled readouts (~5Hz)

  // ---- always live, every frame ----
  // reserve-margin urgency: the vignette + shake must react instantly, not on the
  // readout cadence — a brownout can't wait 200ms to show. v5.3 Phase 3: intensity now
  // folds onto the ONE trouble-meter (the grid-stability reservoir fraction) — the deleted
  // S.strain scalar used to drive it; a fuller reservoir = a darker vignette.
  const stab = S.stability, stabFrac = stab && stab.max > 0 ? stab.hp / stab.max : 0;
  $("vignette").style.opacity = S.over ? "1" : (S.brownout ? clamp(0.25 + stabFrac * 0.7, 0, 0.95).toFixed(2) : "0");
  $("shakeTarget").classList.toggle("shake", S.brownout && !S.over && stabFrac > 0.35);

  // v4.2 CR-4: annunciator log. Capture each new ticker message once (with the
  // game clock + severity), newest on top, and flash the freshest row briefly.
  if (S.ticker && S.ticker !== _lastTicker){
    _log.unshift({ t: clock(S.t), msg: S.ticker, sev: annSeverity(S.ticker), fresh: true });
    for (let i = 1; i < _log.length; i++) _log[i].fresh = false;
    if (_log.length > ANN_MAX) _log.length = ANN_MAX;
    const tk = $("ticker");
    tk.innerHTML = _log.map(e =>
      `<div class="ann-row ann-${e.sev}${e.fresh ? " fresh" : ""}"><span class="ann-t">${e.t}</span><span class="ann-m">${e.msg}</span></div>`
    ).join("");
  }
  _lastTicker = S.ticker;

  updateUnits(S, tick);
  drawChart(S);

  // v5: the console speed control reads off the clock. Pause is a read-only hold
  // (clock.speed 0); the play area reads "held" while frozen. Fast-forward lights
  // its own button. (An auto-pause at the quarter-end beat also reads as held.)
  const speed = S.clock ? S.clock.speed : 1, paused = speed === 0;
  const pb = $("pauseBtn");
  pb.textContent = paused ? "Resume" : "Pause";
  pb.classList.toggle("on", paused);
  $("shakeTarget").classList.toggle("held", paused);
  const ff = $("ffBtn");
  if (ff){ const fast = speed === CFG.v5.fastSpeed; ff.textContent = fast ? "▶▶ Fast" : "▶ 1×"; ff.classList.toggle("on", fast); }
  crisisBar(S);
}

// v5 Phase 8: the mid-quarter crisis strip — the active regime's name, the prioritised
// load-shed tiers, and the demand-response button with its availability state. Rebuilt only
// when its signature changes (so it isn't torn down every frame); a delegated click listener
// in main.js routes the data-shed / data-dr hooks. Shown only during the live day.
let _lastCrisisSig = null;
function crisisBar(S){
  const bar = $("crisisBar"); if (!bar) return;
  const live = S.running && S.calendar?.mode === "operating";
  bar.style.display = live ? "" : "none";
  if (!live){ _lastCrisisSig = null; return; }
  const shedOn = !!(S.shed && S.shed.tLeft > 0);
  const drReady = canDemandRespond(S);
  const drOn = !!(S.dr && S.dr.tLeft > 0);
  const cd = Math.ceil(S.drCooldown || 0);
  const ev = S.regime?.events?.[0];
  const regimeTxt = S.regime ? `${cap(S.regime.season)}${ev ? " · " + (mutatorById(ev)?.label || ev) : ""}` : "—";
  // v5 Phase 9: the aesthetic era (sets a body accent) + a deadpan C.A.S.S. bark for
  // the live event — both pure flavour over the same crisis data.
  const era = eraOf(S);
  if (document.body.dataset.era !== era) document.body.dataset.era = era;
  const cassTxt = ev ? cassLine(S, ev) : (S.brownout ? cassLine(S, "brownout") : "");
  const tiers = loadShedTiers(S);
  const sig = `${era}|${regimeTxt}|${cassTxt}|${shedOn}|${drReady}|${drOn}|${cd}|${tiers.map(t => t.mw).join(",")}`;
  if (sig === _lastCrisisSig) return;        // nothing changed — skip the rebuild
  _lastCrisisSig = sig;
  const shedBtns = tiers.map(t =>
    `<button class="crisis-shed" data-shed="${t.id}" ${shedOn ? "disabled" : ""} title="cut ${t.mw} MW for a short window">▼ ${t.label} · ${t.mw}MW</button>`
  ).join("");
  const drLabel = drOn ? "⟳ DR active" : cd > 0 ? `⟳ DR · cd ${cd}h` : "⟳ Demand Response";
  const drBtn = `<button class="crisis-dr${drReady ? " ready" : ""}" data-dr ${drReady ? "" : "disabled"}>${drLabel}</button>`;
  bar.innerHTML = `<span class="crisis-regime" title="${cassTxt}">⛭ ${ERA_LABEL[era]} · ${regimeTxt}</span>${cassTxt ? `<span class="crisis-cass">C.A.S.S.: ${cassTxt}</span>` : ""}
    <span class="crisis-tools">${shedBtns}${drBtn}</span>`;
}
// v5 Phase 9: the era's display label for the crisis strip.
const ERA_LABEL = { rust: "Rust District", transition: "Transition", veridia: "New Veridia" };
function cap(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// v4.2 CR-3: fleet as a bank of live instrument tiles. Built once per game
// (buildUnits) and patched each frame (updateUnits) — no per-frame DOM teardown,
// so hover/focus and click targets stay stable and the loop stays cheap. The tile
// reacts to state (glow/pulse/dim), carries a per-unit output sparkline, and the
// bank auto-reorders by urgency (shared attentionRank → same order as the Manage
// table). Reorder is done with CSS `order` so DOM nodes never move.
const unitEls = {};
// v5.1 Phase 7: the fleet is grouped into FOUR dispatch-role LANES (Baseload/firm ·
// Dispatchable gas · Renewable · Storage), matching `u.kind` 1:1 — four stable lanes
// immune to tech sprawl (coal/SMR/geo/CCS all = firm; gas = the former peaker). Each
// lane is its own live monitor table; rows are built once per game and patched each
// frame (no per-frame teardown, so taps/hover stay stable), and auto-sort by urgency
// WITHIN their lane. Status pills + row accent update INSTANTLY; numeric columns + the
// sub-note throttle with the readout cadence. Firm/gas rows carry a ⚙ that opens the
// per-plant upgrade drill-down (Phase 3 ladders) without arming the plant.
const LANES = [
  { kind: "firm",    label: "Baseload · firm" },
  { kind: "gas",     label: "Dispatchable gas" },
  { kind: "renew",   label: "Renewable" },
  { kind: "battery", label: "Storage" },
];
const laneTbody = {};              // kind → <tbody> (the per-lane urgency sort target)
const _laneOrder = {};             // kind → last applied row order, to skip no-op reorders
let _onDetail = null;              // captured plant-detail opener (the ⚙ on firm/gas rows)

// Build one live <tr> for a unit (shared by every lane). Registers its patch refs in
// unitEls and, for upgradeable plants, a ⚙ that opens the drill-down (stops the row's
// arm handler from also firing).
function buildUnitRow(S, u, onToggle){
  const tr = document.createElement("tr");
  tr.className = "fu" + (u.ctrl ? " ctrl" : "");
  const key = u.ctrl && u.key ? `<span class="fkey" title="shortcut">${u.key}</span>` : "";
  const gear = u.tiers ? `<button class="fu-gear" data-detail="${u.id}" title="Upgrade ladders" aria-label="Open ${u.name} upgrades">⚙</button>` : "";
  const condCell = u.kpis ? kpiClusterLive() : `<span class="faint">—</span>`;
  tr.innerHTML = `
    <td class="fu-nm"><span class="nm">${u.name}</span>${key}${gear}<div class="fu-sub" data-sub>${Math.round(u.cap)} MW · ${u.kind}</div></td>
    <td><span class="st" data-st>—</span></td>
    <td class="num"><b data-out>0</b><span class="faint">/${Math.round(u.cap)}</span></td>
    <td class="num fu-cond">${condCell}</td>
    <td class="num"><span data-load>—</span></td>`;
  if (u.ctrl) tr.onclick = () => onToggle(u.id);
  const g = tr.querySelector(".fu-gear");
  if (g) g.onclick = e => { e.stopPropagation(); if (_onDetail) _onDetail(u.id); };
  const kpi = {}, kpiq = {};
  tr.querySelectorAll("[data-k]").forEach(i => kpi[i.dataset.k] = i);
  tr.querySelectorAll("[data-kq]").forEach(q => kpiq[q.dataset.kq] = q);
  unitEls[u.id] = {
    el: tr, st: tr.querySelector("[data-st]"), out: tr.querySelector("[data-out]"),
    sub: tr.querySelector("[data-sub]"), kpi, kpiq, load: tr.querySelector("[data-load]"),
  };
  return tr;
}

export function buildUnits(S, onToggle, onDetail){
  _prevDemand = null; // new game — forget the previous run's last demand sample
  _log.length = 0; _lastTicker = null; $("ticker").innerHTML = ""; // fresh annunciator log
  for (const k in unitEls) delete unitEls[k];
  for (const k in laneTbody) delete laneTbody[k];
  for (const k in _laneOrder) delete _laneOrder[k];
  _onDetail = onDetail || null;

  const host = $("units"); host.innerHTML = "";
  for (const lane of LANES){
    const inLane = S.fleet.filter(u => u.kind === lane.kind);
    const sec = document.createElement("section");
    sec.className = "lane"; sec.dataset.lane = lane.kind;
    sec.innerHTML = `<div class="lane-h"><span class="lane-nm">${lane.label}</span><span class="lane-ct">${inLane.length}</span></div>`;
    const table = document.createElement("table");
    table.className = "fleet-live";
    const tb = document.createElement("tbody");
    if (!inLane.length){
      const tr = document.createElement("tr"); tr.className = "lane-empty";
      tr.innerHTML = `<td colspan="5" class="faint">— none in service —</td>`;
      tb.appendChild(tr);
    }
    for (const u of inLane) tb.appendChild(buildUnitRow(S, u, onToggle));
    table.appendChild(tb);
    sec.appendChild(table);
    host.appendChild(sec);
    laneTbody[lane.kind] = tb;
  }
}
function updateUnits(S, tick = true){
  const fuelMult = S.mmods?.fuelMult ?? 1;
  for (const u of S.fleet){
    const refs = unitEls[u.id]; if (!refs) continue;
    const out = Math.round(unitOutput(S, u));
    // state → status pill + row accent class
    let stClass, stText, rowState;
    if (u.status === "maint"){ stClass = "st-service"; stText = "⚙ MAINT"; rowState = "service"; }
    else if (u.status === "strained"){ stClass = "st-strained"; stText = "⚠ STRAIN"; rowState = "strained"; }
    else if (u.status === "online" || u.status === "discharge"){ stClass = "st-online"; stText = u.kind === "battery" ? "DISCHG" : "ONLINE"; rowState = "live"; }
    else if (u.status === "starting"){ stClass = "st-starting"; stText = "STARTING"; rowState = "starting"; }
    else if (u.status === "tripped"){ stClass = "st-tripped"; stText = "TRIPPED"; rowState = "tripped"; }
    else { stClass = "st-off"; stText = u.kind === "renew" ? "IDLE" : "RESERVE"; rowState = "idle"; }
    // status pill + row accent are INSTANT (a trip/strain must show the moment it happens)
    if (refs.st.textContent != stText) refs.st.textContent = stText;
    const cls = "st " + stClass; if (refs.st.className != cls) refs.st.className = cls;
    const rcls = "fu" + (u.ctrl ? " ctrl" : "") + " u-" + rowState;
    if (refs.el.className != rcls) refs.el.className = rcls;

    if (!tick) continue; // numeric columns + sub-note throttle with the readout cadence
    if (refs.out.textContent != String(out)) refs.out.textContent = out;
    // Four KPI bars (thermal only) — reliability·efficiency·output·flexibility
    if (refs.kpi && u.kpis){
      for (const [k] of KPI_AXES){
        const fill = refs.kpi[k]; if (!fill) continue;
        const v = Math.round(u.kpis[k]);
        fill.style.width = v + "%";
        fill.style.background = kpiColor(kpiBand(v));
        const q = refs.kpiq[k]; if (q) q.title = kpiTitle(k, v);
      }
    }
    // Load% — how hard this unit is worked (the wear driver). Thermal/peaker use the
    // dispatch share (loadFrac); renewables = output/cap; off/idle = —.
    let loadTxt = "—";
    if (u.status === "online" || u.status === "strained" || u.status === "discharge"){
      const lf = u.kind === "renew" ? (u.cap > 0 ? out / u.cap : 0) : (u.loadFrac ?? (u.cap > 0 ? out / u.cap : 0));
      loadTxt = Math.round(clamp(lf, 0, 1) * 100) + "%";
    }
    if (refs.load.textContent != loadTxt) refs.load.textContent = loadTxt;
    // contextual sub-note: strain/spin/service/charge callout, else cap · running $/MWh
    let sub;
    if (u.status === "strained") sub = u.ctrl ? "about to trip — stand down / back up" : "about to trip — fire reserves";
    else if (u.status === "maint") sub = `in the shop — back next quarter`;
    else if (u.status === "starting") sub = `spin-up · ${clock(Math.max(0, u.startTimer || 0))}`;
    else if (u.kind === "battery") sub = `charge ${Math.round(u.energy)}/${Math.round(u.maxEnergy * (S.rmods?.battEnergyMult ?? 1))} MWh${u.ctrl ? ` · tap ${u.key}` : ""}`;
    else if (u.kind === "renew") sub = `${Math.round(u.cap)} MW · $0/MWh`;
    else { const mc = Math.round(marginalCost(u.tech, S.carbon, fuelMult)); sub = u.ctrl ? `$${mc}/MWh · tap ${u.key} to ${u.status === "off" ? "start" : "stop"}` : `$${mc}/MWh base`; }
    if (refs.sub.textContent != sub) refs.sub.textContent = sub;
  }
  // auto-sort rows by urgency (worst first) WITHIN each lane — move <tr> nodes only when
  // the order actually changes (onclick travels with the node, so taps never retarget).
  for (const lane of LANES){
    const tb = laneTbody[lane.kind]; if (!tb) continue;
    const order = S.fleet.filter(u => u.kind === lane.kind).sort(compareNeedsAttention);
    const sig = order.map(u => u.id).join(",");
    if (sig !== _laneOrder[lane.kind]){
      order.forEach(u => { const r = unitEls[u.id]; if (r) tb.appendChild(r.el); });
      _laneOrder[lane.kind] = sig;
    }
  }
}

const MONO = () => "10px " + css("--mono");
function hexA(hex, a){
  hex = hex.replace("#", ""); if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const n = parseInt(hex, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// One trapezoid between the capacity and demand lines over [x1,x2], in `color`.
function band(ctx, x1, c1, d1, x2, c2, d2, color){
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x1, c1); ctx.lineTo(x2, c2); ctx.lineTo(x2, d2); ctx.lineTo(x1, d1);
  ctx.closePath(); ctx.fill();
}
// Shade the gap between demand and capacity: green where there's reserve
// (c≥d), red where there's a deficit (d>c). Segments that cross are split at
// the exact intersection so neither colour spills onto the wrong side.
function fillBands(ctx, data, x, y, goodColor, badColor){
  for (let i = 1; i < data.length; i++){
    const a = data[i - 1], b = data[i];
    const da = a.d - a.c, db = b.d - b.c;              // >0 = deficit
    const xa = x(i - 1), xb = x(i);
    if ((da > 0) === (db > 0) || da === db){           // same side across the segment
      band(ctx, xa, y(a.c), y(a.d), xb, y(b.c), y(b.d), da > 0 ? badColor : goodColor);
    } else {                                           // crosses: split at d == c
      const t = da / (da - db), xc = xa + (xb - xa) * t;
      const yc = y(a.c + (b.c - a.c) * t);             // capacity == demand at the crossing
      band(ctx, xa, y(a.c), y(a.d), xc, yc, yc, da > 0 ? badColor : goodColor);
      band(ctx, xc, yc, yc, xb, y(b.c), y(b.d), db > 0 ? badColor : goodColor);
    }
  }
}

function drawChart(S){
  const cv = $("chart"), ctx = cv.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 1100, h = 270;
  const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
  if (cv.width !== bw || cv.height !== bh){ cv.width = bw; cv.height = bh; } // realloc backing store only on resize
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // generous pads: left for y labels + "MW", right for the leading "now" readouts,
  // bottom for the hour axis so x labels never collide with the baseline y label.
  const padL = 52, padR = 66, padT = 20, padB = 30, W = w - padL - padR, H = h - padT - padB;
  const hist = S.hist, n = hist.length, WINDOW = 260;
  let ymax = S.peak * 1.12;
  hist.forEach(p => ymax = Math.max(ymax, p.d, p.c)); ymax = Math.ceil(ymax / 100) * 100;
  const x = i => padL + (i / (WINDOW - 1)) * W;
  const y = v => padT + H - (v / ymax) * H;

  // y unit, top-left above the axis
  ctx.font = MONO(); ctx.fillStyle = css("--faint");
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText("MW", 4, padT - 7);

  // recessive gridlines + right-aligned y labels
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++){ const val = ymax * i / 4, yy = y(val);
    ctx.strokeStyle = css("--line"); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + W, yy); ctx.stroke();
    ctx.fillStyle = css("--faint"); ctx.fillText(Math.round(val), padL - 8, yy); }

  // axis lines (left + baseline) for structure
  ctx.strokeStyle = css("--muted"); ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + H); ctx.lineTo(padL + W, padT + H); ctx.stroke();

  if (n > 1){
    // the margin, as status-colored bands between the two lines (the hero read):
    fillBands(ctx, hist, x, y, hexA(css("--good"), 0.14), hexA(css("--bad"), 0.32));

    // peak reference — the demand ceiling you're climbing toward (label at left, clear of the leading edge)
    const yp = y(S.peak);
    ctx.strokeStyle = css("--faint"); ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, yp); ctx.lineTo(padL + W, yp); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = css("--faint"); ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillText("peak " + S.peak, padL + 3, yp - 3);

    // control-room phosphor trace: a soft glow under each line (restored so the
    // crisp 2px stroke sits on top, labels/dots stay sharp).
    ctx.save();
    ctx.shadowColor = hexA(css("--accent"), 0.9); ctx.shadowBlur = 7;
    line(ctx, hist, x, y, "c", css("--accent"), 2); // capacity (amber)
    ctx.shadowColor = "rgba(255,255,255,.85)"; ctx.shadowBlur = 6;
    line(ctx, hist, x, y, "d", "#fff", 2);           // demand (white)
    ctx.restore();

    // live "now" markers at the leading edge, nudged apart if they'd overlap
    const last = hist[n - 1], xn = x(n - 1);
    let yc = y(last.c), yd = y(last.d);
    if (Math.abs(yc - yd) < 12){ const mid = (yc + yd) / 2; yc = mid + 7; yd = mid - 7; } // keep both labels legible
    nowDot(ctx, xn, y(last.d), yd, "#fff", "dem " + Math.round(last.d), w - padR);
    nowDot(ctx, xn, y(last.c), yc, css("--accent"), "cap " + Math.round(last.c), w - padR);

    // x-axis hour ticks — spaced by PIXELS across the filled range (not by sample
    // index, which bunches them left while the buffer fills) and de-duped so a
    // sub-hour span doesn't print the same hour several times.
    ctx.fillStyle = css("--faint"); ctx.textBaseline = "top";
    const xEnd = x(n - 1), filledW = Math.max(1, xEnd - padL);
    const ticks = Math.max(1, Math.min(6, Math.floor(filledW / 54)));
    let lastLabel = null;
    for (let k = 0; k <= ticks; k++){
      const idx = Math.round((k / ticks) * (n - 1)), px = x(idx);
      const label = String(Math.floor(hist[idx].h)).padStart(2, "0") + "h";
      if (label === lastLabel) continue; // don't repeat an hour within a sub-hour span
      lastLabel = label;
      ctx.textAlign = px <= padL + 6 ? "left" : (px >= xEnd - 6 ? "right" : "center");
      ctx.fillText(label, px, padT + H + 7);
    }
    ctx.textAlign = "right"; ctx.fillStyle = css("--faint"); ctx.fillText("hour", padL + W, padT + H + 18);
  }
}
// dotY lets the label sit at a nudged y while the dot stays on the true value.
function nowDot(ctx, px, dotY, labelY, color, label, maxRight){
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, dotY, 3, 0, 7); ctx.fill();
  ctx.font = MONO(); ctx.textBaseline = "middle"; ctx.fillStyle = color;
  // keep the label inside the canvas (right-align it if it'd run off the edge)
  if (maxRight != null && px + 6 + ctx.measureText(label).width > maxRight){ ctx.textAlign = "right"; ctx.fillText(label, px - 6, labelY); }
  else { ctx.textAlign = "left"; ctx.fillText(label, px + 6, labelY); }
}
function line(ctx, data, x, y, key, color, lw){
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
  data.forEach((p, i) => { const px = x(i), py = y(p[key]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
}

// ---- Planning Office (v5, Phase 1 STUB) — the quarter-end board review beat.
// The grid never ends; completing a quarter pauses here. Phase 6 fills this with
// the overlord's KPI verdict, maintenance triage, build queue, research and ⚡
// perks. For now it reports the close and hands control back to the next quarter.
// Nameplate capacity now (whole fleet) + the MW already in flight as construction.
function capacityPicture(S){
  const nameplate = S.fleet.reduce((a, u) => a + u.cap, 0);
  const inFlight = (S.builds || []).reduce((a, b) => a + (b.mw || 0), 0);
  return { nameplate, inFlight, total: nameplate + inFlight };
}
// The first quarter ahead where forecast peak outgrows committed+in-flight capacity
// (0 = already short / covered through the horizon). Build-ahead signal.
function shortfallHorizon(S, maxQ = 6){
  const cap = capacityPicture(S).total;
  for (let q = 1; q <= maxQ; q++) if (forecastDemand(S, q) > cap) return q;
  return 0;
}
// The axes a plant still has to repair (KPI below its upgraded cap), each with its task + the
// rolling queue cost. v5.1 Phase 3/4: the deficit is measured against u.caps (which upgrades
// raise), and the cost is the rolling maintCost (scales with the deficit), not a flat quarter fee.
function kpiDeficits(u){
  return KPI_AXES
    .map(([axis, letter]) => ({ axis, letter,
      deficit: Math.round((u.caps?.[axis] ?? 100) - u.kpis[axis]),
      cost: maintCost(u, axis),
      task: Object.values(TASKS).find(t => t.axis === axis) }))
    .filter(d => d.deficit > 0 && d.task);
}
// v5 Phase 5: the Planning Office build queue — the honest demand forecast, the
// in-flight projects (quarters left + slip warning), and the commit buttons. Building
// is quarter-end only now, so this is where capacity gets committed.
function buildSection(S){
  const cap = capacityPicture(S);
  const short = shortfallHorizon(S);
  const builds = S.builds || [];
  const fc = [1, 2, 4].map(q => {
    const d = forecastDemand(S, q), covered = d <= cap.total;
    return `<li><span>Q+${q} peak</span><span class="${covered ? "" : "short"}">${d} MW${covered ? "" : " ⚠"}</span></li>`;
  }).join("");
  const queue = builds.length
    ? builds.map(b => {
        const spec = BUILDABLES[b.tech], slipPct = Math.round((b.slipRisk || 0) * 100);
        return `<li><span>${spec ? spec.label : b.tech} · +${b.mw} MW</span>
          <span>${b.quartersLeft}Q left${slipPct ? ` · slip ${slipPct}%` : ""}${b.slips ? ` · slipped ${b.slips}×` : ""}</span></li>`;
      }).join("")
    : `<li class="faint">No projects in flight.</li>`;
  const nextSlip = Math.round(concurrencySlip(builds.length) * 100);
  const btns = BUILD_ORDER.filter(t => BUILDABLES[t]).map(t => {
    const spec = BUILDABLES[t], gate = BUILD_GATE[t], locked = gate && !(S.rmods?.[gate]);
    const can = !locked && S.cash >= spec.cost;
    const right = locked ? `🔒 research` : `${spec.leadQuarters}Q · ${money(spec.cost)}`;
    return `<button data-commit-build="${t}" ${can ? "" : "disabled"}>+${spec.mw} ${spec.label}<span class="c">${right}</span></button>`;
  }).join("");
  return `<div class="pl-section">
    <h3>Capacity &amp; construction <small class="faint">— build ahead of the curve</small></h3>
    <ul class="pl-stats fc-stats">
      <li><span>Capacity (incl. in-flight)</span><span>${cap.total} MW</span></li>
      ${fc}
    </ul>
    ${short
      ? `<p class="fc-warn">⚠ Forecast peak outgrows your capacity in Q+${short} — commit capacity now (it won't come online for quarters).</p>`
      : `<p class="faint">Capacity covers the forecast through the horizon.</p>`}
    <h4>In flight</h4><ul class="bq-list">${queue}</ul>
    <h4>Commit a project${nextSlip ? ` <small class="faint">— queue busy: +${nextSlip}% slip risk</small>` : ""}</h4>
    <div class="build-grid pl-build">${btns}</div>
  </div>`;
}

// v5 Phase 6: the overlord's board verdict — KPI grade, the floor-vs-swing earnings
// split, the rate ratchet, the bonus/fine, and a barbed one-liner. Reads the last
// settled Verdict (the quarterLog is already reset for the new quarter by now).
function verdictCard(S){
  const v = S.economy?.lastVerdict;
  if (!v) return `<div class="pl-section verdict-card first">
    <div class="pl-kicker">Board Review</div>
    <p class="faint">No verdict yet — the overlord grades your first full quarter at its close.
      Keep the city lit, your iron healthy, and your smokestacks quiet.</p></div>`;
  const gradePct = Math.round(v.grade * 100);
  const band = v.grade >= 0.75 ? "ok" : v.grade >= CFG.v5.econ.gradeNeutral ? "warn" : "bad";
  const settle = v.bonus ? `<span class="v-bonus">+${money(v.bonus)}</span>`
    : v.fine ? `<span class="v-fine">−${money(v.fine)}</span>` : `<span class="faint">—</span>`;
  const rateDir = v.floorRateNext > v.floorRate ? "up" : v.floorRateNext < v.floorRate ? "down" : "flat";
  const arrow = rateDir === "up" ? "▲" : rateDir === "down" ? "▼" : "→";
  return `<div class="pl-section verdict-card ${band}">
    <div class="pl-kicker">Board Review — Y${v.year} · Q${v.quarter}</div>
    <div class="v-grid">
      <div class="v-grade"><b>${gradePct}</b><small>grade</small></div>
      <ul class="v-stats">
        <li><span>KPI average</span><span>${v.kpiScore}</span></li>
        <li><span>Load served</span><span>${Math.round(v.serveRate * 100)}%</span></li>
        <li><span>Clean standing</span><span>${Math.round(v.cleanScore * 100)}%</span></li>
        <li><span>Floor income</span><span>${money(v.floorPay)}</span></li>
        <li><span>Swing income</span><span>${money(v.swingPay)}</span></li>
        <li><span>Quarter PnL</span><span class="${v.pnl < 0 ? "short" : ""}">${money(v.pnl)}</span></li>
        <li><span>Floor rate next</span><span class="rate-${rateDir}">${v.floorRate.toFixed(1)} ${arrow} ${v.floorRateNext.toFixed(1)}</span></li>
        <li><span>Settlement</span><span>${settle}</span></li>
      </ul>
    </div>
    ${scorecardBlock(v)}
    <p class="v-note">“${v.note}”</p>
  </div>`;
}

// v5.1 Phase 6: the KPI scorecard — the ⚡ faucet made legible. Seven metrics in two channels
// (PnL / Satisfaction), each a 0..100 bar; the channel subtotals split a 50/50 pool and mint the
// quarter's ⚡, banked to the skill tree. Pure read of the verdict's attached scorecard.
function scorecardBlock(v){
  const sc = v.scorecard; if (!sc) return "";
  const pct = x => Math.round((x || 0) * 100);
  const bar = (label, x) => `<li><span>${label}</span><span class="sc-bar"><i style="width:${pct(x)}%"></i></span><span class="sc-pct">${pct(x)}</span></li>`;
  return `<div class="v-scorecard">
    <div class="sc-channel">
      <div class="sc-head"><span>PnL</span><span class="sc-score">${pct(sc.pnlScore)}</span></div>
      <ul>${bar("Margin", sc.pnl.margin)}${bar("Cost discipline", sc.pnl.cost)}${bar("Capital efficiency", sc.pnl.capEff)}</ul>
    </div>
    <div class="sc-channel">
      <div class="sc-head"><span>Satisfaction</span><span class="sc-score">${pct(sc.satScore)}</span></div>
      <ul>${bar("Reliability", sc.sat.reliability)}${bar("Headroom", sc.sat.headroom)}${bar("Clean", sc.sat.clean)}${bar("Affordability", sc.sat.affordability)}</ul>
    </div>
    <div class="sc-mint">
      <span class="sc-mint-lead">⚡ minted</span>
      <span class="sc-mint-split">${Math.round(sc.mintPnL)} PnL + ${Math.round(sc.mintSat)} Sat</span>
      <span class="sc-mint-total">${v.mintTotal} ⚡</span>
    </div>
  </div>`;
}

// v5 Phase 6: the contract book — the hedge legs smoothing your swing, shown read-only
// at the review (they're signed/cancelled at the Desk during the live day).
function contractBook(S){
  const cs = S.contracts || [];
  const rows = cs.length
    ? cs.map(c => `<li><span>${c.mw} MW @ ${money(c.price)}/MWh</span><span class="faint">${c.remaining}d left · ${c.origin === "dial" ? "hedge" : c.buyer || c.origin}</span></li>`).join("")
    : `<li class="faint">No hedges on the book — your served load rides the spot swing unsmoothed.</li>`;
  const floorRate = (S.economy?.floorRate ?? CFG.v5.econ.floorRateStart).toFixed(1);
  return `<div class="pl-section">
    <h3>The book <small class="faint">— floor rate ${floorRate} $/MW·h · contracts hedge the swing</small></h3>
    <ul class="bq-list">${rows}</ul>
  </div>`;
}

// v5.1 Phase 3: the Development Office — per-plant UPGRADE LADDERS + the contractor queue.
// Each thermal plant shows four axis chips: current tier, next-tier cost, and a "queue" button
// that commits cash to the rolling contractor line (the tier lands on its lead-time day). The
// in-flight queue is listed below. PERKS (⚡) keep their roster/branch/automation lane.
const AXIS_LETTER = { reliability: "R", efficiency: "E", output: "O", flexibility: "F" };
function progressionSection(S){
  const thermal = S.fleet.filter(u => u.tiers);
  const tierMax = upgradeTierMax, lead = CFG.v5_1.upgrade.leadDays;
  // --- per-plant axis ladder chips (tier N/9 · next-tier cost) ---
  const specRows = thermal.map(u => {
    const chips = AXES.map(ax => {
      const tier = u.tiers[ax] ?? 0;
      const queued = (S.contractor || []).some(j => j.unitId === u.id && j.axis === ax);
      if (tier >= tierMax) return `<button class="spec-chip" disabled title="${ax} at tier ${tierMax} (max cap ${axisTierValue(tierMax)})">${AXIS_LETTER[ax]} ${tier}/${tierMax}·max</button>`;
      if (queued) return `<button class="spec-chip" disabled title="${ax} upgrade in the contractor queue">${AXIS_LETTER[ax]} ${tier}/${tierMax} · ⏳</button>`;
      const cost = upgradeCost(u, ax, S.rmods), can = canUpgrade(S, u.id, ax);
      return `<button class="spec-chip" data-spec="${u.id}" data-spec-axis="${ax}" ${can ? "" : "disabled"}
        title="${ax}: tier ${tier} → ${tier + 1} (cap ${axisTierValue(tier)} → ${axisTierValue(tier + 1)}), ${lead}d">${AXIS_LETTER[ax]} ${tier}/${tierMax} · ${money(cost)}</button>`;
    }).join("");
    return `<div class="spec-row"><div class="spec-nm">${u.name}<small class="faint">${u.tech}</small></div>
      <div class="spec-chips">${chips}</div></div>`;
  }).join("") || `<p class="faint">No thermal plants to upgrade — renewables and storage grow by building more.</p>`;

  // --- the rolling contractor queue (in-flight upgrade jobs) ---
  const jobRows = (S.contractor || []).map(j => {
    const u = S.fleet.find(x => x.id === j.unitId);
    return `<li><span>${u ? u.name : j.unitId} · ${j.axis} → tier ${j.toTier}</span><span class="faint">${Math.ceil(j.daysLeft)}d left</span></li>`;
  }).join("");
  const queueBlock = contractorLoad(S)
    ? `<h4 class="dev-perk-h">🏗 Contractor queue <small class="faint">— ${contractorLoad(S)} in flight (own labor, parallel to crews)</small></h4><ul class="dev-queue">${jobRows}</ul>`
    : "";

  // --- perks: roster / branch unlocks / growth-tier-gated automation ---
  const tier = automationTier(S);
  const perkRows = Object.entries(PERKS).map(([id, p]) => {
    const owned = !!S.perks?.[id];
    const gated = p.kind === "automation" && !isAutomationUnlocked(S, id);
    const btn = owned ? `<button disabled>Owned ✓</button>`
      : gated ? `<button disabled title="reaches tier ${p.tier}; grid at tier ${tier}">🔒 Tier ${p.tier}</button>`
      : `<button data-perk="${id}" ${canUnlockPerk(S, id) ? "" : "disabled"}>${p.cost} ⚡</button>`;
    return `<div class="skill-row"><span class="sk-nm">${p.label}<br><small>${p.desc}</small></span>${btn}</div>`;
  }).join("");

  return `<div class="pl-section">
    <h3>Development Office <small class="faint">— upgrade plants on the rolling contractor line (cash) · perks (⚡)</small></h3>
    <div class="dev-grid">
      <div class="dev-col"><h4>Upgrade ladders <small class="faint">R·E·O·F · tier/${tierMax}</small></h4>${specRows}</div>
    </div>
    ${queueBlock}
    <h4 class="dev-perk-h">⚡ Perks <small class="faint">— grid at automation tier ${tier}</small></h4>
    <div class="skill-list">${perkRows}</div>
  </div>`;
}
export function renderPlanning(S, actions){
  const c = S.calendar;
  const closedQ = c.quarter === 1 ? CFG.v5.quartersPerYear : c.quarter - 1; // the quarter that just closed
  const closedY = c.quarter === 1 ? c.year - 1 : c.year;
  const crews = S.crews || [], tasks = S.maintQueue || [], freeCrews = crews.filter(cr => !cr.assignment);
  const cc = CFG.v5.crews;

  // ---- maintenance triage: plants with KPI deficits not already in the shop ----
  const needy = S.fleet.filter(u => u.kpis && !u.maintDown && kpiDeficits(u).length > 0);
  const crewOpts = (axis) => freeCrews.map(cr => {
    const edge = tradeModifier(cr, axis) === 1 ? "on-trade" : "off-trade";
    return `<option value="${cr.id}">${cr.name} · ${cr.trade.slice(0,3)} Lv${cr.level} (${edge})</option>`;
  }).join("");
  const triageRows = needy.map(u => {
    const defs = kpiDeficits(u);
    const axisOpts = defs.map(d => `<option value="${d.axis}">${d.task.label} · ${d.letter} −${d.deficit} · ${money(d.cost)}</option>`).join("");
    const firstAxis = defs[0].axis;
    const canAssign = freeCrews.length > 0 && S.cash >= defs[0].cost;
    return `<div class="tri-row" data-tri="${u.id}">
      <div class="tri-nm">${u.name}<small class="faint">${Math.round(u.cap)} MW · ${u.kind}</small></div>
      ${kpiClusterStatic(u.kpis)}
      <select class="tri-axis" data-tri-axis="${u.id}">${axisOpts}</select>
      <select class="tri-crew" data-tri-crew="${u.id}" ${freeCrews.length ? "" : "disabled"}>${crewOpts(firstAxis) || `<option>— no free crew —</option>`}</select>
      <button class="tri-go" data-tri-go="${u.id}" ${canAssign ? "" : "disabled"}>Schedule</button>
    </div>`;
  }).join("") || `<p class="faint tri-empty">No plant needs maintenance — the fleet is in good health.</p>`;

  // ---- in-flight maint jobs (rolling; the plant is offline while worked) ----
  const schedRows = tasks.map(j => {
    const u = S.fleet.find(x => x.id === j.unitId), cr = crews.find(x => x.id === j.crewId);
    const task = TASKS[j.name], pts = Math.round(axisRestore(j.axis, cr));
    return `<li><span>${u ? u.name : j.unitId} — ${task ? task.label : j.name} (+${pts} ${j.axis.slice(0,3)}, ${cr ? cr.name : "?"})</span>
      <span class="faint">${Math.ceil(j.daysLeft)}d</span>
      <button class="tri-cancel" data-cancel="${j.id}">Cancel</button></li>`;
  }).join("");
  const schedBlock = tasks.length
    ? `<div class="pl-sched"><h4>In the shop <small class="faint">— rolling jobs; these plants are offline until done</small></h4><ul>${schedRows}</ul></div>`
    : "";

  // ---- crew roster: trade, level, assignment; promote with ⚡, hire with cash ----
  const crewRows = crews.map(cr => {
    const busy = cr.assignment ? S.fleet.find(u => (S.maintQueue || []).some(j => j.id === cr.assignment && j.unitId === u.id)) : null;
    const xpPct = Math.round(Math.min(1, cr.xp / cc.xpCurve) * 100);
    const canPromote = cr.levelCap < cc.maxLevel && (S.zap || 0) >= cc.promoteCost;
    const promoteBtn = cr.levelCap < cc.maxLevel
      ? `<button class="cr-promote" data-promote="${cr.id}" ${canPromote ? "" : "disabled"}>Promote · ${cc.promoteCost} ⚡</button>`
      : `<span class="faint">maxed</span>`;
    return `<div class="cr-row">
      <div class="cr-id"><b>${cr.name}</b><small class="faint">${cr.trade} · Lv ${cr.level}/${cr.levelCap}</small></div>
      <span class="cr-xp" title="${cr.xp}/${cc.xpCurve} XP"><i style="width:${xpPct}%"></i></span>
      <span class="cr-assign ${cr.assignment ? "busy" : "free"}">${cr.assignment ? "→ " + (busy ? busy.name : "assigned") : "free"}</span>
      ${promoteBtn}
    </div>`;
  }).join("");
  const rosterFull = crews.length >= (S.rosterCap ?? cc.baseRoster);
  const hireBtns = TRADES.map(tr => {
    const can = !rosterFull && S.cash >= cc.hireCost;
    return `<button class="cr-hire" data-hire="${tr}" ${can ? "" : "disabled"}>+ ${tr.slice(0,4)} · ${money(cc.hireCost)}</button>`;
  }).join("");

  $("vignette").style.opacity = "0";
  $("modal").innerHTML = `
    <div class="planning planning-wide">
      <div class="pl-kicker">Planning Office</div>
      <h2>Quarter Review</h2>
      <p class="pl-lead">Y${closedY} · Q${closedQ} has closed. The board has graded the quarter — settle the
        verdict below, then triage the fleet's wear: assign crews to per-KPI jobs that now resolve on a
        <em>rolling</em> schedule (days, not a whole quarter), with the plant offline while it's in the shop.
        Crews are the maintenance limiter — repair what will hurt most and build ahead of the curve.</p>

      ${verdictCard(S)}

      <ul class="pl-stats">
        <li><span>Cash</span><span>${money(S.cash)}</span></li>
        <li><span>⚡ Guild Cred</span><span>${S.zap || 0}</span></li>
        <li><span>Crews</span><span>${crews.length}/${S.rosterCap ?? cc.baseRoster}</span></li>
        <li><span>Wage bill / Q</span><span>${money(crews.length * cc.wage)}</span></li>
      </ul>

      <div class="pl-section">
        <h3>Maintenance triage</h3>
        <div class="tri-list">${triageRows}</div>
        ${schedBlock}
      </div>

      <div class="pl-section">
        <h3>Crew roster <small class="faint">— levels with use; ⚡ promotes standouts</small></h3>
        <div class="cr-list">${crewRows}</div>
        <div class="cr-hire-row"><span class="faint">Hire${rosterFull ? " — roster full" : ""}:</span> ${hireBtns}</div>
      </div>

      ${buildSection(S)}

      ${progressionSection(S)}

      ${contractBook(S)}

      <div class="end-btns">
        <button class="btn-primary" id="beginQ">Begin Y${c.year} · Q${c.quarter} ▸</button>
      </div>
    </div>`;
  $("overlay").classList.add("on");

  // repopulate the crew select when the axis changes (on/off-trade hint tracks the axis)
  $("modal").querySelectorAll("[data-tri-axis]").forEach(sel => sel.onchange = () => {
    const id = sel.dataset.triAxis, crewSel = $("modal").querySelector(`[data-tri-crew="${id}"]`);
    if (crewSel) crewSel.innerHTML = crewOpts(sel.value) || `<option>— no free crew —</option>`;
  });
  $("modal").querySelectorAll("[data-tri-go]").forEach(b => b.onclick = () => {
    const id = b.dataset.triGo;
    const axis = $("modal").querySelector(`[data-tri-axis="${id}"]`)?.value;
    const crewId = $("modal").querySelector(`[data-tri-crew="${id}"]`)?.value;
    if (axis && crewId) actions.schedule(id, axis, crewId);
  });
  $("modal").querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => actions.cancelTask(b.dataset.cancel));
  $("modal").querySelectorAll("[data-promote]").forEach(b => b.onclick = () => actions.promote(b.dataset.promote));
  $("modal").querySelectorAll("[data-hire]").forEach(b => b.onclick = () => actions.hire(b.dataset.hire));
  $("modal").querySelectorAll("[data-commit-build]").forEach(b => b.onclick = () => actions.commitBuild(b.dataset.commitBuild));
  // v5.1 Phase 3: Development Office — queue a cash upgrade (rolling contractor line), buy perks (⚡)
  $("modal").querySelectorAll("[data-spec]").forEach(b => b.onclick = () => actions.specialize(b.dataset.spec, b.dataset.specAxis));
  $("modal").querySelectorAll("[data-perk]").forEach(b => b.onclick = () => actions.perk(b.dataset.perk));
  $("beginQ").onclick = actions.begin;
}

export function hidePlanning(){
  $("overlay").classList.remove("on");
  $("vignette").style.opacity = "0";
}

// v5.1 Phase 5: the DAILY BRIEF — the blocking-but-skippable daily beat. A compact review +
// quick-add surface onto the two ROLLING queues (maintenance crews + contractor upgrades):
// the overnight recap + alerts, demand vs capacity + the next-quarter forecast, both queues
// with ETAs, a compact maintenance triage and the per-plant upgrade chips, and in-flight builds
// (surfaced, NOT committable here — that's the review). "Advance" re-arms auto-skip; "Step a day"
// stays hands-on. Phase 7 restyles this; here it's the functional wire. Pure view (reads via
// briefSummary; all scheduling routes through the Phase 3/4 queue actions).
export function renderBrief(S, actions){
  const sum = briefSummary(S);
  const crews = S.crews || [], freeCrews = crews.filter(cr => !cr.assignment);
  const bcfg = CFG.v5_1.brief;

  // --- overnight recap + alerts ---
  const recap = sum.events.length
    ? sum.events.map(e => `<li>${e}</li>`).join("")
    : `<li class="faint">A quiet night — nothing landed.</li>`;
  const alerts = sum.alerts.length
    ? `<ul class="brief-alerts">${sum.alerts.map(a => `<li>⚠ ${a}</li>`).join("")}</ul>`
    : `<p class="faint">No alerts — the grid is steady.</p>`;

  // --- demand vs capacity + the forecast ---
  const headPct = Math.round(sum.demand.headroom * 100);
  const demandStats = `<ul class="pl-stats">
    <li><span>Peak today</span><span>${sum.demand.peak} MW</span></li>
    <li><span>Capacity</span><span class="${sum.demand.headroom < bcfg.headroomPct ? "short" : ""}">${Math.round(sum.demand.capacity)} MW (${headPct >= 0 ? "+" : ""}${headPct}%)</span></li>
    <li><span>Quarter baseline</span><span>${sum.forecast.thisQuarter} MW</span></li>
    <li><span>Next quarter forecast</span><span>${sum.forecast.nextQuarter} MW</span></li>
  </ul>`;

  // --- both rolling queues with ETAs ---
  const maintRows = sum.maintQueue.length
    ? sum.maintQueue.map(j => {
        const u = S.fleet.find(x => x.id === j.unitId), cr = crews.find(x => x.id === j.crewId), task = TASKS[j.name];
        return `<li><span>${u ? u.name : j.unitId} — ${task ? task.label : j.name} (${cr ? cr.name : "?"})</span>
          <span class="faint">${Math.ceil(j.daysLeft)}d</span>
          <button class="tri-cancel" data-cancel="${j.id}">Cancel</button></li>`;
      }).join("")
    : `<li class="faint">No maintenance in the shop.</li>`;
  const upRows = sum.contractorQueue.length
    ? sum.contractorQueue.map(j => {
        const u = S.fleet.find(x => x.id === j.unitId);
        return `<li><span>${u ? u.name : j.unitId} · ${j.axis} → tier ${j.toTier}</span><span class="faint">${Math.ceil(j.daysLeft)}d</span></li>`;
      }).join("")
    : `<li class="faint">No upgrades on the contractor line.</li>`;

  // --- quick-add maintenance (compact triage: needy plants not already in the shop) ---
  const needy = S.fleet.filter(u => u.kpis && !u.maintDown && kpiDeficits(u).length > 0);
  const crewOpts = (axis) => freeCrews.map(cr =>
    `<option value="${cr.id}">${cr.name} · Lv${cr.level} (${tradeModifier(cr, axis) === 1 ? "on" : "off"}-trade)</option>`).join("");
  const triageRows = needy.map(u => {
    const defs = kpiDeficits(u);
    const axisOpts = defs.map(d => `<option value="${d.axis}">${d.task.label} · ${d.letter} −${d.deficit} · ${money(d.cost)}</option>`).join("");
    const canAssign = freeCrews.length > 0 && S.cash >= defs[0].cost;
    return `<div class="tri-row" data-tri="${u.id}">
      <div class="tri-nm">${u.name}<small class="faint">${Math.round(u.cap)} MW</small></div>
      <select class="tri-axis" data-tri-axis="${u.id}">${axisOpts}</select>
      <select class="tri-crew" data-tri-crew="${u.id}" ${freeCrews.length ? "" : "disabled"}>${crewOpts(defs[0].axis) || `<option>— no free crew —</option>`}</select>
      <button class="tri-go" data-tri-go="${u.id}" ${canAssign ? "" : "disabled"}>Queue</button>
    </div>`;
  }).join("") || `<p class="faint">No plant needs maintenance — the fleet is healthy.</p>`;

  // --- quick-add upgrade (per-plant axis chips → the contractor line) ---
  const thermal = S.fleet.filter(u => u.tiers);
  const specRows = thermal.map(u => {
    const chips = AXES.map(ax => {
      const tier = u.tiers[ax] ?? 0;
      const queued = (S.contractor || []).some(j => j.unitId === u.id && j.axis === ax);
      if (tier >= upgradeTierMax) return `<button class="spec-chip" disabled>${AXIS_LETTER[ax]} ${tier}/${upgradeTierMax}·max</button>`;
      if (queued) return `<button class="spec-chip" disabled>${AXIS_LETTER[ax]} ${tier}/${upgradeTierMax} · ⏳</button>`;
      const cost = upgradeCost(u, ax, S.rmods), can = canUpgrade(S, u.id, ax);
      return `<button class="spec-chip" data-spec="${u.id}" data-spec-axis="${ax}" ${can ? "" : "disabled"}>${AXIS_LETTER[ax]} ${tier}/${upgradeTierMax} · ${money(cost)}</button>`;
    }).join("");
    return `<div class="spec-row"><div class="spec-nm">${u.name}<small class="faint">${u.tech}</small></div><div class="spec-chips">${chips}</div></div>`;
  }).join("") || `<p class="faint">No thermal plants to upgrade.</p>`;

  // --- builds: SURFACED only (committing is a quarter-review action) ---
  const buildRows = sum.builds.length
    ? sum.builds.map(b => {
        const spec = BUILDABLES[b.tech];
        return `<li><span>${spec ? spec.label : b.tech} · +${b.mw} MW</span><span class="faint">${b.quartersLeft}Q left</span></li>`;
      }).join("")
    : `<li class="faint">No construction in flight — commit new plants at the quarter review.</li>`;

  $("vignette").style.opacity = "0";
  $("brief").innerHTML = `
    <div class="brief-panel">
      <div class="pl-kicker">Daily Brief</div>
      <h2>${quarterLabel(S)}</h2>
      <p class="pl-lead">Review the day and set the rolling queues. <b>Advance</b> to fast-forward quiet
        days — the brief snaps back the moment a job lands or the grid tightens. New plants are still
        committed at the quarter-end review.</p>

      <div class="brief-cols">
        <div class="brief-col">
          <h3>Overnight</h3><ul class="bq-list">${recap}</ul>
          ${alerts}
          <h3>Demand &amp; forecast</h3>${demandStats}
        </div>
        <div class="brief-col">
          <h3>Maintenance queue</h3><ul class="bq-list">${maintRows}</ul>
          <h3>Upgrade queue</h3><ul class="bq-list">${upRows}</ul>
          <h3>In construction</h3><ul class="bq-list">${buildRows}</ul>
        </div>
      </div>

      <div class="pl-section">
        <h3>Queue maintenance <small class="faint">— a crew works it over the next few days</small></h3>
        <div class="tri-list">${triageRows}</div>
      </div>
      <div class="pl-section">
        <h3>Queue an upgrade <small class="faint">— the contractor line, parallel to crews</small></h3>
        <div class="dev-col">${specRows}</div>
      </div>

      <div class="end-btns brief-btns">
        <button class="btn-primary" id="briefAdvance">▶ Advance</button>
        <button id="briefStep">Step a day</button>
      </div>
    </div>`;
  $("briefOverlay").classList.add("on");

  // repopulate the crew select when the axis changes (on/off-trade hint tracks the axis)
  $("brief").querySelectorAll("[data-tri-axis]").forEach(sel => sel.onchange = () => {
    const id = sel.dataset.triAxis, crewSel = $("brief").querySelector(`[data-tri-crew="${id}"]`);
    if (crewSel) crewSel.innerHTML = crewOpts(sel.value) || `<option>— no free crew —</option>`;
  });
  $("brief").querySelectorAll("[data-tri-go]").forEach(b => b.onclick = () => {
    const id = b.dataset.triGo;
    const axis = $("brief").querySelector(`[data-tri-axis="${id}"]`)?.value;
    const crewId = $("brief").querySelector(`[data-tri-crew="${id}"]`)?.value;
    if (axis && crewId) actions.schedule(id, axis, crewId);
  });
  $("brief").querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => actions.cancelTask(b.dataset.cancel));
  $("brief").querySelectorAll("[data-spec]").forEach(b => b.onclick = () => actions.specialize(b.dataset.spec, b.dataset.specAxis));
  $("briefAdvance").onclick = actions.advance;
  $("briefStep").onclick = actions.step;
}
export function hideBrief(){ $("briefOverlay").classList.remove("on"); $("vignette").style.opacity = "0"; }

// v5.1 Phase 7: the per-plant upgrade DRILL-DOWN — opened from a firm/gas plant's ⚙. Shows the
// plant's four 9-tier axis ladders (current tier · live KPI vs attainable cap · next-tier cost +
// ETA), with queue-upgrade buttons routing to the contractor line (reflected in the brief + the
// Development Office). Re-renders in place after a queue so it stays open on the same plant.
const AXIS_NAME = { reliability: "Reliability", efficiency: "Efficiency", output: "Output", flexibility: "Flexibility" };
export function renderPlantDetail(S, unitId, actions){
  const u = S.fleet.find(x => x.id === unitId);
  if (!u || !u.tiers){ hidePlantDetail(); return; }
  const tierMax = upgradeTierMax, lead = CFG.v5_1.upgrade.leadDays;
  const ladders = AXES.map(ax => {
    const tier = u.tiers[ax] ?? 0;
    const queued = (S.contractor || []).some(j => j.unitId === u.id && j.axis === ax);
    const pips = Array.from({ length: tierMax }, (_, i) => {
      const n = i + 1;
      const cls = n <= tier ? "on" : (n === tier + 1 && queued ? "queued" : (n === tier + 1 ? "next" : ""));
      return `<i class="pd-pip ${cls}"></i>`;
    }).join("");
    const now = u.kpis ? Math.round(u.kpis[ax]) : null, cap = Math.round(axisTierValue(tier));
    let btn;
    if (tier >= tierMax) btn = `<button class="pd-buy" disabled>Max · cap ${cap}</button>`;
    else if (queued) btn = `<button class="pd-buy" disabled>⏳ queued → tier ${tier + 1}</button>`;
    else {
      const cost = upgradeCost(u, ax, S.rmods), can = canUpgrade(S, u.id, ax);
      btn = `<button class="pd-buy" data-spec="${u.id}" data-spec-axis="${ax}" ${can ? "" : "disabled"}
        title="tier ${tier} → ${tier + 1}: cap ${cap} → ${Math.round(axisTierValue(tier + 1))}, ${lead}d lead">Upgrade · ${money(cost)} · ${lead}d</button>`;
    }
    return `<div class="pd-ladder">
      <div class="pd-axis"><b>${AXIS_NAME[ax] || ax}</b><span class="faint">tier ${tier}/${tierMax}${now != null ? ` · now ${now} / cap ${cap}` : ""}</span></div>
      <div class="pd-pips" aria-hidden="true">${pips}</div>
      ${btn}
    </div>`;
  }).join("");
  const myJobs = (S.contractor || []).filter(j => j.unitId === u.id);
  const queueBlock = myJobs.length
    ? `<div class="pd-queue"><h4>In the contractor queue</h4><ul>${myJobs.map(j =>
        `<li><span>${AXIS_NAME[j.axis] || j.axis} → tier ${j.toTier}</span><span class="faint">${Math.ceil(j.daysLeft)}d left</span></li>`).join("")}</ul></div>`
    : "";

  $("plantDetail").innerHTML = `
    <div class="pd">
      <div class="pd-top">
        <div class="pl-kicker">Plant Upgrades</div>
        <h2>${u.name}</h2>
        <p class="pd-sub">${cap(u.tech)} · ${Math.round(u.cap)} MW · ${u.kind}${u.condition != null ? ` · condition ${Math.round(u.condition)}%` : ""}</p>
        <p class="pd-note faint">Upgrades raise the attainable <b>cap</b> each axis restores toward — you pay to <em>wait</em> for a higher ceiling (rolling contractor line, own labor), not to have it instantly; maintenance fights the decay below it.</p>
      </div>
      <div class="pd-ladders">${ladders}</div>
      ${queueBlock}
      <button class="btn-primary" id="pdClose">Close</button>
    </div>`;
  $("plantDetail").querySelectorAll("[data-spec]").forEach(b => b.onclick = () => actions.upgrade(b.dataset.spec, b.dataset.specAxis));
  $("pdClose").onclick = actions.close;
  $("plantOverlay").classList.add("on");
}
export function hidePlantDetail(){ $("plantOverlay").classList.remove("on"); }

// ---- progression screen (between runs): two tabs — passive Skills, and the
// Research Unlocks that open in-run research branches. Tab state is module-level
// so buying something (which re-renders) keeps you on the current tab. ----
let metaTab = "skills";
export function renderMeta(profile, actions){
  const best = profile.best || {};
  const skillRows = SKILLS.map(sk => {
    const owned = profile.skills[sk.id] || 0, maxed = owned >= sk.max, cost = skillCost(sk, owned);
    const can = !maxed && profile.currency >= cost;
    const pips = Array.from({ length: sk.max }, (_, i) => `<span class="pip ${i < owned ? "on" : ""}"></span>`).join("");
    const btn = maxed ? `<button disabled>Maxed</button>` : `<button data-skill="${sk.id}" ${can ? "" : "disabled"}>${cost} ⚡</button>`;
    return `<div class="skill-row">
      <span class="sk-nm">${sk.name} <span class="pips">${pips}</span><br><small>${sk.desc}</small></span>${btn}</div>`;
  }).join("");
  const unlockRows = RESEARCH_UNLOCKS.map(u => {
    const owned = !!profile.researchUnlocked?.[u.id], can = !owned && profile.currency >= u.cost;
    const btn = owned ? `<button disabled>Unlocked ✓</button>` : `<button data-unlock="${u.id}" ${can ? "" : "disabled"}>${u.cost} ⚡</button>`;
    return `<div class="skill-row"><span class="sk-nm">${u.name}<br><small>${u.desc}</small></span>${btn}</div>`;
  }).join("");
  const economyRows = ECONOMY_UNLOCKS.map(u => {
    const owned = !!profile.economyUnlocked?.[u.id];
    const prereqMet = !u.prereq || !!profile.economyUnlocked?.[u.prereq];
    const can = !owned && prereqMet && profile.currency >= u.cost;
    const btn = owned ? `<button disabled>Unlocked ✓</button>`
      : !prereqMet ? `<button disabled>🔒 needs prior tier</button>`
      : `<button data-economy="${u.id}" ${can ? "" : "disabled"}>${u.cost} ⚡</button>`;
    return `<div class="skill-row"><span class="sk-nm">${u.name}<br><small>${u.desc}</small></span>${btn}</div>`;
  }).join("");
  const tab = metaTab === "research" ? "research" : metaTab === "economy" ? "economy" : "skills";
  const tabs = `<div class="meta-tabs">
    <button class="meta-tab ${tab === "skills" ? "on" : ""}" data-tab="skills">Skills</button>
    <button class="meta-tab ${tab === "research" ? "on" : ""}" data-tab="research">Research Unlocks</button>
    <button class="meta-tab ${tab === "economy" ? "on" : ""}" data-tab="economy">Economy</button></div>`;
  const body = tab === "research"
    ? `<p>Permanently open research branches for future runs. In-run research itself still resets each run.</p><div class="skill-list">${unlockRows}</div>`
    : tab === "economy"
    ? `<p>Bloom the Book's economy across runs — longer contracts, the capacity market, and named buyers.</p><div class="skill-list">${economyRows}</div>`
    : `<p>Permanent passive upgrades, bought with meta-currency earned at the end of each run.</p><div class="skill-list">${skillRows}</div>`;
  $("meta").innerHTML = `
    <h2>Progression</h2>
    <div class="meta-head"><span class="bank"><b>${profile.currency}</b> ⚡ banked</span>
      <span class="best">best: ${best.score || 0} pts · ${best.days || 0} days · ${best.peak || 0} MW</span></div>
    ${tabs}
    ${body}
    <button class="btn-primary" id="metaBack">← Back</button>`;
  $("meta").querySelectorAll("[data-skill]").forEach(b => b.onclick = () => actions.buy(b.dataset.skill));
  $("meta").querySelectorAll("[data-unlock]").forEach(b => b.onclick = () => actions.unlock(b.dataset.unlock));
  $("meta").querySelectorAll("[data-economy]").forEach(b => b.onclick = () => actions.economy(b.dataset.economy));
  $("meta").querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { metaTab = b.dataset.tab; renderMeta(profile, actions); });
  $("metaBack").onclick = actions.back;
  $("metaOverlay").classList.add("on");
}
export function hideMeta(){ $("metaOverlay").classList.remove("on"); }

// ---- home screen (the front door: start a run, open skills, how-to) ----
export function renderHome(profile, actions){
  const best = profile.best || {};
  const rec = profile.records || {};
  const standing = Math.round(profile.credit?.standing ?? 70);
  const firstRun = !(best.days > 0);
  // career stats from the four score tracks + the carried credit standing
  const stat = (b, s) => `<div class="hs"><b>${b}</b><small>${s}</small></div>`;
  const stats = [
    stat(`${profile.currency || 0} ⚡`, "banked"),
    stat(best.days || 0, "best days"),
    stat(money(rec.netWorth?.value || 0), "best net worth"),
    stat(`${Math.round((rec.cleanShare?.value || 0) * 100)}%`, "best clean share"),
    stat(`${gradeFor(standing)}`, "credit standing"),
  ].join("");
  $("home").innerHTML = `
    <div class="home-hero">
      <div class="home-kicker">The Book</div>
      <h1 class="home-title">Grid Operator</h1>
      <p class="home-tag">Run a city's grid in real time — ride the evening peak, keep the lights on,
        and run the utility as a business: hedge your output on a live market, borrow to grow,
        and live or die by both the grid <em>and</em> the ledger.</p>
    </div>
    <button class="btn-primary home-start" id="homeStart">${firstRun ? "Start your first shift ▸" : "Start run ▸"}</button>
    <div class="home-stats">${stats}</div>
    <p class="home-foot">Each run is a finite contract. Survive it to win; earn ⚡ across four tracks —
      longevity, net worth, clean share, spot trading — to grow permanently stronger.</p>
    <div class="home-btns">
      <button id="homeSkills">Skills &amp; unlocks ⚡</button>
      <button id="homeHowto">How to play</button>
    </div>`;
  $("homeStart").onclick = actions.start;
  $("homeSkills").onclick = actions.skills;
  $("homeHowto").onclick = actions.howto;
  $("homeOverlay").classList.add("on");
}

// v5.1 Phase 2: the grid-collapse end screen. The stability bar topped out → the run is
// over; show a terse post-mortem and the roguelite restart (profile carries over). Phase 7
// gives it the full run-summary treatment; this is the minimal wire.
export function renderCollapse(S, actions){
  const days = Math.max(0, (S.day ?? 1) - (S.runStartDay ?? 1) + 1);
  const yr = S.calendar?.year ?? 1, q = S.calendar?.quarter ?? 1;
  const stat = (b, s) => `<div class="hs"><b>${b}</b><small>${s}</small></div>`;
  $("collapse").innerHTML = `
    <div class="home-hero">
      <div class="home-kicker" style="color:var(--bad)">Grid Collapse</div>
      <h1 class="home-title">The lights went out.</h1>
      <p class="home-tag">The grid's stability reserve ran dry — a sustained shortfall you couldn't
        claw back from. C.A.S.S. has filed the incident. Your banked ⚡, skills and records carry
        to the next operator.</p>
    </div>
    <div class="home-stats">${[
      stat(days, "days survived"),
      stat(`Y${yr} · Q${q}`, "reached"),
      stat(money(S.peakNetWorth ?? S.cash ?? 0), "peak net worth"),
    ].join("")}</div>
    <button class="btn-primary home-start" id="collapseRestart">Take a new posting ▸</button>`;
  $("collapseRestart").onclick = actions.restart;
  $("collapseOverlay").classList.add("on");
}
export function hideCollapse(){ $("collapseOverlay").classList.remove("on"); }

// ============================================================
// MANAGE MODE (v4, Phase A) — hub-and-spoke. Pausing opens a landing hub with
// four dedicated pages (Fleet / Build / Research / Desk). `page` routing lives in
// main.js; this file only paints the requested page. View-only sort/tab state is
// module-level (like metaTab) so an action re-render keeps the player in place.
// ============================================================
let fleetSort = { col: "attention", dir: 1 };
let deskTab = "contracts";

const PAGE_TITLES = { hub: "Grid control", fleet: "Fleet", build: "Build capacity", research: "Research & R&D", desk: "The Desk" };

export function renderManage(S, page, actions){
  const body = page === "fleet" ? fleetBody(S)
    : page === "build" ? buildBody(S)
    : page === "research" ? researchBody(S)
    : page === "desk" ? deskBody(S)
    : hubBody(S);
  const head = page === "hub"
    ? `<span class="page-title">${PAGE_TITLES.hub}</span>`
    : `<button class="page-back" id="pgBack">← Hub</button><span class="page-title">${PAGE_TITLES[page] || ""}</span>`;
  const el = $("menu");
  el.classList.add("page");
  el.innerHTML = `
    <div class="page-head">${head}</div>
    <div class="page-body">${body}</div>
    <div class="page-foot"><button class="btn-primary" id="pgResume">Resume shift ▸</button></div>`;
  const back = $("pgBack"); if (back) back.onclick = () => actions.go("hub");
  $("pgResume").onclick = () => actions.close();
  if (page === "fleet") wireFleet(S, actions);
  else if (page === "research") wireResearch(S, actions); // v5 Phase 5: the Build page is read-only (commit at the quarter review)
  else if (page === "desk") wireDesk(S, actions);
  else $("menu").querySelectorAll("[data-go]").forEach(b => b.onclick = () => actions.go(b.dataset.go)); // hub
  $("menuOverlay").classList.add("on");
}
export function hideManage(){ $("menuOverlay").classList.remove("on"); }

// --- hub: at-a-glance scorecard + navigation out. Greyed tiles (net worth, debt,
//     credit) are reserved for the Phase D stats data model. ---
function hubBody(S){
  const nav = [
    ["fleet", "Fleet", "Service · upgrade · sell"],
    ["build", "Build", "Add capacity"],
    ["research", "Research", "Tech tree & R&D lab"],
    ["desk", "Desk", "Contracts & financing"],
  ].map(([id, label, sub], i) => `<button data-go="${id}"><span class="nav-nm">${i + 1}. ${label}</span><span class="sub">${sub}</span></button>`).join("");
  const netWorth = S.cash - (S.debt || 0); // v4 (§1.5): cash − debt
  const grade = gradeFor(S.credit ?? 70);
  const tiles = [
    ["Day", S.day, false], ["Peak", S.peak + " MW", false], ["Cash", money(S.cash), false],
    ["Net worth", money(netWorth), false], ["Debt", (S.debt || 0) > 0 ? money(S.debt) : "—", false],
    ["Credit", `${grade} · ${Math.round(S.credit ?? 70)}`, false],
    ["RP banked", Math.floor(S.rp || 0), false],
  ].map(([k, v, ph]) => `<div class="hub-tile${ph ? " placeholder" : ""}"><b>${v}</b><small>${k}</small></div>`).join("");
  return `<div class="hub-nav">${nav}</div><div class="hub-stats">${tiles}</div>${recordsStrip(S)}`;
}

// --- v4 (D): the four scored tracks — this run's live value vs the all-time best.
//     Reads the read-only records mirror main.js stashes on S (never mutated). ---
function recordsStrip(S){
  const live = scoreTracks(S), best = S.bestRecords || {};
  const fmt = (id, v) => id === "netWorth" || id === "spotKill" ? money(v)
    : id === "cleanShare" ? Math.round(v * 100) + "%"
    : Math.round(v) + (id === "longevity" ? "d" : "");
  const rows = SCORE_TRACKS.map(tr => {
    const b = best[tr.id]?.value || 0;
    return `<div class="rec-tile"><small>${tr.label}</small><b>${fmt(tr.id, live[tr.id] || 0)}</b><span class="faint">best ${fmt(tr.id, b)}</span></div>`;
  }).join("");
  return `<div class="rec-head">Scored tracks — this run vs best</div><div class="rec-grid">${rows}</div>`;
}

// --- fleet: the dense, sortable table that replaces the old card list ---
function fleetRow(S, u){
  let stClass, stText;
  if (u.status === "maint"){ stClass = "st-service"; stText = "⚙ MAINT"; }
  else if (u.status === "strained"){ stClass = "st-strained"; stText = "⚠ STRAINING"; }
  else if (u.status === "online" || u.status === "discharge"){ stClass = "st-online"; stText = u.kind === "battery" ? "DISCHARGE" : "ONLINE"; }
  else if (u.status === "starting"){ stClass = "st-starting"; stText = "STARTING"; }
  else if (u.status === "tripped"){ stClass = "st-tripped"; stText = "TRIPPED"; }
  else { stClass = "st-off"; stText = u.kind === "renew" ? "IDLE" : "RESERVE"; }
  const out = Math.round(unitOutput(S, u));
  const cond = u.kpis
    ? kpiClusterStatic(u.kpis)
    : `<span class="faint">—</span>`;
  // v5 Phase 7: the Mk upgrade button is retired — plant specialization (per-axis caps)
  // lives in the quarter-end Development Office.
  // v5 Phase 4: maintenance is scheduled in the quarter-end Planning Office, not here;
  // a plant booked for the shop shows a MAINT flag instead of a mid-quarter service button.
  const maintFlag = u.maintDown ? `<span class="svc-flag">⚙ booked</span>` : "";
  const lastBattery = u.kind === "battery" && S.fleet.filter(x => x.kind === "battery").length <= 1;
  const decBtn = `<button class="dec" data-dec="${u.id}" ${lastBattery ? "disabled" : ""}>Sell · ${money(salvageValue(u))}</button>`;
  const main = `<tr>
    <td class="fl-nm">${u.name}<br><small class="faint">${Math.round(u.cap)} MW · ${u.kind}</small></td>
    <td><span class="st ${stClass}">${stText}</span></td>
    <td class="num">${out}/${u.cap}</td>
    <td class="num">${cond}</td>
    <td><div class="fleet-acts">${maintFlag}${decBtn}</div></td></tr>`;
  return main + dialsRow(S, u);
}

// v5.3 Phase 1: the ONLY dispatch lever left is COMMIT (on/off), as a sub-row under a
// dial-able thermal unit's fleet row. Commit arms the plant online or stands it down to
// reserve; a committed unit offers its FULL available capacity (Option 1 price-taking —
// the old output band / reserve hold / push throttles are retired). Lives in the paused
// Manage view; the note shows the MW it offers when online.
function dialsRow(S, u){
  if (u.kind !== "firm" && u.kind !== "gas") return "";
  const committed = !!(u.dials && u.dials.commit);
  const offer = committed ? `offers ${Math.round(applyDials(u).max)} MW` : "offline";
  return `<tr class="dials-row"><td colspan="5"><div class="dials">
    <button class="dial-commit${committed ? " on" : ""}" data-commit="${u.id}">${committed ? "● Committed" : "○ Reserve"}</button>
    <span class="dial-note" data-note="${u.id}">${offer}</span>
  </div></td></tr>`;
}
function fleetBody(S){
  // v5.1 Phase 4: maintenance is ROLLING — queued from the board review and worked by a
  // crew over a few days, independent of the quarter. A short note points the player there.
  const svcNote = `<p class="svc-note faint">⚙ Maintenance runs on a rolling schedule — queue a plant at the board review and a crew works it over the next few days.</p>`;
  const cmp = makeFleetComparator(fleetSort.col, fleetSort.dir, u => unitOutput(S, u));
  const rows = [...S.fleet].sort(cmp).map(u => fleetRow(S, u)).join("");
  const arr = c => fleetSort.col === c ? (fleetSort.dir > 0 ? " ▲" : " ▼") : "";
  return `${svcNote}<table class="fleet"><thead><tr>
    <th data-sort="name">Plant${arr("name")}</th>
    <th data-sort="status">Status${arr("status")}</th>
    <th class="num" data-sort="output">Output${arr("output")}</th>
    <th data-sort="condition">Health${arr("condition")}</th>
    <th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function wireFleet(S, actions){
  const m = $("menu");
  m.querySelectorAll("[data-dec]").forEach(b => b.onclick = () => actions.decommission(b.dataset.dec));
  // v5.3 Phase 1: commit is the only dispatch lever; toggling it re-renders the row.
  m.querySelectorAll("[data-commit]").forEach(b => b.onclick = () => actions.commit(b.dataset.commit));
  m.querySelectorAll("th[data-sort]").forEach(th => th.onclick = () => {
    const c = th.dataset.sort;
    if (fleetSort.col === c) fleetSort.dir = -fleetSort.dir; else fleetSort = { col: c, dir: 1 };
    renderManage(S, "fleet", actions);
  });
}

// --- build: the capacity catalogue (research-gated options show a lock) ---
// v5 Phase 5: building is now a quarter-end capital commitment (Planning Office), so the
// Manage ▸ Build page is a read-only pipeline + forecast view — it shows what's in flight
// and when the city will outgrow the fleet, and points commitment to the board review.
function buildBody(S){
  const cap = capacityPicture(S), short = shortfallHorizon(S);
  const builds = S.builds || [];
  const fc = [1, 2, 4].map(q => {
    const d = forecastDemand(S, q), covered = d <= cap.total;
    return `<div class="rec-tile"><small>Q+${q} peak</small><b class="${covered ? "" : "short"}">${d} MW</b><span class="faint">cap ${cap.total}</span></div>`;
  }).join("");
  const queue = builds.length
    ? builds.map(b => {
        const spec = BUILDABLES[b.tech], slipPct = Math.round((b.slipRisk || 0) * 100);
        return `<div class="rs-row"><span class="rs-nm">${spec ? spec.label : b.tech} · +${b.mw} MW<br><small>${b.quartersLeft}Q left${slipPct ? ` · slip ${slipPct}%` : ""}${b.slips ? ` · slipped ${b.slips}×` : ""}</small></span></div>`;
      }).join("")
    : `<p class="faint" style="margin:6px 0">No projects in flight.</p>`;
  const cat = BUILD_ORDER.filter(t => BUILDABLES[t]).map(t => {
    const spec = BUILDABLES[t], gate = BUILD_GATE[t], locked = gate && !(S.rmods?.[gate]);
    return `<div class="rec-tile${locked ? " placeholder" : ""}"><small>+${spec.mw} ${spec.label}</small><b>${spec.leadQuarters}Q</b><span class="faint">${locked ? "🔒 research" : money(spec.cost)}</span></div>`;
  }).join("");
  // v5: building is committed at the quarter-end board review, not here. Spell that
  // out loudly with a live countdown so this read-only page never reads as broken.
  const toReview = CFG.v5.daysPerQuarter - S.calendar.dayInQuarter;
  const when = toReview <= 0
    ? "at the end of <b>today</b>"
    : `in <b>${toReview} day${toReview === 1 ? "" : "s"}</b> (Day ${S.calendar.dayInQuarter}/${CFG.v5.daysPerQuarter})`;
  return `<div class="build-banner">🏗 <b>This page is read-only.</b> New plants are committed at the <b>quarter-end board review</b> — the next one opens ${when}. Finish the quarter to build.</div>
    <div class="menu-cash">On hand <b>${money(S.cash)}</b> · capacity incl. in-flight <b>${cap.total} MW</b></div>
    ${short ? `<p class="svc-note">⚠ Forecast peak outgrows your capacity in Q+${short} — line up a project for the quarter-end review.</p>`
             : `<p class="svc-note faint">⚙ Multi-quarter lead time: a plant you commit at the review takes several quarters to come online.</p>`}
    <h4 class="bld-h">Demand forecast vs capacity</h4><div class="rec-grid">${fc}</div>
    <h4 class="bld-h">In flight</h4>${queue}
    <h4 class="bld-h">Buildable at the review (lead time · cost)</h4><div class="rec-grid">${cat}</div>`;
}

// --- research: the v3 R&D lab lever + tech tree (unchanged logic) ---
function researchBody(S){
  const rpRate = (S.rdFunding || 0) * CFG.rpPerDollar;
  const rsRows = RESEARCH.map(n => {
    const owned = !!S.research?.[n.id], can = canResearch(S, n.id);
    const locked = n.metaGate && !(S.researchUnlocked?.[n.metaGate]);
    const btn = owned ? `<button disabled>Researched</button>`
      : locked ? `<button disabled title="Unlock this branch in Skills with meta-currency">🔒</button>`
      : `<button data-research="${n.id}" ${can ? "" : "disabled"}>${n.rpCost} RP</button>`;
    const sub = locked ? `${n.desc} <span class="rs-lock">· unlock in Skills</span>` : n.desc;
    return `<div class="rs-row ${owned ? "done" : ""} ${locked ? "locked" : ""}"><span class="rs-nm">${n.label}<br><small>${sub}</small></span>${btn}</div>`;
  }).join("");
  return `
    <div class="rd-head"><span class="rd-bank"><b>${Math.floor(S.rp || 0)}</b> RP banked</span>
      <span id="rdReadout">R&amp;D funding <b>${money(S.rdFunding || 0)}</b>/h → +${rpRate.toFixed(1)} RP/h</span></div>
    <input type="range" id="rdFunding" class="rd-slider" min="0" max="${CFG.rdFundingMax}" step="500" value="${S.rdFunding || 0}">
    <div class="rs-list">${rsRows}</div>`;
}
function wireResearch(S, actions){
  const m = $("menu");
  m.querySelectorAll("[data-research]").forEach(b => b.onclick = () => actions.research(b.dataset.research));
  const rd = $("rdFunding");
  if (rd) rd.oninput = () => {
    const v = Number(rd.value);
    actions.setFunding(v); // persist to state; readout updates in-place (keeps slider drag)
    $("rdReadout").innerHTML = `R&amp;D funding <b>${money(v)}</b>/h → +${(v * CFG.rpPerDollar).toFixed(1)} RP/h`;
  };
}

function wireDesk(S, actions){
  const m = $("menu");
  // tab switch
  m.querySelectorAll("[data-desk]").forEach(b => b.onclick = () => { deskTab = b.dataset.desk; renderManage(S, "desk", actions); });
  // hedge dial: update state + MW readout in-place (so the drag survives, like R&D)
  const hr = $("hedgeRange");
  if (hr) hr.oninput = () => {
    const frac = Number(hr.value) / 100;
    actions.setHedge(frac);
    const dialMW = Math.round(frac * expectedOutput(S.peak));
    const ro = $("hedgeReadout"); if (ro) ro.textContent = `${dialMW} MW`;
  };
  // term buttons add a hedge leg to the book, then re-render the list
  m.querySelectorAll("[data-term]").forEach(b => b.onclick = () => actions.hedge(Number(b.dataset.term)));
  // ✕ cancels a single standing contract (hedge leg or accepted offer)
  m.querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => actions.cancelContract(b.dataset.cancel));
  // financing: borrow / repay preset amounts
  m.querySelectorAll("[data-borrow]").forEach(b => b.onclick = () => actions.borrow(Number(b.dataset.borrow)));
  m.querySelectorAll("[data-repay]").forEach(b => b.onclick = () => actions.repay(Number(b.dataset.repay)));
  // capacity market: take / drop an obligation
  m.querySelectorAll("[data-cap]").forEach(b => b.onclick = () => b.dataset.cap === "take" ? actions.takeCapacity() : actions.dropCapacity());
  // special offer: accept / decline
  m.querySelectorAll("[data-offer]").forEach(b => b.onclick = () => b.dataset.offer === "accept" ? actions.accept() : actions.decline());
}

// --- desk: the economy route. Contracts filled by Phase B; Financing by Phase C. ---
function deskBody(S){
  const tabs = `<div class="meta-tabs">
    <button class="meta-tab ${deskTab === "contracts" ? "on" : ""}" data-desk="contracts">Contracts</button>
    <button class="meta-tab ${deskTab === "financing" ? "on" : ""}" data-desk="financing">Financing</button></div>`;
  if (deskTab === "financing") return tabs + financingBody(S);
  return tabs + contractsBody(S);
}

// Financing tab: credit rating (grade/rate/ceiling), debt, and borrow/repay. The
// interest rate is per game-day; borrowing is capped at the credit ceiling.
function financingBody(S){
  const credit = S.credit ?? CFG.creditStart;
  const { grade, rate, ceiling } = creditRating(credit);
  const headroom = debtCapacity(S);
  const netWorth = S.cash - (S.debt || 0);
  const amounts = [20000, 50000, 100000];
  const borrowBtns = amounts.map(a =>
    `<button class="fin-btn" data-borrow="${a}" ${headroom >= a ? "" : "disabled"}>+${money(a)}</button>`).join("");
  const repayBtns = amounts.map(a =>
    `<button class="fin-btn" data-repay="${a}" ${(S.debt || 0) > 0 && S.cash >= Math.min(a, S.debt) ? "" : "disabled"}>−${money(a)}</button>`).join("");
  const defaultNote = S.defaulted
    ? `<p class="fin-default">⚠ In default this run — ceiling capped, rates elevated. Stay solvent to rebuild.</p>` : "";
  return `
    <div class="fin-grid">
      <div class="fin-cell"><small>Credit</small><b>${grade}</b><span class="faint">${Math.round(credit)}/100</span></div>
      <div class="fin-cell"><small>Interest</small><b>${(rate * 100).toFixed(1)}%</b><span class="faint">/day on debt</span></div>
      <div class="fin-cell"><small>Debt</small><b>${money(S.debt || 0)}</b><span class="faint">of ${money(ceiling)}</span></div>
      <div class="fin-cell"><small>Net worth</small><b style="color:${netWorth < 0 ? "var(--bad)" : "var(--fg)"}">${money(netWorth)}</b><span class="faint">cash − debt</span></div>
    </div>
    ${defaultNote}
    <div class="term-row"><span class="k">Borrow</span>${borrowBtns}<span class="faint tiny">headroom ${money(headroom)}</span></div>
    <div class="term-row"><span class="k">Repay</span>${repayBtns}</div>
    <p class="faint tiny">Debt is cash now for interest forever — the fixed cost your contract floor must beat. Go insolvent with debt and you default; stay under too long and the utility goes bankrupt.</p>
    ${capacityBlock(S)}`;
}

// Capacity market (Phase F) — only when the economy unlock is owned. Shows the
// active obligation (or an offer to take one) with its availability pay + breach risk.
function capacityBlock(S){
  if (!(S.economyUnlocked && S.economyUnlocked["capacity-market"])) return "";
  const o = S.capacityObligation;
  if (o){
    return `<h3 class="ct-h">Capacity obligation</h3>
      <div class="fin-grid">
        <div class="fin-cell"><small>Reserve</small><b>${o.reserveMW} MW</b><span class="faint">pledged</span></div>
        <div class="fin-cell"><small>Pays</small><b>$${o.pricePerMW}</b><span class="faint">/MW/day</span></div>
        <div class="fin-cell"><small>Term left</small><b>${o.daysLeft}d</b><span class="faint">${o.calledToday ? "called today" : "no call yet"}</span></div>
        <div class="fin-cell"><small>Breach fine</small><b>$${CFG.capacity.penaltyPerMw}</b><span class="faint">/MW short</span></div>
      </div>
      <div class="term-row"><button class="fin-btn" data-cap="drop">End obligation</button><span class="faint tiny">keep ${o.reserveMW} MW firm & deliverable or risk the fine</span></div>`;
  }
  return `<h3 class="ct-h">Capacity market</h3>
    <p class="faint tiny">Pledge firm reserve for a daily availability payment — but a call that finds you short draws a recoverable fine.</p>
    <div class="term-row"><button class="fin-btn" data-cap="take">Take a capacity obligation (~40% of firm, 4d)</button></div>`;
}

// Contracts tab: the hedge dial (commit a slice of expected output), term choice,
// a live price/volume preview, and the list of standing contracts.
function contractsBody(S){
  const hedge = S.hedge ?? CFG.hedgeDefault;
  const expMW = expectedOutput(S.peak);
  const dialMW = Math.round(hedge * expMW);
  const baseline = dailyBaseline(S.day);
  const terms = [];
  for (let t = CFG.contractTermMin; t <= CFG.contractTermMax; t++) terms.push(t);
  const termBtns = terms.map(t =>
    `<button class="term-btn" data-term="${t}">${t}d · $${contractPrice(baseline, t)}</button>`).join("");

  const bookMW = (S.contracts || []).reduce((a, c) => a + (c.mw || 0), 0);
  const rows = (S.contracts || []).length
    ? `<table class="fleet ct-table"><thead><tr><th>Source</th><th>MW</th><th>$/MWh</th><th>Days left</th><th></th></tr></thead><tbody>` +
      S.contracts.map(c => `<tr><td>${c.origin === "dial" ? "Hedge" : (c.buyer || "Offer")}</td><td>${Math.round(c.mw)}</td><td>$${c.price}</td><td>${c.remaining}</td><td><button class="ct-cancel" data-cancel="${c.id}" title="Cancel this contract">✕</button></td></tr>`).join("") +
      `<tr class="ct-total"><td>Total locked</td><td>${Math.round(bookMW)}</td><td colspan="3"></td></tr>` +
      `</tbody></table>`
    : `<p class="faint">No contracts — all served load clears at spot ($${Math.round(S.spot || 0)}/MWh now).</p>`;

  // Phase F: a named-buyer special offer, if one is on the table (Rolodex unlock).
  let offerCard = "";
  if (S.pendingOffer){
    const o = S.pendingOffer, price = Math.round(contractPrice(baseline, o.termDays) * (o.priceMult ?? 1));
    offerCard = `<div class="offer-card">
      <div class="offer-lead">☎ <b>${o.buyerName}</b> offers <b>${o.mw} MW</b> at <b>$${price}/MWh</b> for <b>${o.termDays} days</b>
        <span class="faint">(${o.priceMult >= 1 ? "+" : ""}${Math.round((o.priceMult - 1) * 100)}% vs standard · expires day ${o.expiresDay})</span></div>
      <div class="term-row"><button class="term-btn offer-yes" data-offer="accept">Accept</button><button class="term-btn" data-offer="decline">Decline</button></div>
    </div>`;
  }
  return `
    ${offerCard}
    <p class="desk-lead">Lock a block of your output at a fixed price to hedge the live spot market.
      The rest of your served load clears at <b>spot</b> ($${Math.round(S.spot || 0)}/MWh now, baseline $${Math.round(baseline)}).</p>
    <div class="hedge-dial">
      <label>Hedge dial — commit <b id="hedgeReadout">${dialMW} MW</b> (${Math.round(hedge * 100)}% of ~${expMW} MW expected)</label>
      <input type="range" id="hedgeRange" min="0" max="100" step="5" value="${Math.round(hedge * 100)}" />
    </div>
    <div class="term-row"><span class="k">Sign a hedge leg for:</span>${termBtns}</div>
    <p class="faint tiny">Each signing <b>adds</b> a leg to your book (ladder up to ${CFG.hedgeMaxContracts}). Longer terms lock a better rate; cancel any leg with ✕.</p>
    <h3 class="ct-h">Standing contracts</h3>
    ${rows}`;
}

