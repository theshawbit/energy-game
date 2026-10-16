// ============================================================
// LIVE RENDER — paints the DOM/canvas from state `S`. Pure view: never
// mutates S. Player actions are delegated to callbacks passed in from main.js
// (onToggle, onRestart), so this file imports no action logic.
// ============================================================
import { unitOutput, clamp } from "./sim.js";

const $ = id => document.getElementById(id);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function money(x){ const a = Math.abs(x), s = x < 0 ? "−" : ""; if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + "M"; if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(0) + "k"; return s + "$" + a.toFixed(0); }
function clock(t){ const h = Math.floor(t), m = Math.floor((t - h) * 60); return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"); }

export function render(S){
  $("s-day").textContent = S.day;
  $("s-clock").textContent = clock(S.t);
  $("s-cash").textContent = money(S.cash);
  $("s-cash").style.color = S.cash < 0 ? css("--bad") : css("--fg");
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

  $("startBtn").textContent = S.running ? "Shift live" : "Start shift";
  $("startBtn").disabled = S.running;
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
    el.innerHTML = `
      <div class="top">
        <span class="nm">${u.name}</span>
        <span class="st" data-st>—</span>
      </div>
      <div class="top"><span class="cap"><b data-out>0</b>/${u.cap} MW</span></div>
      <div class="hint" data-hint></div>`;
    if (u.ctrl) el.onclick = () => onToggle(u.id);
    host.appendChild(el);
    unitEls[u.id] = { st:el.querySelector("[data-st]"), out:el.querySelector("[data-out]"), hint:el.querySelector("[data-hint]") };
  }
}
function updateUnits(S){
  for (const u of S.fleet){
    const refs = unitEls[u.id]; if (!refs) continue;
    const out = Math.round(unitOutput(S, u));
    let stClass, stText;
    if (u.status === "online" || u.status === "discharge"){ stClass = "st-online"; stText = u.kind === "battery" ? "DISCHARGE" : "ONLINE"; }
    else if (u.status === "starting"){ stClass = "st-starting"; stText = "STARTING"; }
    else if (u.status === "tripped"){ stClass = "st-tripped"; stText = "TRIPPED"; }
    else { stClass = "st-off"; stText = u.kind === "renew" ? "IDLE" : "RESERVE"; }
    let hint = "";
    if (u.kind === "battery") hint = `charge ${Math.round(u.energy)}/${u.maxEnergy} MWh`;
    else if (u.kind === "renew") hint = `output ${out} MW now`;
    else if (u.ctrl) hint = `$${u.mc}/MWh · tap ${u.key} to ${u.status === "off" ? "start" : "stop"}`;
    else hint = `$${u.mc}/MWh baseload`;
    if (refs.out.textContent != String(out)) refs.out.textContent = out;
    if (refs.st.textContent != stText) refs.st.textContent = stText;
    const cls = "st " + stClass; if (refs.st.className != cls) refs.st.className = cls;
    if (refs.hint.textContent != hint) refs.hint.textContent = hint;
  }
}

function drawChart(S){
  const cv = $("chart"), ctx = cv.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 1100, h = 260;
  cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const padL = 42, padR = 10, padT = 10, padB = 18, W = w - padL - padR, H = h - padT - padB;
  const n = S.hist.length;
  let ymax = S.peak * 1.15;
  S.hist.forEach(p => ymax = Math.max(ymax, p.d, p.c)); ymax = Math.ceil(ymax / 100) * 100;
  const x = i => padL + (n <= 1 ? 0 : i / (260 - 1)) * W;
  const y = v => padT + H - (v / ymax) * H;

  ctx.font = "10px monospace"; ctx.fillStyle = css("--faint"); ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++){ const val = ymax * i / 4, yy = y(val);
    ctx.strokeStyle = css("--line"); ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + W, yy); ctx.stroke();
    ctx.fillStyle = css("--faint"); ctx.fillText(Math.round(val), padL - 5, yy); }

  if (n > 1){
    // deficit shading where demand>capacity
    for (let i = 1; i < n; i++){
      const a = S.hist[i - 1], b = S.hist[i];
      if (a.d > a.c || b.d > b.c){
        ctx.fillStyle = "rgba(255,91,91,.28)";
        ctx.beginPath(); ctx.moveTo(x(i - 1), y(a.c)); ctx.lineTo(x(i), y(b.c)); ctx.lineTo(x(i), y(b.d)); ctx.lineTo(x(i - 1), y(a.d)); ctx.closePath(); ctx.fill();
      }
    }
    line(ctx, S.hist, x, y, "c", css("--accent"), 2); // capacity (amber)
    line(ctx, S.hist, x, y, "d", "#fff", 2);           // demand (white)
  }
  ctx.fillStyle = css("--faint"); ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillText("MW", padL - 38, padT - 2);
}
function line(ctx, data, x, y, key, color, lw){
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
  data.forEach((p, i) => { const px = x(i), py = y(p[key]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke();
}

// ---- end-of-run modal ----
export function showEndGame(S, onRestart){
  const upPct = (S.upAcc + S.downAcc) > 0 ? S.upAcc / (S.upAcc + S.downAcc) * 100 : 100;
  $("shakeTarget").classList.add("shake");
  $("vignette").style.opacity = "1";
  setTimeout(() => { $("shakeTarget").classList.remove("shake"); }, 700);
  $("modal").innerHTML = `
    <h2 style="color:var(--bad)">Blackout</h2>
    <p>${S.reason}</p>
    <ul>
      <li><span>Days survived</span><span>${S.day - 1}</span></li>
      <li><span>Peak reached</span><span>${S.peak} MW</span></li>
      <li><span>Uptime</span><span>${upPct.toFixed(1)}%</span></li>
      <li><span>Cash balance</span><span>${money(S.cash)}</span></li>
      <li><span>Satisfaction</span><span>${Math.round(S.satisfaction)}%</span></li>
      <li><span>Final carbon price</span><span>$${Math.round(S.carbon)}/t</span></li>
      <li><span>CO₂ emitted</span><span>${(S.co2Total / 1e3).toFixed(1)} kt</span></li>
    </ul>
    <button class="btn-primary" id="again" style="width:100%">Run it back</button>`;
  $("overlay").classList.add("on");
  $("again").onclick = onRestart;
}

export function clearEndGame(){
  $("overlay").classList.remove("on");
  $("vignette").style.opacity = "0";
}
