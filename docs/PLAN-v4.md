# Grid Operator v4 — "The Book" — Implementation Plan (Phases A–G)

> Companion to [ROADMAP-v4.md](ROADMAP-v4.md) (the *what* and *why*). This is the
> *how*: the phase-by-phase, PR-by-PR build. Scoped by a four-way multi-agent spec
> pass (IA, economy core, progression, balance) and reconciled into one consistent
> plan. Mirrors the v3 convention in [PLAN-v3.md](PLAN-v3.md).

**Status: planned** (2026-10-25). Not yet started.

---

## 0. How to read this plan

- **Seven phases, A–G.** A fixes the UI; B–C are the economy spine; D closes the
  loop; E–G add depth and balance. Each phase is a handful of PRs; **every PR is
  test-green and independently shippable**, branched from `main` (not from a parent
  PR — a lesson from v3, where deleting a merged parent branch closed its stacked
  children).
- **The engine is sacred.** `src/engine.js` (`dispatchHour`) is **not imported into
  any new module and not edited.** v4 changes how *revenue* is derived from the
  engine's output, never how the market clears. Every economy PR review gates on this.
- **Determinism is a hard requirement.** All new randomness (spot noise, special
  offers, capacity calls) is **caller-supplied** via a seeded RNG, exactly as
  `rollMutators()` already is. The pure modules never call `Math.random()`. This keeps
  the exact-number sim tests and the balance harness reproducible.
- **Pure-module discipline holds.** New modules (`market.js`, `finance.js`,
  `forecast.js`, `capacity.js`, `offers.js`, `rng.js`, `fleetsort.js`) touch no DOM
  and mutate only what the caller passes, like `research.js`/`mutators.js`. `render.js`
  never mutates state; `main.js` stays the only glue.

---

## 1. Seam decisions (assembler reconciliations — read first)

The four spec agents ran independently and overlapped in four places. These are the
binding resolutions; the phase sections below are written to them.

### 1.1 One canonical persist migration → `grid-operator-live-v3`
There is exactly **one** key bump, shipped in a single early PR **`v4-pr-p0-persist-v3`**
(landing right after Phase B, before C and D, which both need it). It adds the
*entire* v4 profile shape at once; later PRs only read/write fields it already created.

```js
KEY         = "grid-operator-live-v3";
LEGACY_KEYS = ["grid-operator-live-v2", "grid-operator-live-v1"]; // newest-first

defaultProfile() → {
  // --- kept from v2 (untouched) ---
  currency, skills, researchUnlocked, best:{days,score,peak}, milestones,
  // --- new in v4 ---
  economyUnlocked: {},                                 // { unlockId:true }  (Phase F spends here)
  credit: { standing: CFG.creditStart, best: CFG.creditStart,
            everDefaulted: false, defaults: 0, history: [] },  // the credit STANDING + record
  records: {                                           // per-track bests (stats hub)
    longevity:  { value:0, at:null },
    netWorth:   { value:0, at:null },
    cleanShare: { value:0, at:null },
    spotKill:   { value:0, at:null },
  },
}
```

`normalize(p)` spreads defaults then deep-merges every sub-object (so an old save
gains new fields without losing banked progress); the whole path stays inside the
existing try/catch (private-window safe). The v1→v2→v3 chain must be test-asserted in
this PR. **C's old `c4` and D's old `d0` are both absorbed here.**

