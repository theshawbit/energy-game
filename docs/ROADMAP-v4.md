# Grid Operator v4 — "The Book" — Design & Roadmap

> **Status: SHIPPED** (Phases A–G, 2026-10-25). This is the *what* and *why*,
> scoped from a planning interview; the phase-by-phase implementation is in
> [PLAN-v4.md](PLAN-v4.md). All seven phases merged to `main`; the economy was
> tuned with data in Phase G (`tools/balance.mjs`). v3 (the research tech tree)
> shipped earlier; see [ROADMAP-v3.md](ROADMAP-v3.md).

**Theme:** The real-time dispatch roguelike grows a *balance sheet*. v3 gave the
grid a brain (research); v4 gives it a **book**. You stop being only the operator
who keeps the lights on and become the operator who **runs the utility as a
business on a knife-edge** — hedging your output against a volatile market,
borrowing to grow, and living or dying by both the grid *and* the ledger. Still
entertainment-first. Still zero-backend, web-only. Dispatch is still the live hero.

This release also absorbs the two biggest pieces of standing feedback: the
**bulky, hard-to-scan UI** (fixed by a real information architecture) and the
**meaningless cash economy** (fixed by, and replaced with, the book). A
stats/achievements surface falls out of the scoring redesign for free.

---

## 1. Where v4 starts (what v3 shipped)

v3 is a complete real-time roguelike with strategic depth:

- Live 24h clock, continuous merit-order dispatch, reserve margin, strain/satisfaction.
- In-run research tech tree (RP from an R&D-lab cash lever; 12 nodes / 4 branches).
- Four tech families (storage, demand response, advanced gen, transmission).
- Per-run mutators; two-economy roguelike meta (in-run cash + cross-run ⚡ currency).
- `localStorage` persistence with migration.

**The keepers:** the *verified* merit-order dispatch engine (`dispatchHour`), the
pure-module architecture, the research and mutator systems, and the fail-state
tension. v4 does **not** rewrite any of it.

**The two problems v4 solves:**

1. **Cash is a meaningless score.** Revenue is a flat retail price on served load,
   so once you clear your fixed-cost hump every MWh is undifferentiated profit —
   cash runs away to ~500k with nothing to spend it against, while a brownout is an
   uncapped death spiral to −100k. No tight margin, no negative feedback loop, no
   catch-up. (Confirmed by economy-design research: an economy without finite,
   always-sought resources makes money meaningless.)
2. **The UI is bulky and unscannable.** The Manage panel is one long scroll trying
   to be four things; finding the one worn plant among ten is a hunt, and the panel
   overflows the screen. (Confirmed by UX research: many homogeneous records that
   you scan, compare and act on want a **table/data-grid**, not cards; hiding things
   behind deep tabs is a cost, not a fix.)

Both have the *same* root cause — no information architecture — and the *same* fix.

---

## 2. Design pillars (inherited + new)

1. **Entertainment over everything.** (unchanged)
2. **Tension is the product.** (unchanged) — v4's job is to make *money* as scary
   and as thrilling as the peak, without stealing attention from the peak.
3. **Operator-first.** Dispatch stays the live hero. Every economic decision happens
   at **planning time** (the paused hub), never as live trading. The player sets
   their risk *knowingly* when paused, then rides the consequences live.
4. **Depth without clutter.** Three new systems (a trading desk, a debt ledger, a
   credit rating) are only allowed in because a real **information architecture**
   makes room for them. If v4 makes the HUD noisier, it has failed.
5. **The grid and the book are one knife-edge.** The market pays most exactly when
   your grid is tightest, so dispatching skill and financial nerve are the same
   bet seen twice. Never two games bolted together.
6. **Complexity blooms with mastery.** Early runs are simple; the economy's depth
   (capacity markets, longer runs, a deeper book) unlocks across runs, mirroring how
   research branches already open up.

---

## 3. The marquee — the Book (a real electricity-market economy)

The flat retail margin is **retired**. Revenue becomes:

> **Revenue = contracted blocks (sold forward at a locked price) + residual served
> load sold at the live spot price.**

This single change is the whole game, because of *where the spot price comes from*.

### 3.1 The spot engine — hybrid, scarcity-driven

Spot price each hour = a **relatively flat exogenous baseline** + a **scarcity
premium that rises with the player's own system tightness** (thin reserve margin →
price spikes; flush with cheap renewables → price crashes). **Mutators compound**
the swing (a fuel spike makes scarcity bite harder; a credit crunch compounds
through interest). Scarcity is the *primary* driver — **your own dispatch makes the
market.** You are never a passive price-taker.

### 3.2 Contracts — the hedge decision

