// ============================================================
// GRID OPERATOR — LIVE (Phase A prototype)
// Real-time dispatch loop. Proves the core v2 feel: watch Demand vs Capacity
// in real time, scramble reserves when outages hit, survive the reserve margin.
// Each tick clears the market through the shared, verified dispatchHour() engine
// (one source of dispatch truth with the batch game); the real-time mechanics
// (outages, strain, brownout/blackout) are new and prototype-only.
// ============================================================
import { DEMAND_SHAPE, SOLAR_CF, WIND_CF, TECH } from "../../src/constants.js";
import { dispatchHour } from "../../src/engine.js";

// ---- tuning (prototype — meant to be played with) ----
const CFG = {
  secondsPerDay: 48,          // real seconds for a 24h cycle (1 hour ≈ 2s)
  startHour: 6,               // shift begins at 06:00
  startPeak: 780,             // MW peak demand, day 1
  peakGrowth: 1.06,           // demand growth per day survived
  spinCost: 11,               // $/MW/h default to keep a thermal plant synced (per-unit `spin` overrides)
  strainRate: 55,             // strain gained per second at 100% shortfall
  strainRecover: 45,          // strain shed per second when covered
  instantBlackout: 0.30,      // shortfall/demand above this = immediate blackout
  battRecharge: 70,           // MW recharge rate when idle
};

// ---- fleet definition ----
// kind: firm (always-on thermal), renew (variable), peaker (reserve), battery
function makeFleet() {
  return [
    // `tech` maps each unit onto an engine resource; `mc` mirrors TECH so the
    // cards and the dispatchHour() clearing agree on one set of economics.
    { id:"nuc",  name:"Nuclear",   kind:"firm",   tech:"nuclear", cap:250, mc:TECH.nuclear.mc, spin:2,  status:"online", ctrl:false, fail:0.010, recover:[6,10], key:null },
    { id:"colA", name:"Coal A",    kind:"firm",   tech:"coal",    cap:180, mc:TECH.coal.mc,    spin:4,  status:"online", ctrl:false, fail:0.030, recover:[2,4],  key:null },
    { id:"colB", name:"Coal B",    kind:"firm",   tech:"coal",    cap:140, mc:TECH.coal.mc,    spin:4,  status:"online", ctrl:false, fail:0.030, recover:[2,4],  key:null },
    { id:"sol",  name:"Solar farm",kind:"renew",  tech:"solar",   cap:220, mc:TECH.solar.mc,   status:"online", ctrl:false, cf:SOLAR_CF, key:null },
    { id:"wnd",  name:"Wind",      kind:"renew",  tech:"wind",    cap:160, mc:TECH.wind.mc,    status:"online", ctrl:false, cf:WIND_CF,  key:null },
    { id:"pk1",  name:"Peaker 1",  kind:"peaker", tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:11, status:"off",    ctrl:true,  fail:0.015, recover:[1.5,3], startTime:1.6, key:"1" },
    { id:"pk2",  name:"Peaker 2",  kind:"peaker", tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:11, status:"off",    ctrl:true,  fail:0.015, recover:[1.5,3], startTime:1.6, key:"2" },
    { id:"pk3",  name:"Peaker 3",  kind:"peaker", tech:"peaker",  cap:110, mc:TECH.peaker.mc,  spin:11, status:"off",    ctrl:true,  fail:0.015, recover:[1.5,3], startTime:1.6, key:"3" },
    { id:"bat",  name:"Battery",   kind:"battery",tech:"battery", cap:120, mc:TECH.battery.mc, status:"off",    ctrl:true,  energy:240, maxEnergy:240, key:"B" },
  ];
}

let S;
function newGame() {
  S = {
    running:false, paused:false, over:false,
    t:CFG.startHour, day:1, peak:CFG.startPeak,
    cash:0, satisfaction:100, strain:0,
    fleet:makeFleet(), weather:freshWeather(),
    demand:0, capacity:0, price:0, brownout:false,
    hist:[], sampleAcc:0, upAcc:0, downAcc:0,
    ticker:"", tickerT:0, flash:"", flashT:0,
  };
  buildUnits();
}
const rand=(a,b)=>a+Math.random()*(b-a);
function freshWeather(){ return { sun:rand(0.7,1.05), wind:rand(0.6,1.25) }; }