### 1.2 One credit model
In-run credit is a **numeric `S.credit` ∈ [0,100]** plus `S.creditCap` and
`S.defaulted` (C's model — it gives smooth rate/ceiling curves). A letter grade is
*derived* for display via `gradeFor(credit)`. D's `creditRating`/`creditHistory`
names are dropped in favour of `S.credit` and `profile.credit.history`.

**Standing carries across runs** (resolves C's open question, per the roadmap's locked
decision). At run start, `S.credit = profile.credit.standing` (not a flat constant).
At run end, `commitCreditStanding(profile, S)` writes it back:
`profile.credit.standing = S.defaulted ? min(S.credit, CFG.defaultFloor) : S.credit`,
and updates `best`/`everDefaulted`/`defaults`/`history`. This is the **only** writer of
the credit thread; `awardCurrency` is the **only** writer of ⚡ — the two never mix (a
test asserts isolation).

### 1.3 One home for special offers → `offers.js`
Special-offer generation lives in **`offers.js`** (not `finance.js`). Phase B's
contract system *consumes* an offer object (`S.pendingOffer`); Phase F *produces* them
via `rollSpecialOffer(S, rng)` with the named-buyer roster, **gated behind the
`special-offers` economy unlock**. Until F lands, `S.pendingOffer` stays `null` and the
Desk shows only the hedge dial — B is fully shippable without offers.

### 1.4 Field-name & mutator-mod standard
Canonical in-run field names (all read elsewhere with `?? 0` / `?? S.price` fallbacks so
any phase can land independently):
`S.spot`, `S.spotBaseline`, `S.spotNoise`, `S.hedge`, `S.contracts`, `S.contractedMW`
(derived per tick, exposed for D's spot-kill), `S.pendingOffer`, `S.debt`, `S.credit`,
`S.creditCap`, `S.defaulted`, `S.insolventT`, `S.capacityObligation`, `S.marketVolatility`,
`S.maxRunDays`, `S.won`, `S.seed`, `S.rng`.

`mutators.js` `freshMods()` gains **two distinct axes**: `scarcityMult:1` (B — spot
*price magnitude*; `fuel-spike` compounds it) and `volatility:0` (E — forecast *fog*;
`chaotic-market` adds it). B's proposed separate `market-shock` mutator is **dropped**
in favour of E's `chaotic-market` to avoid two turbulence mutators.

### 1.5 Net worth
`netWorth = cash − debt` for v4. Mark-to-market of open contracts and fleet salvage are
deferred to v5 (noted in open questions).

### 1.6 Shared RNG
`src/live/rng.js` exports `makeRng(seed)` (a dependency-free mulberry32 closure). `main.js`
creates `const seed = Date.now()>>>0; S.seed = seed; S.rng = makeRng(seed)` at run start
(next to `rollMutators()`), so any run is replayable from its seed. The forecast uses a
**separate** stream (`makeRng(seed ^ 0xF0)`) so sharpening the forecast never desyncs the
realized-spot sequence. `rng.js` lands in the first module PR (`b1`).

---

## 2. Global PR sequence

| # | PR branch | Phase | Headline |
|--:|---|:--:|---|
| 1 | `v4-pr-a1-hub-shell` | A | Hub-and-spoke routing + page shells (reuses old card list) |
| 2 | `v4-pr-a2-fleet-table` | A | Fleet-as-sortable-table + `fleetsort.js` + test |
| 3 | `v4-pr-a3-hud-slim-polish` | A | Reserved econ HUD slot, keyboard nav, density/responsive |
| 4 | `v4-pr-b1-market-module` | B | `market.js` + `rng.js` + spot CFG + `market.test.mjs` |
| 5 | `v4-pr-b2-spot-revenue` | B | Replace revenue line; retire `retailPrice`; `S.spot*` state |
| 6 | `v4-pr-b3-contracts` | B | `finance.js` (contracts) + hedge/contract actions + state |
| 7 | `v4-pr-b4-mutator-compounding` | B | `scarcityMult` in mutators; `fuel-spike` compounds |
| 8 | `v4-pr-p0-persist-v3` | — | **Canonical** `grid-operator-live-v3` migration (all v4 fields) |
| 9 | `v4-pr-c1-finance-credit` | C | Credit/debt/interest functions in `finance.js` + test |
| 10 | `v4-pr-c2-debt-state-actions` | C | Debt state + `borrow`/`repay`; interest into cash line |
| 11 | `v4-pr-c3-bankruptcy-default` | C | Default event + bankruptcy/hard-insolvency fail-states |
| 12 | `v4-pr-d1-score-tracks` | D | Four score tracks, `currencyForRun`, records, sim accumulators |
| 13 | `v4-pr-d2-stats-hub` | D | Landing-hub scorecard render (reads records + live tracks) |
| 14 | `v4-pr-e1-forecast-model` | E | `forecast.js` fog model + `CFG.forecast` + test |
| 15 | `v4-pr-e2-forecast-research` | E | `forecast` research branch + `forecastSkill` in rmods |
| 16 | `v4-pr-e3-chaotic-mutator` | E | `chaotic-market` mutator + `mmods.volatility` |
| 17 | `v4-pr-f1-economy-unlocks` | F | `ECONOMY_UNLOCKS`, `buyEconomyUnlock`, run-length growth + win-state |
| 18 | `v4-pr-f2-capacity-market` | F | `capacity.js` (availability pay + breach fine), gated |
| 19 | `v4-pr-f3-special-offers` | F | `offers.js` named buyers, gated; morning roll in `main.js` |
| 20 | `v4-pr-f4-meta-tab-ui` | F | Economy-Unlocks meta tab + Desk offer/capacity surfacing |
| 21 | `v4-pr-g1-harness-economy` | G | Extend `tools/balance.mjs`: desk hook, personas, new reports |
| 22 | `v4-pr-g2-guard-tests` | G | Determinism, conservation, shortfall-never-windfall, v1→v3 guards |
| 23 | `v4-pr-g3-tuning` | G | Data-driven CFG tune (values only; no logic) |
| 24 | `v4-pr-g4-pace` *(opt)* | G | Isolate unlock-cost + `maxRunDays` growth tuning |

**The spine is A–C + D1** (the loop closes once scoring reads the economy). E–G can slip
to a v4.x point release without breaking the game, per the roadmap cut-line.

The balance harness (`g1`) is headless and touches no `CFG`/sim logic, so it can be built
**early and run throughout** B–F to inform tuning; only the tuning *commit* (`g3`) waits
for the systems to settle. Per-phase unit tests land *with* their phase (see each section);
`g2` holds only the cross-cutting guards.

---

## 3. Phase A — IA skeleton

**Goal & shippable value.** Replace the single overflowing Manage modal with a
hub-and-spoke management mode: Manage pauses into a **landing hub** (future scorecard)
that navigates to four dedicated pages — **Fleet** (dense sortable table), **Build**,
**Research**, **Desk** (stub). Fixes the #1 "ten peakers, scroll to find the worn one"
pain the day it lands, with **zero economy/gameplay change** (only `render.js`, `main.js`,
`index.html`, `styles/live.css`, and a new DOM-free `fleetsort.js` are touched; the sim,
engine, and all existing tests are untouched).

**Navigation model (in `main.js` only).** Add `let page = null` (`"hub"|"fleet"|"build"|
"research"|"desk"`). `S.menuOpen` keeps its exact meaning (clock paused). `openManage()`
sets `menuOpen=true; page="hub"; refreshPage()`; `navigate(p)` sets `page=p; refreshPage()`;
`closeManage()` sets `menuOpen=false; page=null; last=0; render(S)` (**keep `last=0`** so
the next frame's `dt` doesn't spike). `refreshPage()` dispatches to the matching `render.js`
painter and is called on open, nav, and after any mutating action (so re-painted buttons
keep live handlers). All pages paint into the existing `#menuOverlay`/`#menu` modal — no new
overlays. View-only state (sort column, desk tab) lives at `render.js` module scope, exactly
like the existing `metaTab`. Keyboard: `Esc` = back (page→hub, hub→close); `1`–`4` on the hub
jump to the four pages; `Space` still toggles pause only in live play.

**Pages.**
- **Hub — `renderHub(S, nav)`:** title + **Resume shift ▸**; a 2×2 nav grid (Fleet/Build/
  Research/Desk); a `.hub-stats` tile grid filled from data that exists today (`day`, `peak`,
  `cash`, `satisfaction`, `rp`) plus greyed `placeholder` tiles reserved for Phase D
  (`netWorth`, `debt`, `credit`) rendered as `"—"`.
- **Fleet — `renderFleetPage(S, actions)`:** a `<table class="fleet">` replacing the `.up-row`
  cards. Columns: **Name** (+ Mk badge + kind), **Status** (reuse `.st-*` badges), **Output**
  (`unitOutput/cap MW`), **Condition** (`%` with `.condtxt.ok/warn/bad`; `—` for renew/battery),
  **Actions** (inline **Service·$**, **→Mk N·$**, **Sell·$** wired to the *existing*
  `menu.service/upgrade/decommission` → `actions.js`, with the same guards/costs). Default sort
  = **needs-attention** (tripped → in-service → lowest-condition → renew/battery last), via the
  pure comparator in `fleetsort.js`; clickable `<th data-sort>` headers re-sort (state in a
  `render.js` `fleetSort = {col,dir}`).
- **Build / Research pages:** move today's `build-grid` block and the entire v3 research section
  (RP head, `#rdFunding` slider with its in-place `#rdReadout` update — keep `setFunding`
  *not* re-rendering so the drag survives, node list) verbatim into their painters.
- **Desk — `renderDeskPage(S, actions)`:** two tabs **Contracts | Financing**, each a placeholder
  ("The Book arrives in Phase B/C"). The ready route Phases B/C fill.

Every page has a sticky **← Hub** header and sticky **Resume shift ▸** footer; the body scrolls
(`.modal.page{max-width:min(860px,94vw); max-height:88vh; display:flex; flex-direction:column}`,
sticky `.page-head`/`.page-foot`, scrolling `.page-body`) — so the panel always fits the viewport.

**CSS (`styles/live.css`).** Reuse existing tokens (`--panel`,`--line`,`--accent`,`--good/warn/bad`,
`--mono`). `table.fleet` dense (`font-size:.8rem; tabular-nums`), sticky uppercase `thead th`
(clickable, arrow on active sort), hover rows, right-aligned numeric cells, compact inline action
buttons reusing `.svc`/`.dec` accents. `.hub-nav` 2×2→1-col; `.hub-stats` auto-fit tiles;
`@media (max-width:620px)` collapses Output/Condition under Name (or horizontal-scrolls the body).
Dark theme only (single committed theme); new rules use tokens.

**Tests.** New DOM-free `src/live/fleetsort.js` — `attentionRank(u)`, `compareNeedsAttention(a,b)`,
`makeFleetComparator(col, dir, outputOf)` (the `output` comparator takes an injected
`outputOf(u)=>unitOutput(S,u)` so the module has zero sim/DOM coupling). New
`tests/fleetsort.test.mjs` (same `check()` harness): tripped above online, lowest-condition
thermal first, renew/battery sink below thermal, stable tie-break, each column ascends with
`dir=1`/descends with `dir=-1`. Append it to the `npm test` chain in `package.json`. No other
test changes — all existing suites stay green.

**PRs.** `a1-hub-shell` (routing + hub + page shells; Fleet still uses the old card list; ships the
IA win immediately), `a2-fleet-table` (the table + `fleetsort.js` + test; removes old `.up-*`
markup/CSS), `a3-hud-slim-polish` (reserved hidden `#hud-econ` node in `index.html` for Phase B's
readout; `Esc`+`1`–`4` nav + focus management; responsive/density pass).

**Risks.** Keep `S.menuOpen` semantics and `last=0` on close so the live loop doesn't jump;
management painters stay off the per-frame `render(S)` path; every mutating `menu.*` method calls
`refreshPage()` to re-attach handlers; keep `buildUnits()` in build/upgrade/decommission so the live
dispatch cards stay correct; Desk stays a pure stub (no sim edits).

---

## 4. Phase B — Spot + contracts (the heart)

**Goal & shippable value.** Retire flat `CFG.retailPrice`. Revenue = **contracted blocks at a
locked price + residual served load at a live spot price**, where spot is a deterministic flat-ish
baseline plus a **scarcity premium driven by the player's own reserve-margin tightness** (thin →
spike, flush → crash), mutators compounding the swing. Ships headless-first (exact-number sim
tests); the Desk→Contracts UI consumes the new actions.

**New state (`createGame`).** `spot:0, spotBaseline:0, spotNoise:0, hedge:CFG.hedgeDefault,
contracts:[], pendingOffer:null, contractSeq:1`. All deterministic defaults (`spotNoise:0` keeps a
bare `createGame()` reproducible).

**Contract structure.** `{ id:"ct-<seq>", mw, price, term, remaining, origin:"dial"|"offer",
buyer:string|null }`.

**`src/live/market.js` (new, pure).** `meanShape = mean(DEMAND_SHAPE)` as a module const.
- `exogenousBaseline(day, t)` → `CFG.spotBase * (1 + CFG.spotDaily*(interp(DEMAND_SHAPE,t)-meanShape)) * (1 + CFG.spotDrift*(day-1))`.
- `dailyBaseline(day)` → `CFG.spotBase * (1 + CFG.spotDrift*(day-1))` (for multi-day contract pricing).
- `reserveMargin(capacity, demand)` → `demand>0 ? (capacity-demand)/demand : 1`.
- `spotPrice({baseline, reserveMargin, scarcityMult=1, noise=0})` → `clamp(baseline + scarcityPremium(rm)*scarcityMult + noise, CFG.spotFloor, CFG.spotCap)`.

```
scarcityPremium(rm):
  rm <= 0        → +CFG.scarcityMax                                   // tight/shortfall: PLATEAU (no deeper-shortfall windfall)
  rm <  rmRef    → +CFG.scarcityMax * (1 - rm/CFG.rmRef)              // linear max → 0
  rm <  rmCrash  → -CFG.crashMax * (rm-rmRef)/(rmCrash-rmRef)         // 0 → −crashMax
  else           → -CFG.crashMax                                      // flush: crash PLATEAU
```
The `rm<=0` plateau is the engine-protection keystone: a deeper shortfall never raises per-MWh spot,
so a shortfall is never more lucrative than a razor-thin-but-served grid. `scarcityMax ≫ baseline`
makes the player's own dispatch the dominant price-mover.

**`src/live/finance.js` (new — contracts portion).**
- `contractPrice(baseline, termDays)` → `round(baseline * clamp(CFG.hedgeBaseFactor + CFG.hedgeTermBonus*termDays, 0.5, CFG.hedgePriceCap))` (longer lock → better locked rate).
- `expectedOutput(peak)` → `round(peak * meanShape)` (sizes the hedge dial).
- `makeContract({mw,price,term,origin,buyer,seq})`.
- `settleContracts(contracts, served)` → `{contractedMW, deliveredContracted, contractRevenue}`; committed volume delivers first at locked prices, **proportional fill when short**, **reads only `served`, never `unserved`**.
- `expireContracts(S)` → decrement `remaining`, drop `≤0` (called from `surviveDay`).

**Revenue line — exact replacement of `sim.js:167-171`** (everything upstream — demand, capacity,
`dispatchHour`, `S.price`, `spin`, `fixedOM` — unchanged):
```js
const baseline = exogenousBaseline(S.day, S.t);
const rm = reserveMargin(S.capacity, S.demand);
const spot = spotPrice({ baseline, reserveMargin: rm, scarcityMult: S.mmods?.scarcityMult ?? 1, noise: S.spotNoise });
S.spotBaseline = baseline; S.spot = spot;
const { contractedMW, contractRevenue } = settleContracts(S.contracts, hr.served);
S.contractedMW = contractedMW;                               // exposed for D's spot-kill track
const residualMW = Math.max(0, hr.served - contractedMW);    // never negative, never unserved
const revenue = contractRevenue + residualMW * spot;
S.cash += (revenue - hr.varCost - spin - fixedOM) * dtH;     // unserved load still earns nothing
```
Reads **only `hr.served`** — identical decoupling guarantee to today. `S.price` (wholesale clearing)
is kept for the cost side and the existing ticker.

**Actions (`actions.js`, no DOM, guard `S.over` only).** `setHedge(S,frac)`, `hedgeContract(S,term)`
(one standing dial contract: `mw=round(S.hedge*expectedOutput(S.peak))`, `price=contractPrice(dailyBaseline(S.day),term)`),
`signContract(S,spec)`, `acceptOffer(S)`, `declineOffer(S)`.

**Mutators (`b4`).** Add `scarcityMult:1` to `freshMods()`; `fuel-spike` additionally does
`m.scarcityMult *= CFG.mut.fuelScarcity`.

**CFG added.** `spotBase:50, spotDaily:0.25, spotDrift:0.015, spotFloor:8, spotCap:320,
scarcityMax:240, crashMax:42, rmRef:0.25, rmCrash:0.80, hedgeDefault:0.5, hedgeBaseFactor:0.90,
hedgeTermBonus:0.035, hedgePriceCap:1.35, contractTermMin:2, contractTermMax:6, mut.fuelScarcity:1.4`.
Retire `retailPrice` (and update the `index.html`/`README.md` prose that mentions it).

**Tests.** `tests/market.test.mjs` (spot = baseline at `rm=rmRef`; `rm=0` and `rm=-0.5` give the
*same* clamped max — plateau; crash plateau at `rm≥rmCrash`; monotonic decrease across `[0,rmRef]`;
`scarcityMult=2` doubles premium magnitude both ways; noise linear; clamps). `tests/finance.test.mjs`
(contract-price monotonic in term + capped; `settleContracts` full vs proportional fill, never >
served; empty → zeros; `expireContracts`). `sim.test.mjs` additions (fresh-game defaults; hand-computed
residual-at-spot cash delta proving retail is gone; one fully-covered contract; shortfall uses served
not demand, residual ≥ 0).

**PRs.** `b1-market-module` (`market.js` + `rng.js` + spot CFG + test, no wiring), `b2-spot-revenue`
(revenue line + `S.spot*` state + retire retailPrice — the engine-adjacent change, reviewed alone),
`b3-contracts` (`finance.js` contracts + state + actions + `settleContracts`/`expireContracts` wiring),
`b4-mutator-compounding` (`scarcityMult`).

---

## 5. Phase C — Financing (the teeth)

**Goal & shippable value.** Debt with teeth: start clean, borrow by choice. A **credit standing**
sets both the interest rate and the borrowing ceiling; **default** craters it for the rest of the run
and marks the persistent record; **bankruptcy** (sustained insolvency / deep negative cash) is a new
fail-state beside the blackout. Interest is the fixed obligation that makes B's hedge floor matter.

**New state (`createGame`).** `debt:0, credit: profile.credit.standing (passed in), creditCap:100,
defaulted:false, insolventT:0, interestPaid:0, debtLedger:[]`. (Credit **initialised from the carried
standing** per §1.2, not a flat constant.)

**`src/live/finance.js` (credit/debt portion).**
- `creditRating(credit)` → `{ grade, rate, ceiling }`: `rate = rateMin + (rateMax-rateMin)*(1-credit/100)` (per **game-day**), `ceiling = round(ceilingMin + (ceilingMax-ceilingMin)*(credit/100))`, `grade = gradeFor(credit)`.
- `gradeFor(credit)` → AAA…D buckets (display only).
- `interestFor(debt, rate, dtH)` → `debt * rate * (dtH/24)`.
- `debtCapacity(S)` → `max(0, creditRating(S.credit).ceiling - S.debt)`.
- `creditTick(S)` → solvent days rebuild credit toward `creditCap` by `CFG.creditRecoverPerDay`.
- `isInsolvent(S)` → `S.cash < CFG.insolvencyFloor`.

**`step()` additions** (right after the B revenue line):
```js
const rate = creditRating(S.credit).rate;
const interest = interestFor(S.debt, rate, dtH);   // $ over this slice (dtH already baked in)
S.cash -= interest; S.interestPaid += interest;    // NOT folded into the ×dtH energy line (avoids ×dtH²)
```
Default + bankruptcy, beside the existing shortfall/strain block:
```js
if (isInsolvent(S)){
  if (S.debt > 0 && !S.defaulted) triggerDefault(S);        // once per spell: credit cratered, record marked
  if (S.cash < CFG.hardInsolvency){ gameOver(S, "Creditors wound up the utility — assets seized."); return true; }
  S.insolventT += dt;
  if (S.insolventT >= CFG.bankruptcyGrace){ gameOver(S, "Insolvent too long — the utility filed for bankruptcy."); return true; }
} else { S.insolventT = Math.max(0, S.insolventT - dt); }
```
`triggerDefault(S)` sets `defaulted=true`, `creditCap=CFG.defaultCeil` (the run scar), `credit=min(credit, CFG.defaultCredit)`, pushes a ledger entry, tickers a warning. Bankruptcy stands alone: a cash-only
over-build can go insolvent with `debt===0` and still die after the grace window (no default event).
The grace (`bankruptcyGrace` real-seconds ≈ a few game-hours) mirrors the brownout strain window —
an earned death.

**Actions.** `borrow(S,amount)` (refuse if `debt+amount > creditRating(credit).ceiling`; else `debt+=a;
cash+=a`), `repay(S,amount)` (`a=min(amount, debt, max(0,cash))`; `debt-=a; cash-=a`). Guard `S.over`
only. No RNG.

**`surviveDay()` hook.** `creditTick(S)` after B's `expireContracts(S)`; aggregate the day's
`interestPaid` delta into one `{type:"interest"}` ledger entry (one-per-day, not per-tick).

**Run-end wiring (`main.js`).** `commitCreditStanding(profile, S)` writes the carried standing back
(§1.2) and updates `best`/`everDefaulted`/`defaults`/`history`. Flows through the existing
`justEnded → endRun()` path; the bankruptcy `gameOver` needs no new glue.

**CFG added.** `creditStart:70, rateMin:0.012, rateMax:0.085, ceilingMax:400000, ceilingMin:0,
defaultCredit:20, defaultCeil:55, defaultFloor:40 (cross-run standing floor after a default),
creditRecoverPerDay:3, insolvencyFloor:0, hardInsolvency:-150000, bankruptcyGrace:6`.

**Tests.** `finance.test.mjs` (credit curves monotonic + endpoints; `gradeFor` buckets; `interestFor`
exact; `debtCapacity`; `creditTick`). `sim.test.mjs` (fresh defaults; borrow/repay clamps; interest
delta exact + `interestPaid` accrues; default scars once; bankruptcy grace + reset-on-recover; hard
insolvency instant; no-debt bankruptcy after grace). The persist record fields are covered by
`p0`'s migration test (§1.1).

**PRs.** `c1-finance-credit` (functions + test, no wiring), `c2-debt-state-actions` (state +
borrow/repay + interest into cash line + `creditTick`), `c3-bankruptcy-default` (default + both
bankruptcy paths). (The old `c4-persist` is absorbed into `p0`.)

**Determinism/engine notes.** All of C is pure functions of state and `dt`/`dtH` — no `Math.random`.
Interest is a cost term only; revenue derivation from `hr.served` is untouched, so a shortfall still
can't become a windfall. `engine.js` not imported.

---

## 6. Phase D — Scoring & stats hub

**Goal & shippable value.** Replace the single composite score with **four independently scored
tracks** — longevity, peak net worth (`cash − debt`), clean-energy share, biggest single spot-spike
killing — each converting to ⚡ on its own curve. Persist a best-per-track and expose it all as the
landing-hub scorecard. Money and clean play can finally *be* the point.

**Sim accumulators (`createGame`).** `cleanMWh:0, servedMWh:0, peakNetWorth:0, bestSpotKill:0`.
Per-tick, after the B/C economy lines:
```
for (tech, mw) in hr.stack: S.servedMWh += mw*dtH;  if CLEAN_TECHS.has(tech) S.cleanMWh += mw*dtH
S.peakNetWorth = max(S.peakNetWorth, S.cash - (S.debt ?? 0))
residualMW = max(0, hr.served - (S.contractedMW ?? 0))
spike      = max(0, (S.spot ?? S.price) - (S.spotBaseline ?? S.price))
S.bestSpotKill = max(S.bestSpotKill, residualMW * spike * dtH)
```
(All sibling reads use `?? 0`/`?? S.price` fallbacks so D degrades gracefully if run before B/C.)

**`meta.js` additions.**
`CLEAN_TECHS = new Set(["solar","wind","battery","nuclear","smr","geo","ccs_coal","ccs_gas"])`
(includes abated fossil — see open question). `SCORE_TRACKS` catalogue
`[{id,label,unit,reward(v)}]` for longevity/netWorth/cleanShare/spotKill. `scoreTracks(S)` →
raw values (`longevity=max(0,day-1)`, `netWorth=peakNetWorth`, `cleanShare=servedMWh>0?cleanMWh/servedMWh:0`,
`spotKill=bestSpotKill`). `currencyForRun(S)` → `max(1, Σ track.reward(value))` (replaces the old
single-score ⚡ award). `awardCurrency(profile, n)` — **the only ⚡-earn path**. `updateRecords(profile,
tracks, at)` — raises bests, returns new-best ids. `commitCreditStanding(profile, S)` — §1.2 (the only
credit writer). `scoreRun(S)` retained for legacy `best.{score,days,peak}` back-compat.

Run-end orchestration (`main.js`): `const t=scoreTracks(S); awardCurrency(profile, currencyForRun(S));
updateRecords(profile, t, nowISO()); commitCreditStanding(profile, S);` then the existing `best` write +
`saveProfile`.

**CFG.** `score:{ longevityPerDay:3, netWorthPerCoin:60000, cleanPerPct:0.4, spotKillPerCoin:4000 }`.

**Tests.** `tests/meta.test.mjs` (new — the file doesn't exist yet; add to chain): `scoreTracks` math
(clean share 0 when servedMWh 0; net worth uses cash−debt; spotKill picks max tick); `currencyForRun ≥ 1`
and sums the four; `updateRecords` only raises + returns right ids; `awardCurrency` never negative; and
the **currency-vs-credit isolation** test (each leaves the other untouched). `sim.test.mjs` (accumulators;
`cleanShare∈[0,1]`; `peakNetWorth` monotonic; `bestSpotKill` 0 with no spike).

**PRs.** `d1-score-tracks` (tracks + functions + accumulators + `meta.test.mjs` + `main.js` run-end wiring),
`d2-stats-hub` (hub scorecard render reading `profile.records`, `profile.credit`, and live `scoreTracks(S)`;
pure painter + `main.js` wiring — fills the placeholders reserved in Phase A).

---

## 7. Phase E — Earned forecast

**Goal & shippable value.** The spot forecast is **earned and conditional**: starts foggy; a
**forecasting-desk** research branch (gated behind the `forecasting` economy unlock) sharpens it; it
**degrades under volatility** (a market shock / the new `chaotic-market` mutator). This slice owns the
*accuracy model* (fog width); the band itself is drawn by the IA/economy layer.

**`src/live/forecast.js` (new, pure).**
```
forecastFog({ skill=0, volatility=0 }):
  sk = clamp(skill, 0, CFG.forecast.maxSkill)
  sharpened = CFG.forecast.baseFog * (1 - CFG.forecast.skillGain*sk)
  blurred   = sharpened * (1 + CFG.forecast.volK*volatility)
  return clamp(blurred, CFG.forecast.fogMin, CFG.forecast.fogMax)   // half-width as FRACTION of price
forecastInputs(S): { skill: S.rmods?.forecastSkill ?? 0,
                     volatility: (S.marketVolatility ?? 0) + (S.mmods?.volatility ?? 0) }
```
(Re-declare the two-line `clamp` locally to avoid a `sim.js` import cycle. The band geometry —
applying `fog` to a predicted price with a *separate* RNG stream, §1.6 — lives in the IA/economy layer.)

**`research.js` additions.** A `branch:"forecast"` gated `metaGate:"forecasting"`:
`fc-desk`(rp 50) → `fc-models`(rp 70) → `fc-nowcast`(rp 95). `computeResearchMods` returns
`forecastSkill: has("fc-nowcast")?3 : has("fc-models")?2 : has("fc-desk")?1 : 0`.

**`mutators.js` addition.** `volatility:0` in `freshMods()`; a `chaotic-market` deck entry doing
`m.volatility += CFG.mut.chaosVol`. (Distinct axis from B's `scarcityMult`, §1.4.)

**CFG.** `forecast:{ maxSkill:3, baseFog:0.30, skillGain:0.28, volK:1.2, fogMin:0.04, fogMax:0.60 },
mut.chaosVol:0.6`.

**Tests.** `tests/forecast.test.mjs` (fog monotonic down in skill / up in volatility; clamped; equals
`baseFog` at 0/0; `forecastInputs` sums volatilities + pulls `forecastSkill`). `mutators.test.mjs`
(`chaotic-market` lifts `mmods.volatility`; day-1 fairness invariant still holds since it touches no
demand/fuel/cf term). `research.test.mjs` (forecast branch locked without the `forecasting` unlock;
`forecastSkill` 0→3 with prereqs).

**PRs.** `e1-forecast-model`, `e2-forecast-research`, `e3-chaotic-mutator`.

---

## 8. Phase F — Meta blooms

**Goal & shippable value.** Complexity blooms across runs. Adds economy unlocks, run-length growth,
the capacity market (advanced tier), and named-buyer special offers.

**`meta.js` — economy unlocks** (one-time buys, own tab beside Skills | Research-Unlocks; `profile.economyUnlocked` from `p0`):
```
ECONOMY_UNLOCKS = [
  { id:"forecasting",     name:"Forecasting Desk", cost:5, desc:"Unlock the in-run forecasting research branch" },
  { id:"capacity-market", name:"Capacity Market",  cost:8, desc:"Get paid for available reserve MW (advanced tier)" },
  { id:"special-offers",  name:"Rolodex",          cost:4, desc:"Named buyers bring occasional standout contracts" },
  { id:"runlen-1", name:"Longer Shifts I",   cost:4, desc:"+2 max run days" },
  { id:"runlen-2", name:"Longer Shifts II",  cost:6, desc:"+2 more", prereq:"runlen-1" },
  { id:"runlen-3", name:"Longer Shifts III", cost:8, desc:"+3 more", prereq:"runlen-2" },
]
buyEconomyUnlock(profile, id)   // mirrors buyUnlock; spends ONLY currency; respects prereq
runLengthFor(profile) → CFG.run.baseDays + owned runlen tiers   // 5 → up to 12
```

**Run-length growth.** `createGame(..., economyUnlocked, maxRunDays)` stores `S.economyUnlocked`,
`S.maxRunDays`. In `surviveDay`, exceeding `maxRunDays` ends the run as a **graceful win**:
`S.over=true; S.won=true; S.reason="Contract complete — N days operated."` `main.js` passes
`runLengthFor(profile)` and `profile.economyUnlocked`.

**`src/live/capacity.js` (new, pure; gated by `economyUnlocked["capacity-market"]`).**
`capacityPayment(obligation, dtDays)` (availability revenue), `capacityShortfall(obligation,
deliverableMW)`, `capacityPenalty(obligation, deliverableMW)` (breach fine), `rollCapacityCall(S, rng)`
(called more under tightness; caller-supplied rng). Per-tick in `step()` when `S.capacityObligation`:
accrue payment; on a new-hour call, if short, `S.cash -= capacityPenalty(...)` — a recoverable breach
fine that **never itself sets `S.over`** (only sustained insolvency does). Obligation:
`{ reserveMW, pricePerMW, termDays, daysLeft, calledToday }`.

**`src/live/offers.js` (new, pure; §1.3).** `BUYERS` roster; `rollSpecialOffer(S, rng)` → `null`
without the `special-offers` unlock, else a deterministic `{id,buyerName,mw,priceMult,termDays,expiresDay}`.
`main.js` rolls it at day rollover (`S.pendingOffer = rollSpecialOffer(S, S.rng)`); the Desk→Contracts UI
renders/accepts it, applying `priceMult` to the B term-contract rate; offers expire at `expiresDay`.

**CFG.** `run:{ baseDays:5, tier1:2, tier2:2, tier3:3 }, capacity:{ pricePerMW, penaltyPerMw, callBaseProb },
offers:{ dailyChance:0.25 }`, economy-unlock costs live on the entries above.

**Tests.** `meta.test.mjs` (`buyEconomyUnlock` spends currency, respects prereq, idempotent, never
touches credit; `runLengthFor` 5→12). `tests/capacity.test.mjs` (payment linear; shortfall/penalty
zero when covered, correct when short; `rollCapacityCall` deterministic + rises with demand/capacity).
`tests/offers.test.mjs` (`null` without unlock; deterministic under fixed rng; fields within ranges;
`expiresDay===day+1`). `sim.test.mjs` (hitting `maxRunDays` ends with `won===true`; capacity payment
increments cash; a called-and-short tick deducts exactly the penalty and does **not** set `S.over`).

**PRs.** `f1-economy-unlocks` (unlocks + run-length win-state — note this enables the `forecasting`
gate Phase E reads; no-op until bought), `f2-capacity-market`, `f3-special-offers`, `f4-meta-tab-ui`
(third meta tab + Desk surfacing of offer/capacity).

---

## 9. Phase G — Balance pass + cross-cutting guardrails

**Goal.** Tune the book with data, not vibes, and lock the invariants that keep the verified core
verified.

**Determinism contract (§1.6 restated as the review gate).** One seeded PRNG (`src/live/rng.js`,
`makeRng(seed)`), created in `main.js` at run start, `S.seed` stored, `S.rng` threaded to all
caller-supplied draws (spot noise, offers, capacity calls). `market.js`/`finance.js`/`forecast.js`/
`capacity.js`/`offers.js` **never** call `Math.random()`; the forecast uses a separate stream so it
can't desync the realized-spot sequence. Weather/trips stay on global `Math.random` as today (v3
precedent — statistical reproducibility, isolated in tests).

**Regression guardrails (must stay green).**
| Invariant | Protected by |
|---|---|
| Engine clearing unchanged | existing `engine.test.mjs` (exact) + PR-review gate: no economy PR edits `engine.js` |
| Unserved load earns nothing / shortfall never a windfall | existing `engine.test.mjs` #10 + **new sim guard**: a scripted shortfall hour earns `spot×served` with `served<demand`; a blacked-out hour earns 0; the `rm≤0` spot plateau |
| Sim determinism of new noise | **new** market/finance determinism test: same `seed` + same scripted actions → identical spot series + offer sequence |
| Cash/book conservation | **new** property guard: each tick `Δcash + Δdebt == revenue − varCost − spin − fixedOM − interest − penalties` |
| Persist chain | the `p0` v1→v2→v3 migration test |
| Mutator day-1 fairness, financial sibling | extend `mutators.test.mjs` #7: no single mutator makes day-1 an unavoidable bankruptcy |

**Tuning-knob catalogue (targets for the `g3` sweep).** Spot: `spotBase` (anchor day-1 to old retail
feel), `baselineVol`/`spotDaily` (calm-market CoV 0.15–0.30), `scarcityMax`/`rmRef`/`rmCrash`/`crashMax`
(premium ≈0 above ~25% margin, bites below ~8%), `spotCap≤PRICE_CAP`. Contracts: `hedgeTermBonus`
(longer lock → better but committed), `hedgeDefault`. Finance: `rateMin/Max` + ceilings per rating,
`creditRecoverPerDay`, `defaultCeil/Credit/Floor`, `hardInsolvency`, `bankruptcyGrace`. Forecast:
`baseFog`, `skillGain`, `volK`. Capacity: `pricePerMW`, `penaltyPerMw` (reserve pays modestly; a breach
stings but isn't fatal). Meta: economy-unlock costs, `run.*` run-length pace.

**Harness (`tools/balance.mjs`) extensions.** A **`desk(S, persona)`** morning hook (sets hedge from
forecast + persona; accepts/declines offers; borrows/repays by credit health). **Hedge personas**
(`hedger ~85%`, `balanced ~50%`, `naked ~10%`, `forecast-reactive`) run across the batch to measure
strategy spread. Spot/forecast-aware `play(S)` (arm peakers / fire battery when forecast spot spikes;
hold off when spot is low and margin comfortable). Bankruptcy death-cause classification. New report
sections: median run length by persona, hedge-ratio distribution, bankruptcy rate (share of runs &
deaths), realized spot volatility, net-worth distribution, credit-rating curve, per-mutator *financial*
lethality. **Log the seed** per run for replay.

**"Balanced" targets.** Median run length in the tier band (~5 days at base, growing with unlocks);
no persona dominates both survival *and* net worth (`naked` = highest net-worth tail + highest bust
rate; `hedger` = steady, thinner tail); bankruptcy a real but minority death cause (~15–35% of deaths —
blackout stays the majority, the grid is still the live hero); realized spot CoV inside its design band;
hedging neither pointless nor mandatory (each is best under *some* mutator).

**PRs.** `g1-harness-economy` (harness only — no CFG/sim change, so nothing regresses; built early, run
throughout), `g2-guard-tests` (the cross-cutting guards above not already shipped with their phase),
`g3-tuning` (CFG values only — any moved exact-number test is reviewed as an *intended balance change*,
never a logic change), `g4-pace` *(optional — isolate unlock-cost + `maxRunDays` growth tuning)`.

---

## 10. New files & test manifest

**New source modules:** `src/live/rng.js` (b1), `src/live/market.js` (b1), `src/live/finance.js`
(b3/c1), `src/live/fleetsort.js` (a2), `src/live/forecast.js` (e1), `src/live/capacity.js` (f2),
`src/live/offers.js` (f3).

**New test files (append each to the `npm test` chain in `package.json`):** `tests/fleetsort.test.mjs`,
`tests/market.test.mjs`, `tests/finance.test.mjs`, `tests/meta.test.mjs` (new — none existed in v3),
`tests/forecast.test.mjs`, `tests/capacity.test.mjs`, `tests/offers.test.mjs`. Extended:
`tests/sim.test.mjs`, `tests/persist.test.mjs`, `tests/mutators.test.mjs`, `tests/research.test.mjs`.

**Retired:** `CFG.retailPrice` (b2), and its prose in `index.html` / `README.md`.

---

## 11. Resolved decisions (locked 2026-10-25)

All twelve open questions are decided per the recommended defaults (the four that had
no prior rec are decided explicitly). These are binding for the build.

**Economy feel (affects B/C tuning, decide before `g3`):**
1. **Contract under-delivery teeth.** Sell-only core = a trip during a spike costs you only the lost
   residual upside + the undelivered block's revenue (debt service in C carries the real downside). Add
   an explicit under-delivery *breach fine* now, or let lost upside + interest be enough for B? (Rec: no
   explicit fine in B; the capacity market in F is where deliver-or-pay lives.)
2. **`spotNoise` in B.** Ship B with `spotNoise` always 0 (scarcity is the only mover — cleanest,
   most legible balance) and defer stochastic shocks to E's chaotic market? (Rec: yes.)
3. **Interest while insolvent.** Interest keeps accruing once cash is negative (compounding the spiral —
   intended teeth). Confirm you don't want it to pause when insolvent.
4. **Clean-share definition.** Does CCS (abated fossil) count as "clean"? Spec'd **yes** via
   `CLEAN_TECHS` for a kinder curve; one-line edit to make it zero-direct-emission only.

**Structure (affects data shape, decide before the owning phase):**
5. **One revolving debt balance vs. multiple loans.** Spec'd a single `S.debt` + an event ledger
   (operator-simple). Distinct loans with their own terms is a richer book but a bigger structure in
   `finance.js`/actions.
6. **One standing hedge contract vs. accumulating.** `hedgeContract` replaces the prior dial contract
   (one dial at a time). Alternative: each morning stacks a new short contract. (Rec: replace-model.)
7. **In-force contract at a run-end win.** When a run hits `maxRunDays` with a live multi-day contract,
   does it settle, void, or score? Needs a rule (interacts with the net-worth track).
8. **Net worth.** `cash − debt` for v4; mark-to-market open contracts + fleet salvage deferred to v5.
   Confirm.

**Balance/process (affects `g3`, can decide during the harness pass):**
9. **Target bankruptcy share** — is ~15–35% of deaths the right "real but not dominant" band?
10. **Run-length tiers** — confirm ~5 base → 8 → 12, or give exact tiers.
11. **Harness as a gate** — should `balance.mjs` exit non-zero when aggregate targets miss (a pseudo-CI
    check, since the repo has no CI), or stay report-only like v3? (Rec: report-only; judgment in `g3`.)
12. **Fully-replayable runs** — fold weather/trips into `S.rng` too (bit-reproducible bug reports), or
    leave them on global `Math.random` as v3 does and only seed the economic noise? (Rec: leave weather;
    seed only the economy — less churn.)

**Decisions (binding):** (1) no contract breach-fine in B — lost upside + interest are the teeth,
deliver-or-pay lives in F's capacity market; (2) `spotNoise` is always 0 in B, stochastic shocks
deferred to E; (3) interest keeps accruing while insolvent (intended); (4) CCS counts as clean in
`CLEAN_TECHS`; (5) single revolving `S.debt` + event ledger, not multiple loans; (6) one standing
hedge contract (replace model); (7) a run-end win voids open contracts cleanly (no settlement, no
penalty); (8) `netWorth = cash − debt` (mark-to-market + salvage → v5); (9) target bankruptcy share
~15–35% of deaths; (10) run-length tiers 5 → 7 → 9 → 12 days (`run.baseDays:5, tier1:2, tier2:2,
tier3:3`); (11) the balance harness is report-only (no non-zero gate; judgment in `g3`); (12) weather
and trips stay on global `Math.random`, only the economic noise is seeded via `S.rng`.
