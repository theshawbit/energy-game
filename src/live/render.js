// ============================================================
// LIVE RENDER — paints the DOM/canvas from state `S`. Pure view: never
// mutates S. Player actions are delegated to callbacks passed in from main.js
// (onToggle, onRestart), so this file imports no action logic.
// ============================================================
import { unitOutput, clamp } from "./sim.js";
import { CFG, BUILD, BUILD_ORDER, BUILD_GATE, UPGRADE, upgradeCost, serviceCost, salvageValue } from "./config.js";
import { SKILLS, skillCost, MILESTONES, RESEARCH_UNLOCKS } from "./meta.js";
import { RESEARCH, canResearch } from "./research.js";
import { mutatorById } from "./mutators.js";
import { makeFleetComparator } from "./fleetsort.js";

const $ = id => document.getElementById(id);
// Theme tokens are static (single committed dark theme), so read each once and
// memoize — render() runs every frame and getComputedStyle forces style resolution.
const _cssCache = {};
const css = v => _cssCache[v] !== undefined ? _cssCache[v]
  : (_cssCache[v] = getComputedStyle(document.documentElement).getPropertyValue(v).trim());
function money(x){ const a = Math.abs(x), s = x < 0 ? "−" : ""; if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + "M"; if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(0) + "k"; return s + "$" + a.toFixed(0); }
function clock(t){ const h = Math.floor(t), m = Math.floor((t - h) * 60); return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"); }
const roman = n => ["", "I", "II", "III", "IV", "V"][n] || String(n);

export function render(S){
  $("s-day").textContent = S.day;
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

  $("s-demand").textContent = Math.round(S.demand);
  $("s-capacity").textContent = Math.round(S.capacity);
  $("s-capacity").style.color = S.capacity >= S.demand ? css("--fg") : css("--bad");

  const margin = S.demand > 0 ? (S.capacity - S.demand) / S.demand * 100 : 0;
  $("s-margin").textContent = (margin >= 0 ? "+" : "") + margin.toFixed(0) + "%";
  const col = margin >= 15 ? css("--good") : margin >= 0 ? css("--warn") : css("--bad");
  $("s-margin").style.color = col;
  const fill = $("marginFill");
  fill.style.width = clamp((margin + 30) / 60 * 100, 2, 100) + "%"; // -30%..+30% mapped across the bar
  fill.style.background = col;

  // reserve-margin urgency on the whole frame
  $("vignette").style.opacity = S.over ? "1" : (S.brownout ? clamp(0.25 + S.strain / 100 * 0.7, 0, 0.95).toFixed(2) : "0");
  $("shakeTarget").classList.toggle("shake", S.brownout && !S.over && S.strain > 35);

  $("ticker").textContent = S.ticker;
  $("ticker").style.color = S.ticker.startsWith("✓") ? css("--good") : css("--warn");

  updateUnits(S);
  drawChart(S);

  $("pauseBtn").textContent = S.paused ? "Resume" : "Pause";
}

// Unit cards are built once per game (buildUnits) and only their dynamic bits are
// patched each frame (updateUnits) — no per-frame DOM teardown, so hover/focus and
// click targets stay stable and the 60fps loop stays cheap.
const unitEls = {};
export function buildUnits(S, onToggle){
  const host = $("units"); host.innerHTML = "";
  for (const k in unitEls) delete unitEls[k];
  for (const u of S.fleet){
    const el = document.createElement("div");
    el.className = "unit" + (u.ctrl ? " ctrl" : "");
    const tierBadge = (u.tier || 1) > 1 ? ` <span class="mk">Mk ${roman(u.tier)}</span>` : "";
    const condBar = u.condition != null ? `<div class="condbar" title="condition"><i data-cond></i></div>` : "";
    el.innerHTML = `
      <div class="top">
        <span class="nm">${u.name}${tierBadge}</span>
        <span class="st" data-st>—</span>
      </div>
      <div class="top"><span class="cap"><b data-out>0</b>/${u.cap} MW</span></div>
      <div class="hint" data-hint></div>${condBar}`;
    if (u.ctrl) el.onclick = () => onToggle(u.id);
    host.appendChild(el);
    unitEls[u.id] = { st:el.querySelector("[data-st]"), out:el.querySelector("[data-out]"), hint:el.querySelector("[data-hint]"), cond:el.querySelector("[data-cond]") };
  }
}
function updateUnits(S){
  for (const u of S.fleet){
    const refs = unitEls[u.id]; if (!refs) continue;
    const out = Math.round(unitOutput(S, u));
    let stClass, stText;
    if (u.status === "service"){ stClass = "st-service"; stText = "SERVICE"; }
    else if (u.status === "online" || u.status === "discharge"){ stClass = "st-online"; stText = u.kind === "battery" ? "DISCHARGE" : "ONLINE"; }
    else if (u.status === "starting"){ stClass = "st-starting"; stText = "STARTING"; }
    else if (u.status === "tripped"){ stClass = "st-tripped"; stText = "TRIPPED"; }
    else { stClass = "st-off"; stText = u.kind === "renew" ? "IDLE" : "RESERVE"; }
    let hint = "";
    if (u.status === "service") hint = "under maintenance";
    else if (u.kind === "battery") hint = `charge ${Math.round(u.energy)}/${Math.round(u.maxEnergy * (S.rmods?.battEnergyMult ?? 1))} MWh`;
    else if (u.kind === "renew") hint = `output ${out} MW now`;
    else if (u.ctrl) hint = `$${u.mc}/MWh · tap ${u.key} to ${u.status === "off" ? "start" : "stop"}`;
    else hint = `$${u.mc}/MWh baseload`;
    if (refs.out.textContent != String(out)) refs.out.textContent = out;
    if (refs.st.textContent != stText) refs.st.textContent = stText;
    const cls = "st " + stClass; if (refs.st.className != cls) refs.st.className = cls;
    if (refs.hint.textContent != hint) refs.hint.textContent = hint;
    if (refs.cond && u.condition != null){
      const c = u.condition;
      refs.cond.style.width = c + "%";
      refs.cond.style.background = css(c > 60 ? "--good" : c > 30 ? "--warn" : "--bad");
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

    line(ctx, hist, x, y, "c", css("--accent"), 2); // capacity (amber)
    line(ctx, hist, x, y, "d", "#fff", 2);           // demand (white)

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

// ---- end-of-run modal (score, meta-currency earned, milestones) ----
export function showEndGame(S, result, actions){
  const upPct = (S.upAcc + S.downAcc) > 0 ? S.upAcc / (S.upAcc + S.downAcc) * 100 : 100;
  $("shakeTarget").classList.add("shake");
  $("vignette").style.opacity = "1";
  setTimeout(() => { $("shakeTarget").classList.remove("shake"); }, 700);
  const reached = (S.milestonesHit || []).length, best = result.best || {};
  $("modal").innerHTML = `
    <h2 style="color:var(--bad)">Blackout</h2>
    <p>${S.reason}</p>
    <div class="score">${result.score}<small>SCORE</small></div>
    <p class="earned">+${result.earned} ⚡ meta-currency earned${result.score >= (best.score || 0) ? " · <b>new best!</b>" : ""}</p>
    <ul>
      <li><span>Days survived</span><span>${S.day - 1}</span></li>
      <li><span>Peak reached</span><span>${S.peak} MW</span></li>
      <li><span>Uptime</span><span>${upPct.toFixed(1)}%</span></li>
      <li><span>Milestones</span><span>${reached} / ${MILESTONES.length}</span></li>
      <li><span>Cash balance</span><span>${money(S.cash)}</span></li>
      <li><span>CO₂ emitted</span><span>${(S.co2Total / 1e3).toFixed(1)} kt</span></li>
    </ul>
    <div class="end-btns">
      <button id="toHome">Home</button>
      <button class="btn-primary" id="again">Run it back ▸</button>
    </div>`;
  $("overlay").classList.add("on");
  $("toHome").onclick = actions.home;
  $("again").onclick = actions.replay;
}

export function clearEndGame(){
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
  const tab = metaTab === "research" ? "research" : "skills";
  const tabs = `<div class="meta-tabs">
    <button class="meta-tab ${tab === "skills" ? "on" : ""}" data-tab="skills">Skills</button>
    <button class="meta-tab ${tab === "research" ? "on" : ""}" data-tab="research">Research Unlocks</button></div>`;
  const body = tab === "research"
    ? `<p>Permanently open research branches for future runs. In-run research itself still resets each run.</p><div class="skill-list">${unlockRows}</div>`
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
  $("meta").querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { metaTab = b.dataset.tab; renderMeta(profile, actions); });
  $("metaBack").onclick = actions.back;
  $("metaOverlay").classList.add("on");
}
export function hideMeta(){ $("metaOverlay").classList.remove("on"); }

// ---- home screen (the front door: start a run, open skills, how-to) ----
export function renderHome(profile, actions){
  const best = profile.best || {};
  $("home").innerHTML = `
    <h1 class="home-title">Grid Operator</h1>
    <p class="home-tag">Keep a growing city powered in real time. Ride the evening peak. Don't go dark.</p>
    <div class="home-stats">
      <div><b>${profile.currency || 0}</b><small>⚡ banked</small></div>
      <div><b>${best.score || 0}</b><small>best score</small></div>
      <div><b>${best.days || 0}</b><small>best days</small></div>
    </div>
    <button class="btn-primary" id="homeStart">Start run ▸</button>
    <div class="home-btns">
      <button id="homeSkills">Skills ⚡</button>
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
  else if (page === "desk") $("menu").querySelectorAll("[data-desk]").forEach(b => b.onclick = () => { deskTab = b.dataset.desk; renderManage(S, "desk", actions); });
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
  const tiles = [
    ["Day", S.day, false], ["Peak", S.peak + " MW", false], ["Cash", money(S.cash), false],
    ["Satisfaction", Math.round(S.satisfaction) + "%", false], ["RP banked", Math.floor(S.rp || 0), false],
    ["Net worth", "—", true], ["Debt", "—", true], ["Credit", "—", true],
  ].map(([k, v, ph]) => `<div class="hub-tile${ph ? " placeholder" : ""}"><b>${v}</b><small>${k}</small></div>`).join("");
  return `<div class="hub-nav">${nav}</div><div class="hub-stats">${tiles}</div>`;
}

// --- fleet: the dense, sortable table that replaces the old card list ---
function fleetRow(S, u){
  const tier = u.tier || 1, mk = tier > 1 ? ` <span class="mk">Mk ${roman(tier)}</span>` : "";
  let stClass, stText;
  if (u.status === "service"){ stClass = "st-service"; stText = "SERVICE"; }
  else if (u.status === "online" || u.status === "discharge"){ stClass = "st-online"; stText = u.kind === "battery" ? "DISCHARGE" : "ONLINE"; }
  else if (u.status === "starting"){ stClass = "st-starting"; stText = "STARTING"; }
  else if (u.status === "tripped"){ stClass = "st-tripped"; stText = "TRIPPED"; }
  else { stClass = "st-off"; stText = u.kind === "renew" ? "IDLE" : "RESERVE"; }
  const out = Math.round(unitOutput(S, u));
  const cond = u.condition != null
    ? `<b class="condtxt ${u.condition > 60 ? "ok" : u.condition > 30 ? "warn" : "bad"}">${Math.round(u.condition)}%</b>`
    : `<span class="faint">—</span>`;
  const max = tier >= UPGRADE.maxTier, uCost = upgradeCost(tier), canUp = !max && S.cash >= uCost;
  const upBtn = `<button data-up="${u.id}" ${canUp ? "" : "disabled"}>${max ? "Max" : `→ Mk ${roman(tier + 1)} · ${money(uCost)}`}</button>`;
  let svcBtn = "";
  if (u.condition != null){
    const inSvc = u.status === "service", sCost = Math.round(serviceCost(u) * (S.mods?.repairMult ?? 1)), canSvc = !inSvc && S.cash >= sCost;
    svcBtn = `<button class="svc" data-svc="${u.id}" ${canSvc ? "" : "disabled"}>${inSvc ? "In service…" : `Service · ${money(sCost)}`}</button>`;
  }
  const lastBattery = u.kind === "battery" && S.fleet.filter(x => x.kind === "battery").length <= 1;
  const decBtn = `<button class="dec" data-dec="${u.id}" ${lastBattery ? "disabled" : ""}>Sell · ${money(salvageValue(u))}</button>`;
  return `<tr>
    <td class="fl-nm">${u.name}${mk}<br><small class="faint">${Math.round(u.cap)} MW · ${u.kind}</small></td>
    <td><span class="st ${stClass}">${stText}</span></td>
    <td class="num">${out}/${u.cap}</td>
    <td class="num">${cond}</td>
    <td><div class="fleet-acts">${upBtn}${svcBtn}${decBtn}</div></td></tr>`;
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
    <th class="num" data-sort="condition">Cond.${arr("condition")}</th>
    <th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function wireFleet(S, actions){
  const m = $("menu");
  m.querySelectorAll("[data-up]").forEach(b => b.onclick = () => actions.upgrade(b.dataset.up));
  m.querySelectorAll("[data-svc]").forEach(b => b.onclick = () => actions.service(b.dataset.svc));
  m.querySelectorAll("[data-dec]").forEach(b => b.onclick = () => actions.decommission(b.dataset.dec));
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

// --- desk: the economy route. Stub in Phase A; filled by Phase B (Contracts) and
//     Phase C (Financing). ---
function deskBody(S){
  const tabs = `<div class="meta-tabs">
    <button class="meta-tab ${deskTab === "contracts" ? "on" : ""}" data-desk="contracts">Contracts</button>
    <button class="meta-tab ${deskTab === "financing" ? "on" : ""}" data-desk="financing">Financing</button></div>`;
  const msg = deskTab === "financing"
    ? "Borrow to expand, mind your credit rating — arriving in Phase C."
    : "Hedge your output with forward contracts against a live market — arriving in Phase B.";
  return tabs + `<p class="desk-stub">${msg}</p>`;
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
