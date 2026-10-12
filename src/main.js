// ============================================================
// ENTRY POINT — owns the live game object and wires UI actions to game rules.
// This is the only module that knows about both the game and the view.
// ============================================================
import { createGame, build, sell, advanceYear } from "./game.js";
import { render, drawChart, showEndGame, flashMsg, hideOverlay } from "./render.js";

let G;

const actions = {
  build(t) {
    const res = build(G, t);
    if (!res.ok) { flashMsg(res.msg, true); return; } // nothing changed — just warn
    render(G, actions);
  },
  sell(t) {
    if (sell(G, t).ok) render(G, actions);
  },
  advance() {
    const outcome = advanceYear(G);
    render(G, actions);
    if (outcome.ended && outcome.reason) showEndGame(G, actions, outcome);
  },
  restart() {
    G = createGame();
    hideOverlay();
    render(G, actions);
  },
};

document.getElementById("advanceBtn").onclick = actions.advance;
window.addEventListener("resize", () => { if (G) drawChart(G); });

function boot(data) {
  G = (data && data.G) ? data.G : createGame();
  render(G, actions);
}

// Keep state across hot-reloads when hosted as a Claude artifact; harmless otherwise.
try { window.claude?.hot?.snapshot?.(() => ({ G })); } catch (e) {}
if (window.claude?.hot?.ready) window.claude.hot.ready(boot);
else boot(window.claude?.hot?.data || null);