// linear interpolation around the 24h shape arrays
function interp(arr, t){
  const h=((t%24)+24)%24, i=Math.floor(h), f=h-i;
  return arr[i]*(1-f)+arr[(i+1)%24]*f;
}

// ---- capacity accounting ----
function unitOutput(u){
  if (u.kind==="renew") return u.cap * interp(u.cf, S.t) * (u.id==="sol"?S.weather.sun:S.weather.wind);
  if (u.kind==="battery") return (u.status==="discharge" && u.energy>0) ? u.cap : 0;
  return u.status==="online" ? u.cap : 0; // firm / peaker
}
function totalCapacity(){ return S.fleet.reduce((a,u)=>a+unitOutput(u),0); }

// ---- player actions ----
function toggleUnit(id){
  if (!S.running || S.paused || S.over) return;
  const u=S.fleet.find(x=>x.id===id); if (!u||!u.ctrl) return;
  if (u.kind==="battery"){
    if (u.status==="discharge") u.status="off";
    else if (u.energy>1) u.status="discharge";
    else setTicker("Battery depleted — needs surplus capacity to recharge.");
  } else { // peaker
    if (u.status==="off") { u.status="starting"; u.startTimer=u.startTime; }
    else if (u.status==="online"||u.status==="starting") u.status="off";
  }
  render();
}

