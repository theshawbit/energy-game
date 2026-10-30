// ============================================================
// LIVE RENDER — paints the DOM/canvas from state `S`. Pure view: never
// mutates S. Player actions are delegated to callbacks passed in from main.js
// (onToggle, onRestart), so this file imports no action logic.
// ============================================================
import { unitOutput, clamp } from "./sim.js";
import { quarterLabel } from "./calendar.js";
import { applyDials } from "./dispatch.js";
import { CFG, BUILD, BUILD_ORDER, BUILD_GATE, UPGRADE, upgradeCost, serviceCost, salvageValue } from "./config.js";
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
const roman = n => ["", "I", "II", "III", "IV", "V"][n] || String(n);

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
  $("s-sat").textContent = Math.round(S.satisfaction) + "%";
  $("s-sat").style.color = S.satisfaction > 70 ? css("--good") : S.satisfaction > 40 ? css("--warn") : css("--bad");
  $("s-co2").textContent = Math.round(S.co2);
  $("s-co2").style.color = S.co2 < 100 ? css("--good") : S.co2 < 450 ? css("--warn") : css("--bad");
  $("s-carbon").textContent = "$" + Math.round(S.carbon);
  $("s-carbon").style.color = S.carbon > 0 ? css("--warn") : css("--faint");

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
  // readout cadence — a brownout can't wait 200ms to show.
  $("vignette").style.opacity = S.over ? "1" : (S.brownout ? clamp(0.25 + S.strain / 100 * 0.7, 0, 0.95).toFixed(2) : "0");
  $("shakeTarget").classList.toggle("shake", S.brownout && !S.over && S.strain > 35);

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
}

