// ============================================================
// RENDER LAYER — reads a game object `G` and paints the DOM/canvas.
// Pure view: never mutates G; user actions are delegated to the `actions`
// callbacks passed in from main.js, so this file imports no game logic.
// ============================================================
import { TECH, ORDER } from "./constants.js";
import { fmtMoney, scoreRun, effCapex } from "./game.js";

const $ = id => document.getElementById(id);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export function flashMsg(text, warn) {
  const m = $("msg");
  if (m) m.innerHTML = `<b style="color:${warn ? css('--warn') : css('--fg')}">${text}</b>`;
}

export function render(G, actions) {
  const r = G.result;
  $("s-year").textContent = G.year;
  $("s-cash").innerHTML = fmtMoney(G.cash);
  $("s-cash").style.color = G.cash < 0 ? css("--bad") : (G.cash < 30e6 ? css("--warn") : css("--fg"));
  $("s-peak").innerHTML = G.peak + " <small>MW</small>";
  const rel = r.reliability * 100;
  $("s-rel").innerHTML = rel.toFixed(1) + "<small>%</small>";
  $("s-rel").style.color = rel >= 99 ? css("--good") : (rel >= 95 ? css("--warn") : css("--bad"));
  $("s-co2").innerHTML = Math.round(r.co2) + " <small>kg/MWh</small>";
  $("s-co2").style.color = r.co2 < 100 ? css("--good") : (r.co2 < 450 ? css("--warn") : css("--bad"));
  $("s-price").innerHTML = "$" + r.avgPrice.toFixed(0) + " <small>/MWh</small>";
  $("s-carbon").innerHTML = "$" + Math.round(G.carbon) + " <small>/t</small>";

  $("weatherPill").textContent = `sun ${Math.round(G.weather.sun * 100)}% · wind ${Math.round(G.weather.wind * 100)}%`;

  $("results").innerHTML = [
    ["Revenue", fmtMoney(r.grossRev), css("--fg")],
    ["Net profit / yr", fmtMoney(r.profit), r.profit >= 0 ? css("--good") : css("--bad")],
    ["Fuel + carbon cost", fmtMoney(r.varY), css("--fg")],
    ["Fixed O&amp;M / yr", fmtMoney(r.fixedOM), css("--fg")],
    ["Energy served / yr", (r.energy / 1e6).toFixed(2) + " TWh", css("--fg")],
    ["Blackout penalty", r.penalty > 0 ? fmtMoney(-r.penalty) : "$0", r.penalty > 0 ? css("--bad") : css("--muted")],
  ].map(([k, v, c]) => `<div><div class="k">${k}</div><div class="v" style="color:${c}">${v}</div></div>`).join("");

  let m = "";
  if (r.unservedY > 0) m = `<b>Blackouts.</b> Firm capacity can't cover the peak — add dispatchable or storage.`;
  else if (r.profit < 0) m = `Losing money. ${G.carbon > 0 ? "Carbon costs are biting your fossil plants. " : ""}Shift toward cheaper or cleaner generation.`;
  else if (r.co2 > 450) m = `Lights stay on, but you're carbon-heavy — rising carbon prices will punish this.`;
  else m = `Grid is solvent, reliable${r.co2 < 100 ? " and clean" : ""}. Build margin for demand growth and events.`;
  $("msg").innerHTML = m;

  renderFleet(G, actions);
  renderLegend();
  renderLog(G);
  drawChart(G);

  $("goalbar").textContent = `Goal · reach 2050 solvent  (${2050 - G.year} ${2050 - G.year === 1 ? "year" : "years"} left)`;
  $("advanceBtn").disabled = !!G.over;
}

function renderFleet(G, actions) {
  const host = $("fleet"); host.innerHTML = "";
  for (const t of ORDER) {
    const T = TECH[t], cost = T.block * effCapex(G, t);
    const el = document.createElement("div"); el.className = "tech";
    el.innerHTML = `
      <span class="swatch" style="background:${css(T.color)}"></span>
      <div><div class="nm">${T.name}</div><div class="meta">${T.note}</div></div>
      <div class="cap"><b>${G.fleet[t]}</b>MW</div>
      <div class="btns">
        <button data-b="${t}">+${T.block} MW · ${fmtMoney(cost)}</button>
        <button class="sell" data-s="${t}" ${G.fleet[t] <= 0 ? "disabled" : ""}>− retire</button>
      </div>`;
    host.appendChild(el);
  }
  host.querySelectorAll("[data-b]").forEach(b => b.onclick = () => actions.build(b.dataset.b));
  host.querySelectorAll("[data-s]").forEach(b => b.onclick = () => actions.sell(b.dataset.s));
}