Each morning, in the paused Desk, you decide how much of the coming days' output to
**sell forward** at a **locked term price** (a multi-day lock — a longer lock earns a
better rate but commits you through conditions you can't foresee). A **baseline
hedge dial** handles the routine case; **occasional special offers** from named
buyers punctuate a run with standout deals.

**The central gamble:** hedge heavy for a guaranteed floor that safely services your
costs and debt — steady, a little boring — or **run naked to capture the scarcity
jackpot your own lean dispatch creates.** One plant trip at the wrong moment turns
that jackpot into a blackout that earns *nothing*. The hedge ratio is a literal risk
dial on the whole run. (In a sell-only model the *downside* comes from **fixed
obligations** — O&M, fuel, debt service — that fall due whether the market is hot or
cold. Hedging buys a floor that covers your nut.)

### 3.3 Financing — debt with teeth

- **Start clean, borrow by choice.** Opening posture is like today's starting cash;
  debt is an opt-in tool to expand faster.
- **Credit rating is the system.** Your interest rate *and* your borrowing ceiling
  are set by a credit rating you build through solvent play. A default craters it for
  the rest of the run and marks a **persistent record**.
- **Bankruptcy is a new fail-state**, standing beside the blackout: sustained
  insolvency / a missed payment ends the run.

### 3.4 Capacity market — the advanced tier (meta-unlocked)

Getting paid for **availability** (reserve MW you can deliver on call), with a
penalty if you're called and fall short, is deferred to a **meta-unlock** — the
"advanced book" that opens once you've mastered the core. It turns reserve margin
from pure cost into a revenue stream, and converts a brownout into a contract-breach
fine (a negative loop with teeth, but recoverable).

---

## 4. Information is earned — the forecast

The spot forecast is **both earned and conditional**:

- It starts **foggy** (a wide, noisy band). A **forecasting-desk** track (in-run
  research and/or a meta-unlock) **sharpens** it.
- It **degrades under volatility** — a market shock or a "chaotic market" mutator
  blurs the band exactly when you most want clarity.

So a veteran in a calm market reads the market clean; a newcomer in a crisis flies
half-blind. Skill and conditions both move the fog — information itself becomes a
reward.

---

## 5. UX — the information architecture (fixes the bulk)

v4 replaces the one-scroll Manage panel with a **hub-and-spoke** architecture.

- **Pressing Manage pauses into a landing hub** — a calm **landing page** that is
  *also* your scorecard and stats home: net worth, debt, credit rating, contracts in
  force, days survived, and your multi-track scores/records, plus the navigation out.
- **Four dedicated pages**, each doing exactly one job, each with **at most one or
  two tabs** (never the 5–6-tab soup we're escaping):
  - **Fleet** — a dense, **sortable table** (worn/tripped plants sort to the top,
    status badges, inline service/upgrade/sell actions). This is the fix for the
    "ten peakers, scroll to find the worn one" pain.
  - **Build** — the build catalogue.
  - **Research** — the v3 tech tree.
  - **Desk** — the economy, with two tabs: **Contracts** | **Financing**.
- **The live HUD stays clean:** demand-vs-capacity remains the hero read; the economy
  adds only a slim live readout — a **spot ticker + forecast band + cash/debt**.

Research verdict applied: tables for the many-homogeneous-records case; a hub +
dedicated pages (not deep tabs) so nothing is crammed and the panel always fits.

---

## 6. Scoring & progression — money can finally be the point

- **Multiple scored tracks**, each feeding different meta rewards: **longevity**,
  **peak net worth**, **clean-energy share**, **biggest single spot-spike killing**.
  Together they *are* the stats/achievements surface (the long-requested "where do I
  dominate / where do I suck" mirror) and they live on the landing hub.
- **Two persistent threads, distinct jobs, never merged:**
  - **⚡ meta-currency** — *spendable*; buys permanent skills and **economy unlocks**
    (capacity markets, a deeper book, longer runs) that make the game bloom.
  - **Credit rating** — a *standing* you build and protect; sets your borrowing terms
    and is itself a tracked record across runs.
- **Runs lengthen with mastery** — early runs stay punchy (~5 days); meta-progression
  extends how long a run can run, giving the book room to breathe over time.

---

## 7. What changes under the hood

The v3 architecture (split ES modules, no build step, verified dispatch engine,
pure modifier-object modules) holds. v4 extends it.

- **`engine.js` is untouched.** `dispatchHour()` keeps its exact signature and
  behavior. v4 changes how the *revenue* derived from its output is computed, not how
  the market clears. This is a hard invariant.
- **`sim.js`** gains contract/spot/debt/credit state and a reworked revenue line in
  `step()` (retail → contracts + spot). Market noise is **supplied by the caller**
  (like mutators) to keep the sim deterministic and testable.
- **New pure modules** (mirroring `research.js`/`mutators.js`): a **market** module
  (spot pricing: baseline + scarcity premium) and a **finance** module (contracts,
  debt, interest, credit rating) — no DOM, no state mutation beyond what callers pass.
- **`config.js`** gains the economy knobs (spot baseline/volatility, scarcity-premium
  curve, contract pricing, interest/credit-rating curves, bankruptcy thresholds).
- **`meta.js`** gains the economy unlocks, the multi-track scoring, and run-length
  growth. **`persist.js`** migrates to a new key version (records, credit-rating
  history, economy unlocks).
- **`render.js` + `main.js`** get the IA redesign: the hub, four pages, the Fleet
  table, the slim live economy readout — render stays pure, main stays the only glue.
- **`tools/balance.mjs`** extends across the economy; **tests** gain market/finance
  suites and the engine/sim invariants stay green.
- **Still zero-backend, local-only.** No server, no leaderboard.

---

## 8. Phasing (A–G)

> The IA is the foundation (it fixes the bulk with zero economy risk); the economy
> core is the spine; depth and balance layer on top. Each phase is independently
> shippable and test-green. Full PR map in [PLAN-v4.md](PLAN-v4.md).

- **Phase A — IA skeleton.** Hub-and-spoke navigation, the four dedicated pages, and
  **Fleet-as-table**. Fixes the #1 UX pain *immediately* with no economy changes —
  the game feels better the day it lands.
- **Phase B — Spot + contracts (the heart).** Retire flat retail; add the hybrid
  spot price (baseline + scarcity premium); the hedge dial and term contracts; the
  Desk → Contracts tab; the live ticker + forecast + baseline/premium split.
- **Phase C — Financing (the teeth).** Debt, interest, credit rating, the bankruptcy
  fail-state; the Desk → Financing tab.
- **Phase D — Scoring & stats hub.** Multi-track scores, the landing-page scorecard,
  records, meta integration. Closes the loop and lights up the stats surface.
- **Phase E — Earned forecast.** The foggy→sharp forecasting track and the
  conditional blur under volatility.
- **Phase F — Meta blooms.** Economy unlocks, run-length growth, the capacity market
  (advanced tier), and the special-offer system.
- **Phase G — Balance pass.** Extend `tools/balance.mjs` across the economy (seeded
  runs × hedge personas); add the cross-cutting guard tests (shortfall-never-windfall,
  determinism, cash/book conservation); tune the spot magnitude with data (scarcityMax
  240→100, spotCap 320→165, crashMax 42→54, hedgeBaseFactor 0.90→1.06 — the windfall
  compressed, hedging made fair). Protects the verified core.

**The spine is A–C (D closes the loop).** E–G are depth that can slip to a point
release without breaking v4 — the same cut-line discipline that kept v3 honest.
*(Shipped: all of A–G landed in this release.)*

---

## 9. Open questions & risks

- **Spot tuning is the whole game** (as RP tuning was in v3). The scarcity-premium
  curve decides whether running naked is a smart edge-play or a suicide, and whether
  hedging is prudent or a tax. Needs the balance harness early (Phase G hooks into
  B/C).
- **Three economic systems risk overload.** The bloom rollout and the IA are the
  mitigations; if the opening still feels heavy, gate more of the book behind unlocks.
- **Determinism.** Market noise must be caller-supplied (like mutators) or the sim
  tests and balance harness lose reproducibility. Hard requirement on the new modules.
- **The verified engine must stay verified.** v4 touches *revenue*, not *clearing*.
  Any change that reaches into `dispatchHour`'s logic is out of scope.
- **Sell-only asymmetry.** The downside that justifies hedging comes from fixed
  obligations (O&M/fuel/debt), not from forced spot buys. If those obligations are too
  light, hedging becomes pointless; too heavy and every run is a grind. A balance knob.
- **Scope.** v4 is the money engine + the IA (and stats, for free). Prestige, multiple
  cities, challenges, and deeper real-world failure modeling are **v5**.

---

## Appendix — decisions locked in the interview (2026-10-25)

| Topic | Decision |
|---|---|
| Marquee feature | A real electricity-market economy ("the Book") replacing flat retail |
| Fantasy | Operator-first — dispatch stays the live hero; economy is planning-time depth |
| Revenue model | Contracted blocks (locked price) + residual served load at spot |
| Spot engine | Hybrid: flat-ish exogenous baseline + scarcity premium from own tightness; mutators compound; scarcity is primary |
| Contracts | Term (multi-day locks); morning hedge dial + occasional special offers |
| Debt | Start clean, borrow by choice; credit rating sets rate + ceiling; default scars record |
| Insolvency | Bankruptcy is a new fail-state alongside the blackout |
| Capacity market | Deferred to a meta-unlock (advanced tier) |
| Forecast | Earned (sharpens via a forecasting-desk track) **and** conditional (blurs under volatility) |
| Rollout | Economy complexity blooms via meta-unlocks; run length grows with mastery |
| Scoring | Multiple scored tracks (longevity · net worth · clean share · biggest spot killing) |
| Persistent threads | ⚡ meta-currency (spendable unlocks) vs credit rating (standing/record) — never merged |
| Information architecture | Hub-and-spoke landing page (= scorecard + stats home) + four dedicated pages: Fleet (table) · Build · Research · Desk (Contracts \| Financing); slim live HUD |
| Platform | Web only; no build step; split ES modules; verified engine untouched (unchanged) |
| Scope boundary | v4 = economy + IA + stats. Prestige / multiple cities / challenges / deeper failures = v5 |