// v4.2 CR-3: fleet as a bank of live instrument tiles. Built once per game
// (buildUnits) and patched each frame (updateUnits) — no per-frame DOM teardown,
// so hover/focus and click targets stay stable and the loop stays cheap. The tile
// reacts to state (glow/pulse/dim), carries a per-unit output sparkline, and the
// bank auto-reorders by urgency (shared attentionRank → same order as the Manage
// table). Reorder is done with CSS `order` so DOM nodes never move.
const unitEls = {};
let _unitOrder = "";               // last applied row order, to skip no-op reorders
// v4.2.4: the fleet is a live, dense MONITOR TABLE (was a card bank). One row per
// unit, built once per game and patched each frame. Status pills + the row accent
// update INSTANTLY (an alarm can't wait); the numeric MW / Condition / Load columns
// and the sub-note throttle with the readout cadence so renewable output doesn't
// strobe. Rows auto-sort by urgency (worst first, shared compareNeedsAttention) and
// controllable units (peakers / battery) are tappable rows that arm/fire. Condition
// and Load% are now visible at a glance — the two things the wear model made matter.
export function buildUnits(S, onToggle){
  _prevDemand = null; // new game — forget the previous run's last demand sample
  _unitOrder = "";
  _log.length = 0; _lastTicker = null; $("ticker").innerHTML = ""; // fresh annunciator log
  for (const k in unitEls) delete unitEls[k];
  const table = document.createElement("table");
  table.className = "fleet-live";
  table.innerHTML = `<thead><tr>
    <th>Plant</th><th>Status</th><th class="num">MW</th><th>Health</th><th class="num">Load</th>
  </tr></thead>`;
  const tb = document.createElement("tbody");
  for (const u of S.fleet){
    const tr = document.createElement("tr");
    tr.className = "fu" + (u.ctrl ? " ctrl" : "");
    const mk = (u.tier || 1) > 1 ? ` <span class="mk">Mk ${roman(u.tier)}</span>` : "";
    const key = u.ctrl && u.key ? `<span class="fkey" title="shortcut">${u.key}</span>` : "";
    const condCell = u.kpis
      ? kpiClusterLive()
      : `<span class="faint">—</span>`;
    tr.innerHTML = `
      <td class="fu-nm"><span class="nm">${u.name}${mk}</span>${key}<div class="fu-sub" data-sub>${Math.round(u.cap)} MW · ${u.kind}</div></td>
      <td><span class="st" data-st>—</span></td>
      <td class="num"><b data-out>0</b><span class="faint">/${Math.round(u.cap)}</span></td>
      <td class="num fu-cond">${condCell}</td>
      <td class="num"><span data-load>—</span></td>`;
    if (u.ctrl) tr.onclick = () => onToggle(u.id);
    tb.appendChild(tr);
    const kpi = {}, kpiq = {};
    tr.querySelectorAll("[data-k]").forEach(i => kpi[i.dataset.k] = i);
    tr.querySelectorAll("[data-kq]").forEach(q => kpiq[q.dataset.kq] = q);
    unitEls[u.id] = {
      el: tr, st: tr.querySelector("[data-st]"), out: tr.querySelector("[data-out]"),
      sub: tr.querySelector("[data-sub]"), kpi, kpiq, load: tr.querySelector("[data-load]"),
    };
  }
  table.appendChild(tb);
  const host = $("units"); host.innerHTML = ""; host.appendChild(table);
}
function updateUnits(S, tick = true){
  const fuelMult = S.mmods?.fuelMult ?? 1;
  for (const u of S.fleet){
    const refs = unitEls[u.id]; if (!refs) continue;
    const out = Math.round(unitOutput(S, u));
    // state → status pill + row accent class
    let stClass, stText, rowState;
    if (u.status === "service"){ stClass = "st-service"; stText = "SERVICE"; rowState = "service"; }
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
    else if (u.status === "service") sub = `maintenance · ${clock(Math.max(0, u.serviceTimer || 0))} left`;
    else if (u.status === "starting") sub = `spin-up · ${clock(Math.max(0, u.startTimer || 0))}`;
    else if (u.kind === "battery") sub = `charge ${Math.round(u.energy)}/${Math.round(u.maxEnergy * (S.rmods?.battEnergyMult ?? 1))} MWh${u.ctrl ? ` · tap ${u.key}` : ""}`;
    else if (u.kind === "renew") sub = `${Math.round(u.cap)} MW · $0/MWh`;
    else { const mc = Math.round(marginalCost(u.tech, S.carbon, fuelMult)); sub = u.ctrl ? `$${mc}/MWh · tap ${u.key} to ${u.status === "off" ? "start" : "stop"}` : `$${mc}/MWh base`; }
    if (refs.sub.textContent != sub) refs.sub.textContent = sub;
  }
  // auto-sort rows by urgency (worst first) — move <tr> nodes only when the order
  // actually changes (onclick travels with the node, so taps never retarget).
  const order = [...S.fleet].sort(compareNeedsAttention);
  const sig = order.map(u => u.id).join(",");
  if (sig !== _unitOrder){
    const tb = unitEls[order[0]?.id]?.el.parentNode;
    if (tb) order.forEach(u => { const r = unitEls[u.id]; if (r) tb.appendChild(r.el); });
    _unitOrder = sig;
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
export function renderPlanning(S, actions){
  const c = S.calendar;
  const closedQ = c.quarter === 1 ? CFG.v5.quartersPerYear : c.quarter - 1; // the quarter that just closed
  const closedY = c.quarter === 1 ? c.year - 1 : c.year;
  $("vignette").style.opacity = "0";
  $("modal").innerHTML = `
    <div class="planning">
      <div class="pl-kicker">Planning Office</div>
      <h2>Quarter Review</h2>
      <p class="pl-lead">Y${closedY} · Q${closedQ} has closed. The board review — the overlord's KPI
        verdict, maintenance triage, the build queue, research and ⚡ perks — arrives in a later phase.
        For now, the grid rolls on.</p>
      <ul class="pl-stats">
        <li><span>Day</span><span>${S.day}</span></li>
        <li><span>Peak demand</span><span>${S.peak} MW</span></li>
        <li><span>Cash</span><span>${money(S.cash)}</span></li>
        <li><span>Satisfaction</span><span>${Math.round(S.satisfaction)}%</span></li>
      </ul>
      <div class="end-btns">
        <button class="btn-primary" id="beginQ">Begin Y${c.year} · Q${c.quarter} ▸</button>
      </div>
    </div>`;
  $("overlay").classList.add("on");
  $("beginQ").onclick = actions.begin;
}

export function hidePlanning(){
  $("overlay").classList.remove("on");
  $("vignette").style.opacity = "0";
}

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
  else if (page === "build") $("menu").querySelectorAll("[data-build]").forEach(b => b.onclick = () => actions.build(b.dataset.build));
  else if (page === "research") wireResearch(S, actions);
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
    ["Satisfaction", Math.round(S.satisfaction) + "%", false], ["RP banked", Math.floor(S.rp || 0), false],
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
  const tier = u.tier || 1, mk = tier > 1 ? ` <span class="mk">Mk ${roman(tier)}</span>` : "";
  let stClass, stText;
  if (u.status === "service"){ stClass = "st-service"; stText = "SERVICE"; }
  else if (u.status === "strained"){ stClass = "st-strained"; stText = "⚠ STRAINING"; }
  else if (u.status === "online" || u.status === "discharge"){ stClass = "st-online"; stText = u.kind === "battery" ? "DISCHARGE" : "ONLINE"; }
  else if (u.status === "starting"){ stClass = "st-starting"; stText = "STARTING"; }
  else if (u.status === "tripped"){ stClass = "st-tripped"; stText = "TRIPPED"; }
  else { stClass = "st-off"; stText = u.kind === "renew" ? "IDLE" : "RESERVE"; }
  const out = Math.round(unitOutput(S, u));
  const cond = u.kpis
    ? kpiClusterStatic(u.kpis)
    : `<span class="faint">—</span>`;
  const max = tier >= UPGRADE.maxTier, uCost = upgradeCost(tier), canUp = !max && S.cash >= uCost;
  const upBtn = `<button data-up="${u.id}" ${canUp ? "" : "disabled"}>${max ? "Max" : `→ Mk ${roman(tier + 1)} · ${money(uCost)}`}</button>`;
  let svcBtn = "";
  if (u.condition != null){
    const inSvc = u.status === "service", sCost = Math.round(serviceCost(u) * (S.mods?.repairMult ?? 1)), canSvc = !inSvc && S.cash >= sCost;
    const overhaul = u.condition < CFG.tripOverhaul, svcLabel = overhaul ? "Overhaul" : "Service";
    svcBtn = `<button class="svc${overhaul ? " overhaul" : ""}" data-svc="${u.id}" ${canSvc ? "" : "disabled"}>${inSvc ? "In service…" : `${svcLabel} · ${money(sCost)}`}</button>`;
  }
  const lastBattery = u.kind === "battery" && S.fleet.filter(x => x.kind === "battery").length <= 1;
  const decBtn = `<button class="dec" data-dec="${u.id}" ${lastBattery ? "disabled" : ""}>Sell · ${money(salvageValue(u))}</button>`;
  const main = `<tr>
    <td class="fl-nm">${u.name}${mk}<br><small class="faint">${Math.round(u.cap)} MW · ${u.kind}</small></td>
    <td><span class="st ${stClass}">${stText}</span></td>
    <td class="num">${out}/${u.cap}</td>
    <td class="num">${cond}</td>
    <td><div class="fleet-acts">${upBtn}${svcBtn}${decBtn}</div></td></tr>`;
  return main + dialsRow(S, u);
}

// v5 Phase 2: the Core+ dials for a dial-able thermal unit (firm/gas), as a sub-row
// under its fleet row. Commit arms/stands it down; the band ceiling, reserve hold and
// push shape the offer the engine clears within. Lives in the paused Manage view so the
// sliders don't fight the live frame repaint; the readouts update in-place on drag.
function dialsRow(S, u){
  if (u.kind !== "firm" && u.kind !== "gas") return "";
  const d = u.dials || {}, o = applyDials(u);
  const committed = !!d.commit;
  const bandMax = Math.round(d.bandMax ?? u.cap);
  const holdPct = Math.round((d.reserveHold ?? 0) * 100);
  const pushPct = Math.round((d.push ?? 0) * 100);
  const bandNote = committed ? `offer ${Math.round(o.max)} · hold ${Math.round(o.held)} MW` : "offline";
  return `<tr class="dials-row"><td colspan="5"><div class="dials">
    <button class="dial-commit${committed ? " on" : ""}" data-commit="${u.id}">${committed ? "● Committed" : "○ Reserve"}</button>
    <label class="dial"><span class="dk">Band</span>
      <input type="range" min="0" max="${Math.round(u.cap)}" value="${bandMax}" data-dial="bandMax" data-id="${u.id}" ${committed ? "" : "disabled"}>
      <span class="dv" data-dv="bandMax-${u.id}">${bandMax} MW</span></label>
    <label class="dial"><span class="dk">Reserve hold</span>
      <input type="range" min="0" max="100" value="${holdPct}" data-dial="reserveHold" data-id="${u.id}" ${committed ? "" : "disabled"}>
      <span class="dv" data-dv="reserveHold-${u.id}">${holdPct}%</span></label>
    <label class="dial"><span class="dk">Push</span>
      <input type="range" min="0" max="100" value="${pushPct}" data-dial="push" data-id="${u.id}">
      <span class="dv" data-dv="push-${u.id}">${pushPct}%</span></label>
    <span class="dial-note" data-note="${u.id}">${bandNote}</span>
  </div></td></tr>`;
}
function fleetBody(S){
  const svcNote = S.mods?.autoServiceAt
    ? `<p class="svc-note">⚙ Service Manager active — auto-servicing worn plants below ${S.mods.autoServiceAt}%.</p>` : "";
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
  m.querySelectorAll("[data-up]").forEach(b => b.onclick = () => actions.upgrade(b.dataset.up));
  m.querySelectorAll("[data-svc]").forEach(b => b.onclick = () => actions.service(b.dataset.svc));
  m.querySelectorAll("[data-dec]").forEach(b => b.onclick = () => actions.decommission(b.dataset.dec));
  // v5 Phase 2 dials: commit re-renders (band/push enable toggles); the sliders write
  // u.dials and patch their readout in-place (no re-render, so the drag isn't interrupted).
  m.querySelectorAll("[data-commit]").forEach(b => b.onclick = () => actions.commit(b.dataset.commit));
  m.querySelectorAll("input[data-dial]").forEach(inp => inp.oninput = () => {
    const id = inp.dataset.id, key = inp.dataset.dial, raw = Number(inp.value);
    const val = (key === "reserveHold" || key === "push") ? raw / 100 : raw;
    actions.setDial(id, key, val);
    const dv = m.querySelector(`[data-dv="${key}-${id}"]`);
    if (dv) dv.textContent = (key === "bandMax") ? `${Math.round(val)} MW` : `${Math.round(raw)}%`;
    const u = S.fleet.find(x => x.id === id), note = m.querySelector(`[data-note="${id}"]`);
    if (u && note){ const o = applyDials(u); note.textContent = u.dials.commit ? `offer ${Math.round(o.max)} · hold ${Math.round(o.held)} MW` : "offline"; }
  });
  m.querySelectorAll("th[data-sort]").forEach(th => th.onclick = () => {
    const c = th.dataset.sort;
    if (fleetSort.col === c) fleetSort.dir = -fleetSort.dir; else fleetSort = { col: c, dir: 1 };
    renderManage(S, "fleet", actions);
  });
}

// --- build: the capacity catalogue (research-gated options show a lock) ---
function buildBody(S){
  const buildBtns = BUILD_ORDER.filter(t => BUILD[t]).map(t => {
    const b = BUILD[t], gate = BUILD_GATE[t], locked = gate && !(S.rmods?.[gate]);
    const can = !locked && S.cash >= b.cost;
    const right = locked ? `<span class="c lock">🔒 research</span>` : `<span class="c">${money(b.cost)}</span>`;
    return `<button data-build="${t}" ${can ? "" : "disabled"}>+${b.mw} MW ${b.label}${right}</button>`;
  }).join("");
  return `<div class="menu-cash">On hand <b>${money(S.cash)}</b></div><div class="build-grid">${buildBtns}</div>`;
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

// ---- mutator banner: the per-run conditions, painted once at run start (they
// don't change mid-run). Hidden when a run has no mutators. ----
export function renderMutatorBanner(S){
  const host = $("mutBanner"); if (!host) return;
  const ids = S.mutators || [];
  if (!ids.length){ host.style.display = "none"; host.innerHTML = ""; return; }
  host.style.display = "";
  host.innerHTML = `<span class="mut-lead">⚠ This run</span>` + ids.map(id => {
    const m = mutatorById(id); if (!m) return "";
    return `<span class="mut-chip"><b>${m.label}</b> — ${m.blurb}</span>`;
  }).join("");
}