// ---- simulation step (dt in real seconds) ----
function step(dt){
  const dtH = dt * (24/CFG.secondsPerDay); // game-hours elapsed
  // clock + day rollover
  S.t += dtH;
  if (S.t >= 24){ S.t -= 24; surviveDay(); }

  // weather drifts slowly
  S.weather.sun  = clamp(S.weather.sun  + rand(-0.4,0.4)*dt*0.15, 0.55, 1.1);
  S.weather.wind = clamp(S.weather.wind + rand(-0.6,0.6)*dt*0.15, 0.45, 1.35);

  const diff = 1 + (S.day-1)*0.18; // outages get worse as days climb

  // unit state machines
  for (const u of S.fleet){
    if (u.status==="starting"){ u.startTimer-=dtH; if (u.startTimer<=0) u.status="online"; }
    else if (u.status==="tripped"){ u.tripTimer-=dtH; if (u.tripTimer<=0) u.status= u.ctrl ? "off" : "online"; }
    else if ((u.kind==="firm"||u.kind==="peaker") && (u.status==="online")){
      // per-real-second hazard turned into an exact probability for this frame's dt
      // (1 - e^{-rate·dt}): frame-rate independent and never exceeds 1 on slow frames
      if (Math.random() < 1 - Math.exp(-u.fail*diff*dt)){ // trip!
        u.status="tripped"; u.tripTimer=rand(u.recover[0],u.recover[1]);
        setTicker(`⚠ ${u.name} tripped offline — ${Math.round(u.cap)} MW lost!`);
      }
    }
  }

  // demand (daily shape, scaled to current peak)
  S.demand = S.peak * interp(DEMAND_SHAPE, S.t);
  S.capacity = totalCapacity();

  // economics — clear the hour through the shared, verified merit-order engine.
  // Aggregate every unit's available MW (0 when off/tripped) into per-tech supply,
  // then dispatchHour() returns served energy, the uniform clearing price, fuel
  // cost and emissions — the same dispatch the batch game is tested against.
  const avail = {};
  for (const u of S.fleet) avail[u.tech] = (avail[u.tech]||0) + unitOutput(u);
  const hr = dispatchHour(avail, S.demand, 0, 1); // carbon / fuel-multiplier hooks for later escalation
  S.price = hr.price;

  // spin: cost of keeping thermal plants synced even when not fully dispatched (prototype-only)
  const spin=S.fleet.reduce((a,u)=>a+(((u.kind==="firm"||u.kind==="peaker")&&u.status==="online")?u.cap*(u.spin??CFG.spinCost):0),0);
  S.cash += (hr.price*hr.served - hr.varCost - spin) * dtH; // unserved load earns nothing

  // battery: drain only by the MW the market actually dispatched this tick; otherwise
  // recharge from genuine surplus, bought at the clearing price (free at a $0 price)
  const bat=S.fleet.find(u=>u.id==="bat");
  if (bat.status==="discharge"){
    bat.energy=Math.max(0, bat.energy - hr.stack.battery*dtH);
    if (bat.energy<=0){ bat.status="off"; setTicker("Battery depleted."); }
  } else if (bat.energy < bat.maxEnergy){
    const surplus=Math.max(0, S.capacity - S.demand);
    const add=Math.min(CFG.battRecharge*dtH, surplus*dtH, bat.maxEnergy-bat.energy);
    if (add>0){ bat.energy+=add; S.cash-=add*hr.price; }
  }

  // reserve margin, brownout, strain
  const shortfall=S.demand-S.capacity;
  const sev = S.demand>0 ? shortfall/S.demand : 0;
  if (shortfall>0.5){
    S.brownout=true; S.downAcc+=dt;
    S.strain = Math.min(100, S.strain + sev*CFG.strainRate*dt);
    S.satisfaction = Math.max(0, S.satisfaction - sev*22*dt);
    S.cash -= shortfall*120*dtH; // unserved load is costly
    if (sev>CFG.instantBlackout){ return blackout(`A ${Math.round(sev*100)}% shortfall collapsed the grid.`); }
    if (S.strain>=100){ return blackout("Sustained brownout cascaded into a blackout."); }
  } else {
    S.brownout=false; S.upAcc+=dt;
    S.strain=Math.max(0, S.strain - CFG.strainRecover*dt);
    if (S.satisfaction<100) S.satisfaction=Math.min(100, S.satisfaction + 3*dt);
  }

  // history sample for the scrolling chart (~every 0.2s)
  S.sampleAcc+=dt;
  if (S.sampleAcc>=0.2){ S.sampleAcc=0; S.hist.push({d:S.demand,c:S.capacity}); if (S.hist.length>260) S.hist.shift(); }

  if (S.tickerT>0){ S.tickerT-=dt; if (S.tickerT<=0) S.ticker=""; }
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function setTicker(msg){ S.ticker=msg; S.tickerT=3.5; }

function surviveDay(){
  S.day++; S.peak=Math.round(S.peak*CFG.peakGrowth); S.weather=freshWeather();
  S.strain=Math.max(0,S.strain-30);
  setTicker(`✓ Day ${S.day-1} cleared — demand rising to ${S.peak} MW peak.`);
}

function blackout(reason){
  S.over=true; S.running=false;
  const upPct = (S.upAcc+S.downAcc)>0 ? S.upAcc/(S.upAcc+S.downAcc)*100 : 100;
  $("shakeTarget").classList.add("shake");
  $("vignette").style.opacity="1";
  setTimeout(()=>{ $("shakeTarget").classList.remove("shake"); }, 700);
  $("modal").innerHTML=`
    <h2 style="color:var(--bad)">Blackout</h2>
    <p>${reason}</p>
    <ul>
      <li><span>Days survived</span><span>${S.day-1}</span></li>
      <li><span>Peak reached</span><span>${S.peak} MW</span></li>
      <li><span>Uptime</span><span>${upPct.toFixed(1)}%</span></li>
      <li><span>Cash balance</span><span>${money(S.cash)}</span></li>
      <li><span>Satisfaction</span><span>${Math.round(S.satisfaction)}%</span></li>
    </ul>
    <button class="btn-primary" id="again" style="width:100%">Run it back</button>`;
  $("overlay").classList.add("on");
  $("again").onclick=()=>{ $("overlay").classList.remove("on"); $("vignette").style.opacity="0"; newGame(); S.running=true; render(); };
  render();
}

// ---- render ----
const $=id=>document.getElementById(id);
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function money(x){ const a=Math.abs(x),s=x<0?"−":""; if(a>=1e6)return s+"$"+(a/1e6).toFixed(2)+"M"; if(a>=1e3)return s+"$"+(a/1e3).toFixed(0)+"k"; return s+"$"+a.toFixed(0); }
function clock(t){ const h=Math.floor(t),m=Math.floor((t-h)*60); return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0"); }

function render(){
  $("s-day").textContent=S.day;
  $("s-clock").textContent=clock(S.t);
  $("s-cash").textContent=money(S.cash);
  $("s-cash").style.color = S.cash<0?css("--bad"):css("--fg");
  $("s-price").textContent="$"+Math.round(S.price);
  $("s-sat").textContent=Math.round(S.satisfaction)+"%";
  $("s-sat").style.color = S.satisfaction>70?css("--good"):S.satisfaction>40?css("--warn"):css("--bad");

  $("s-demand").textContent=Math.round(S.demand);
  $("s-capacity").textContent=Math.round(S.capacity);
  $("s-capacity").style.color = S.capacity>=S.demand?css("--fg"):css("--bad");

  const margin = S.demand>0 ? (S.capacity-S.demand)/S.demand*100 : 0;
  $("s-margin").textContent=(margin>=0?"+":"")+margin.toFixed(0)+"%";
  const col = margin>=15?css("--good"):margin>=0?css("--warn"):css("--bad");
  $("s-margin").style.color=col;
  const fill=$("marginFill");
  fill.style.width=clamp((margin+30)/60*100,2,100)+"%"; // -30%..+30% mapped across the bar
  fill.style.background=col;

  // reserve-margin urgency on the whole frame
  $("vignette").style.opacity = S.over?"1":(S.brownout? clamp(0.25+S.strain/100*0.7,0,0.95).toFixed(2) : "0");
  $("shakeTarget").classList.toggle("shake", S.brownout && !S.over && S.strain>35);

  $("ticker").textContent=S.ticker;
  $("ticker").style.color = S.ticker.startsWith("✓")?css("--good"):css("--warn");

  updateUnits();
  drawChart();

  $("startBtn").textContent = S.running? "Shift live" : "Start shift";
  $("startBtn").disabled = S.running;
  $("pauseBtn").textContent = S.paused? "Resume" : "Pause";
}

// Unit cards are built once per game (buildUnits) and only their dynamic bits are
// patched each frame (updateUnits) — no per-frame DOM teardown, so hover/focus and
// click targets stay stable and the 60fps loop stays cheap.
const unitEls={};
function buildUnits(){
  const host=$("units"); host.innerHTML="";
  for (const k in unitEls) delete unitEls[k];
  for (const u of S.fleet){
    const el=document.createElement("div");
    el.className="unit"+(u.ctrl?" ctrl":"");
    el.innerHTML=`
      <div class="top">
        <span class="nm">${u.name}</span>
        <span class="st" data-st>—</span>
      </div>
      <div class="top"><span class="cap"><b data-out>0</b>/${u.cap} MW</span></div>
      <div class="hint" data-hint></div>`;
    if (u.ctrl) el.onclick=()=>toggleUnit(u.id);
    host.appendChild(el);
    unitEls[u.id]={ st:el.querySelector("[data-st]"), out:el.querySelector("[data-out]"), hint:el.querySelector("[data-hint]") };
  }
}
function updateUnits(){
  for (const u of S.fleet){
    const refs=unitEls[u.id]; if (!refs) continue;
    const out=Math.round(unitOutput(u));
    let stClass, stText;
    if (u.status==="online"||u.status==="discharge"){ stClass="st-online"; stText=u.kind==="battery"?"DISCHARGE":"ONLINE"; }
    else if (u.status==="starting"){ stClass="st-starting"; stText="STARTING"; }
    else if (u.status==="tripped"){ stClass="st-tripped"; stText="TRIPPED"; }
    else { stClass="st-off"; stText=u.kind==="renew"?"IDLE":"RESERVE"; }
    let hint="";
    if (u.kind==="battery") hint=`charge ${Math.round(u.energy)}/${u.maxEnergy} MWh`;
    else if (u.kind==="renew") hint=`output ${out} MW now`;
    else if (u.ctrl) hint=`$${u.mc}/MWh · tap ${u.key} to ${u.status==="off"?"start":"stop"}`;
    else hint=`$${u.mc}/MWh baseload`;
    if (refs.out.textContent!=String(out)) refs.out.textContent=out;
    if (refs.st.textContent!=stText) refs.st.textContent=stText;
    const cls="st "+stClass; if (refs.st.className!=cls) refs.st.className=cls;
    if (refs.hint.textContent!=hint) refs.hint.textContent=hint;
  }
}

function drawChart(){
  const cv=$("chart"), ctx=cv.getContext("2d");
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const w=cv.clientWidth||1100, h=260;
  cv.width=w*dpr; cv.height=h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const padL=42,padR=10,padT=10,padB=18, W=w-padL-padR, H=h-padT-padB;
  const n=S.hist.length;
  let ymax=S.peak*1.15;
  S.hist.forEach(p=>ymax=Math.max(ymax,p.d,p.c)); ymax=Math.ceil(ymax/100)*100;
  const x=i=>padL + (n<=1?0:i/(260-1))*W;
  const y=v=>padT+H-(v/ymax)*H;

  ctx.font="10px monospace"; ctx.fillStyle=css("--faint"); ctx.textAlign="right"; ctx.textBaseline="middle";
  for (let i=0;i<=4;i++){ const val=ymax*i/4, yy=y(val);
    ctx.strokeStyle=css("--line"); ctx.beginPath(); ctx.moveTo(padL,yy); ctx.lineTo(padL+W,yy); ctx.stroke();
    ctx.fillStyle=css("--faint"); ctx.fillText(Math.round(val),padL-5,yy); }

  if (n>1){
    // deficit shading where demand>capacity
    for (let i=1;i<n;i++){
      const a=S.hist[i-1], b=S.hist[i];
      if (a.d>a.c || b.d>b.c){
        ctx.fillStyle="rgba(255,91,91,.28)";
        ctx.beginPath(); ctx.moveTo(x(i-1),y(a.c)); ctx.lineTo(x(i),y(b.c)); ctx.lineTo(x(i),y(b.d)); ctx.lineTo(x(i-1),y(a.d)); ctx.closePath(); ctx.fill();
      }
    }
    // capacity line (amber)
    line(ctx,S.hist,x,y,"c",css("--accent"),2);
    // demand line (white)
    line(ctx,S.hist,x,y,"d","#fff",2);
  }
  ctx.fillStyle=css("--faint"); ctx.textAlign="left"; ctx.textBaseline="top";
  ctx.fillText("MW",padL-38,padT-2);
}
function line(ctx,data,x,y,key,color,lw){
  ctx.strokeStyle=color; ctx.lineWidth=lw; ctx.beginPath();
  data.forEach((p,i)=>{ const px=x(i),py=y(p[key]); i?ctx.lineTo(px,py):ctx.moveTo(px,py); }); ctx.stroke();
}

// ---- main loop ----
let last=0;
function frame(now){
  if (!last) last=now;
  let dt=(now-last)/1000; last=now;
  dt=Math.min(dt,0.1); // clamp big gaps (tab switch)
  // Only step + repaint while the shift is actually live. Title/paused/dead
  // screens are painted once by their own handlers, so the loop idles cheaply.
  if (S.running && !S.paused && !S.over){ step(dt); render(); }
  requestAnimationFrame(frame);
}

// ---- wiring ----
newGame();
$("startBtn").onclick=()=>{ if(!S.running){ S.running=true; S.paused=false; last=0; } };
$("pauseBtn").onclick=()=>{ if(S.running&&!S.over){ S.paused=!S.paused; render(); } };
window.addEventListener("keydown",e=>{
  if (e.code==="Space"){ e.preventDefault(); if(S.running&&!S.over){S.paused=!S.paused; render();} return; }
  const k=e.key.toLowerCase();
  if (k==="1") toggleUnit("pk1"); else if (k==="2") toggleUnit("pk2");
  else if (k==="3") toggleUnit("pk3"); else if (k==="b") toggleUnit("bat");
});
window.addEventListener("resize",()=>{ if(S) drawChart(); });
render();
requestAnimationFrame(frame);