function renderLegend() {
  $("legend").innerHTML = ORDER.map(t => `<span><i style="background:${css(TECH[t].color)}"></i>${TECH[t].name}</span>`).join("")
    + `<span><i style="background:${css("--t-unserved")}"></i>Unserved (blackout)</span>`
    + `<span><i style="width:16px;height:0;border-top:2px dashed #fff"></i>Demand</span>`;
}

function renderLog(G) {
  $("log").innerHTML = G.log.map(l => `<div class="ln ${l.isEvent ? 'ev' : ''}">${l.html}</div>`).join("");
}

// ---- canvas dispatch chart ----
export function drawChart(G) {
  const cv = $("chart"); if (!cv) return;
  const ctx = cv.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = cv.clientWidth || 1100, cssH = 430;
  cv.width = cssW * dpr; cv.height = cssH * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 48, padR = 14, padT = 12, padB = 28;
  const W = cssW - padL - padR, H = cssH - padT - padB;
  const r = G.result;
  let ymax = 0;
  r.stackSeries.forEach(s => { const tot = ORDER.reduce((a, t) => a + s[t], 0) + s.unserved; ymax = Math.max(ymax, tot, s._demand); });
  ymax = niceCeil(Math.max(ymax, 50));
  const x = h => padL + (h + 0.5) / 24 * W;
  const bw = W / 24 * 0.72;
  const y = v => padT + H - (v / ymax) * H;

  ctx.font = "10px monospace"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i++) {
    const val = ymax * i / 5, yy = y(val);
    ctx.strokeStyle = css("--line"); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + W, yy); ctx.stroke();
    ctx.fillStyle = css("--faint"); ctx.fillText(Math.round(val), padL - 6, yy);
  }
  for (let h = 0; h < 24; h++) {
    const s = r.stackSeries[h]; let base = 0; const cx = x(h) - bw / 2;
    for (const t of ORDER) {
      const v = s[t]; if (v <= 0) continue;
      ctx.fillStyle = css(TECH[t].color); const y0 = y(base), y1 = y(base + v); ctx.fillRect(cx, y1, bw, y0 - y1); base += v;
    }
    if (s.unserved > 0.01) { ctx.fillStyle = css("--t-unserved"); const y0 = y(base), y1 = y(base + s.unserved); ctx.fillRect(cx, y1, bw, y0 - y1); }
  }
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.8; ctx.setLineDash([5, 4]); ctx.beginPath();
  r.stackSeries.forEach((s, h) => { const px = x(h), py = y(s._demand); h ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); ctx.setLineDash([]);
  r.stackSeries.forEach((s, h) => { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x(h), y(s._demand), 1.8, 0, 7); ctx.fill(); });

  ctx.fillStyle = css("--faint"); ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (let h = 0; h < 24; h += 3) ctx.fillText(String(h).padStart(2, "0"), x(h), padT + H + 6);
  ctx.textAlign = "left"; ctx.fillText("hour", padL, padT + H + 6);
}
function niceCeil(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

// ---- end-of-run modal ----
export function showEndGame(G, actions, outcome) {
  const win = outcome.win;
  const { score, grade, avgRel, co2 } = scoreRun(G);
  const gcol = !win ? css("--bad") : score >= 80 ? css("--good") : score >= 55 ? css("--warn") : css("--bad");
  $("modal").innerHTML = `
    <h2 style="color:${win ? css('--good') : css('--bad')}">${win ? "Term complete" : "Grid failure"}</h2>
    <p>${outcome.reason}</p>
    ${win ? `<div class="grade" style="color:${gcol}">${grade}</div><p>Score ${score}/100</p>` : ""}
    <ul>
      <li><span>Years operated</span><span>${G.relYears}</span></li>
      <li><span>Cumulative profit</span><span style="color:${G.cumProfit >= 0 ? css('--good') : css('--bad')}">${fmtMoney(G.cumProfit)}</span></li>
      <li><span>Ending cash</span><span>${fmtMoney(G.cash)}</span></li>
      <li><span>Average reliability</span><span>${(avgRel * 100).toFixed(1)}%</span></li>
      <li><span>Final CO₂ intensity</span><span>${Math.round(co2)} kg/MWh</span></li>
      <li><span>Final carbon price</span><span>$${Math.round(G.carbon)}/t</span></li>
    </ul>
    <button class="advance" id="restart">Play again</button>`;
  $("overlay").classList.add("on");
  $("restart").onclick = () => actions.restart();
}

export function hideOverlay() { $("overlay").classList.remove("on"); }
