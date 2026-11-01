# Grid Operator v5.4 — "The Instrument" (master index)

> **Status: SCOPED via design grill (2026-10-31), then REVISED against a code-grounded review pass
> (DeepSeek, 2026-11-01). Ready for Phase 1.** The review verified every load-bearing claim against the
> v5.3 code and returned *yes-with-changes*: the keystone (flow-only deck) survives, but three mechanisms
> were wrong and are now corrected in this spec — (1) `flowRate` must *recompute* the true net including
> VOLL, not read `S.flowRate`; (2) the pierce keys off `stabFrac ≥ stabilityDanger`, not `autoPause`; (3)
> the summon seam is a new `S.bookOpen` flag, **not** a `calendar.mode` value (which would have frozen the
> clock). Phases 4 and 5 are coupled by the keystone and ship as a pair (or with a temporary cash readout).
> See [Review resolutions](#review-resolutions-what-changed-after-the-pass).
> v5.3 made the economy *correct and self-defending*; its playtest left two legibility findings on the
> table (live VOLL/unserved not attributed; "debt-free" shown at negative cash) and an explicit note that
> a **UI legibility pass** was deferred to the next milestone. v5.4 is that milestone — but the grill
> widened it: with the game now a persistent ops-sim whose economy is honest, the UI is the thing lagging
> the game. This is a **view rewrite, not a game rewrite.** The engine, merit-order clearing, economy, and
> `S` shape stay exactly as v5.3 left them. The definition of done is **legibility and identity, delivered
> as one thing** — you can always tell *why* you made or lost money, and the screen reads as a single
> designed machine rather than a dashboard.

## The principle (why this milestone exists)

v5.3's playtest proved the economy is correct but *not yet legible*: the board review shows a P&L, but the
live screen never attributes the costs it's accruing, and some readouts contradict the model ("debt-free"
at negative cash). The grill then established the deeper claim that shapes the whole milestone:

> **Legibility and identity are the same job.** Causation becomes readable *through* authentic instruments —
> a gauge that rises as the stack climbs toward demand teaches the mechanism in a way a number in a card
> never will. We are not choosing between "readable" and "characterful"; the characterful instrument *is*
> the readable one. A redesign that chased style without legibility, or bolted on explanations without
> rethinking the surface, would miss on both.

A second principle carries over from v5.3 and bounds this milestone hard:

> **The clearing logic is sacred — the view is not.** `engine.js`'s merit-order dispatch math and the v5.3
> economy are untouchable. v5.4 touches **only the view and a thin, additive seam** (a new display mode, a
> read-only flow projection, a mode-close hook, and attribution data the verdict already has). It changes
> **no clearing, no incentive, no balance number.** If a v5.4 change would move a single economic outcome,
> it is out of scope by definition.

## The problem (what the game's own surface fails to say)

- **L1 — the live screen hides causation.** The economy accrues VOLL on forced-unserved load and earns a
  continuous `priceServed`, but the operating screen shows neither *why* the price is what it is nor *that*
  you are bleeding VOLL right now. The playtest's #1 finding.
- **L2 — readouts contradict the model.** "Debt-free" renders at negative cash; status language lags the
  numbers. The playtest's #2 finding — a trust leak.
- **L3 — the fleet reads as a spreadsheet, not a fleet.** Rows of per-plant numbers in dispatch-role lanes
  (v5.1 Phase 7) are information-complete but feel like a table to scan, not iron to operate. The grill's
  pivot: *"feels like a spreadsheet and not managing a fleet."*
- **L4 — one undifferentiated surface.** Live operations and finance share one flat idiom, so the screen
  reads as a dashboard of equal cards. Nothing signals the two rhythms of the game (the live grid you
  operate second-to-second vs. the book you reckon with periodically), and nothing makes the whole thing
  feel like a single device with a point of view.

## The fix (the grill's locked model, in one picture)

The UI is authored as **three independent layers** — see [the layer model](#the-three-layer-model) below —
plus a **two-surface spine** housed by **rhythm**, not by a seam on screen:

| Concept | Locked decision |
| :-- | :--- |
| **Spine** | **Two rhythms, operations-first.** The live *deck* is the constant on screen; the finance *Book* is *summoned*. The game is called Grid **Operator**. |
| **Archetype** | **Instruments for the deck; a terminal (Bloomberg-style) for the Book.** Two materials housed by *rhythm* (live vs summoned), never forced side-by-side. |
| **Summoning** | **Full-screen takeover, clock keeps running.** Opening the Book does not pause the sim — studying contracts is time not spent watching the stack. |
| **Pierce** | **The Book tolerates drift; only true blackout-imminent danger interrupts it** — fires on `stabFrac ≥ stabilityDanger` (the existing v5.3 threshold, config.js:481), **not** on `autoPause` (which only catches a single straining plant, never a pure capacity shortfall). The skin's grid-state bleed must also render *over* the Book, so a filling reservoir is visible there. Knowing *when the grid is calm enough to look away* is part of the skill. |
| **Deck finance** | **Flow only on the deck** (earn/burn $/h + its driver + the spot "why" line). `flowRate` **recomputes the true net** — including the VOLL rate — so the pulse *craters* during a forced-unserved event instead of reading healthy. **Cash-on-hand lives only in the Book** — you must go reckon to know where you stand. |
| **Solvency** | **No financial pierce.** Grid danger interrupts; going broke never does. The deck's flow instrument is your only early warning. |
| **Materials** | **Three, by role not region** — `frame` / `deck` / `Book` — with a possible fourth *ceremony* variant (brief/verdict). The anti-slop rule: materials track roles; regions that do the same kind of thing share a material. |
| **Skin** | **One dynamic lens over everything** — grain/glow + era recolour + grid-state bleed. Promotes machinery that already exists (`body[data-era]`, the stability vignette) into a first-class layer. |
| **Vocabulary** | instrument (read) · tile (act) · annunciator (read-that-demands-act) · log/tape (sequence) · forecast (future) · verdict (ceremony) · ticker (ambient). Rejected: mimic/one-line diagram (no transmission topology exists — single-bus merit order), continuous throttle dials (v5.3 deleted them — commit-only). |
| **Tech** | **Lane (a): no build, no framework, native platform** — SVG + modern CSS (`conic-/radial-gradient`, `clip-path`, blend modes) + container queries + the View Transitions API. The repo's defining asset; preserved. **Decided in review:** tiles are plain `render()` functions, **not** `<unit-tile>` custom elements (Web Components is a real architectural commitment with no payoff here); **Web Audio is cut from this milestone's scope** (deferred, not toolkit). |
| **Rollout** | **Incremental, in safe slices** — *not* big-bang. Each phase is a landable PR, tests green, `main` shippable throughout. Legibility ships first. |

### The three-layer model

```
   ┌───────────────────────────────────────────────┐   on top
   │  SKIN      one lens over everything             │
   │            grain · glow · era · grid-state      │
   ├───────────────────────────────────────────────┤
   │  MATERIALS what each region is made of          │
   │            frame · deck · Book  (by ROLE)       │
   ├───────────────────────────────────────────────┤
   │  STRUCTURE the regions themselves               │
   │            top bar · chart · fleet · deck · Book│
   └───────────────────────────────────────────────┘   base
                         ↓
            = one device, read as a single machine
```

The skin being *one lens over all of it* is what lets the deck and the Book be genuinely different
materials underneath and still read as the same machine — the two-material contrast becomes a *mode change*
felt at the View-Transition morph, not a permanent seam down the middle. This is the Split Cockpit's real
insight (operations and finance have different information natures) relocated off a static left/right split
and onto rhythm.

## The keystone: the deck/Book boundary (why the second surface earns its keep)

The whole two-surface design stands or falls on one decision, locked in the grill: **the deck shows flow,
the Book shows the stock.**

- The **deck** carries the earn/burn *rate* ($/h) and its driver, plus the spot "why" line — enough to feel
  money moving and to catch a VOLL spike as the flow craters. **This only works if `flowRate` recomputes the
  true net** (revenue − fuel − fixed − interest **− the VOLL rate on forced-unserved MW**); v5.3 sets
  `S.flowRate` *before* subtracting VOLL (sim.js:540-574 vs. :623-624), so reusing that field verbatim would
  show healthy flow during a blackout — the one thing the deck exists to warn about. It does **not** show
  cash-on-hand.
- The **Book** carries cash-on-hand, quarter-to-date P&L, the contracts desk, and the tape — the full
  reckoning. You go there to answer "where do I actually stand?"

This makes the Book *structurally necessary* (you cannot read your solvency without it) and keeps the deck
honest to live operations. It is also what makes the drift-tolerant pierce playable: flow on the deck is the
early warning that tells you whether the grid (and the money) is calm enough to spend attention on the Book.
A deck that also showed cash would make the Book redundant; a deck that showed nothing financial would be
blind. Flow-only is the one split that keeps *both* surfaces load-bearing.

---

## The phases

Each phase is its own PR (per the repo's per-PR flow), test-green and independently landable. Legibility
first, by design — it is the known debt and needs no new shell, so it ships value in week one and de-risks
the visual work behind it.

| # | Phase | Doc | Owns | Status |
| :-- | :--- | :--- | :--- | :--- |
| 1 | **Legibility in the current UI** | [phase-1-legibility.md](phase-1-legibility.md) | `render.js`/`verdict.js`/`scorecard.js` read-side only: VOLL/unserved attribution in the board review (L1), the spot "why" line (L1), the "debt-free"/negative-cash contradiction (L2), and the **duplicate price tiles** (`Wholesale`/`s-price` and `Spot · P&L`/`cl-spot` are the *same* number since v5.3 — sim.js:410/465 — merge or relabel). No new shell, no model change. | ⬜ not started |
| 2 | **Prototype gate (decide the look)** | [phase-2-prototype-gate.md](phase-2-prototype-gate.md) | *No production code.* A throwaway static mockup of the deck + a summoned Book under one skin, in candidate material pairings; react; **pick the material look.** Gates 4–5. | ⬜ not started |
| 3 | **The skin layer** | [phase-3-skin-layer.md](phase-3-skin-layer.md) | Promote `body[data-era]` + the stability vignette into one first-class global skin layer (grain/glow + era recolour + grid-state bleed); scaffold the three material tokens. Lands over the *current* regions. | ⬜ not started |
| 4 | **The live deck** | [phase-4-deck.md](phase-4-deck.md) | Rebuild the operating screen as instruments + tiles under the `deck` material: chart as the master instrument, fleet as dispatchable **tiles** (kill the spreadsheet, L3), the flow pulse (flow-only), KPI chips as instruments set in the `frame`, stability strip. | ⬜ not started |
| 5 | **The Book** | [phase-5-book.md](phase-5-book.md) | New `S.bookOpen` full-screen overlay (clock keeps running), View-Transition morph, drift-tolerant pierce (`stabFrac ≥ stabilityDanger` closes the Book), no financial pierce; cash-on-hand + contracts desk + QTD P&L + tape under the `Book` material. **Ships paired with 4** (keystone-coupled). Final material touch-up lands here. | ⬜ not started |
| 6 | **Capstone + playtest gate** | [phase-6-capstone-playtest.md](phase-6-capstone-playtest.md) | Fleet-at-scale **only**: rhythm-dependent decomposition + **promotion-by-exception** (a troubled plant jumps to a tile mid-operating). The human playtest gate (also closes v5.3's outstanding human gate). *(Material look is finalized in Phase 5, not here.)* | ⬜ not started |

**Dependency order:**

```
1 (legibility, standalone)   ── ships first; needs no new shell
2 (prototype gate, no code)  ── runs parallel to 1; DECIDES the look that 4 & 5 build to
      → 3 (skin layer)        ── global lens over current regions, persists through the rebuild
          → 4 + 5  ───────────── COUPLED by the keystone (see below): deck removes cash,
            (deck, then Book)    Book is where cash lives — can't ship one without the other
                  → 6 (capstone fleet-at-scale + human gate)
```

Phase 1 is independent of everything and ships first. Phase 2 is a decision activity, not a shipping slice,
and gates the *look* of 4–5 (not 1 or 3's plumbing). 3→4→5 is strict: the skin establishes the lens, the
deck is rebuilt under it, the Book is the last new surface.

**Keystone coupling (review's deepest finding).** The flow-only decision makes 4 and 5 *interdependent*,
not independent: cash-on-hand lives today in the frame's top bar (`s-cash`, index.html:34, render.js:115/175),
**not** in the modal Desk. So the moment Phase 4 removes cash from the deck, solvency has *no surface at all*
until Phase 5 lands the Book — a whole shipped phase with the player unable to see where they stand. Two
ways to honour "`main` shippable throughout," and this spec takes the second to preserve incremental slices:
**(a)** ship 4 and 5 as one PR pair (cash removal gated on the Book landing); **(b)** Phase 4 leaves a
*temporary, explicitly-marked* cash readout (a frame sub-line) that Phase 5 deletes when the Book takes over.
We take **(b)** — it keeps each slice independently landable (the whole reason big-bang was rejected) and the
temporary readout is a one-line stopgap, not a second finance surface. The spot where they re-converge is a
single commit in Phase 5.

---

## Shared interface contract (the thin, additive seam)

v5.4 is a view milestone. The model seam is deliberately tiny — **no clearing, economy, incentive, or
balance change.** Everything below is additive view-state or a read-only projection.

```js
// Phase 5 — a new OVERLAY flag, NOT a calendar.mode value. (Review catch: step() hard-returns unless
//   calendar.mode==="operating" (sim.js:307) and frame() has no "book" branch (main.js:190-211), so a
//   "book" mode would FREEZE the clock and render the DECK — the exact opposite of the locked decision.)
S.bookOpen === true;          // full-screen summoned terminal drawn by render(); calendar.mode STAYS
//   "operating", so step()/frame()/the clock run completely unchanged and every existing
//   `mode==="operating"` guard (Manage, pause, keys — main.js:85/95/228/234) keeps working for free.
//   UNLIKE "brief" (which pauses via autoPause, brief.js:86), bookOpen does NOT pause — the day keeps
//   advancing while you read. The drift-tolerant pierce: while bookOpen, `stabFrac >= stabilityDanger`
//   (config.js:481) force-closes the Book → deck. (NOT autoPause: that only fires on a single straining
//   plant, sim.js:378 — it misses a pure capacity shortfall, which is the actual fatal path.) Nothing
//   financial ever closes the Book: money is non-fatal in v5.3, so "no financial pierce" is free.
// A day/quarter boundary while bookOpen: surviveDay closes the Book first (clear bookOpen → deck), THEN
//   the brief/planning beat runs — so bookOpen never races the frame's brief/planning branches.

// Phase 1/4 — the flow projection (read-only; NOT an engine field)
flowRate(S) → { perHour, driver };   // pure selector, but it RECOMPUTES the true net/h — it must NOT
//   return S.flowRate, which v5.3 fixes before subtracting VOLL (sim.js:540-574 vs :623-624). perHour =
//   revenue − varCost − effSurcharge − spin − fixedOM − interest + capacityPay − VOLL-rate (and, ideally,
//   − recharge − R&D − capacity-call fines). driver names the dominant term (incl. "VOLL" when unserved>0),
//   so the pulse craters AND says why. Computes nothing the economy doesn't already determine; adds no
//   state. Mirror of v5.3's "additive output, no clearing change" discipline.

// Phase 1 — attribution the verdict already has, surfaced
verdict/scorecard: expose the EXISTING VOLL / unserved / opCost breakdown to the board-review view and a
//   live attribution line. No new number is computed — v5.3 already accrues these; v5.4 only displays them.

// Phase 3 — the skin layer (promotion of existing machinery)
body[data-era]          // EXISTING (v5 Phase 9) — era recolour; becomes a skin input, unchanged semantics
S.stability  → stabFrac // EXISTING (v5.3) — vignette; becomes the grid-state bleed input, unchanged
CFG.v5_4.skin = { … };  // NEW config: grain/glow/bleed params (cosmetic only)

// Phase 4/5 — cosmetic config
CFG.v5_4.ui = { flowThresholds, materials, bookMorph, … };  // display thresholds + tokens; NO economy
```

### Signatures (new / changed / retired)

| Signature | Phase | Note |
| :--- | :--- | :--- |
| `S.bookOpen` boolean (NOT a `calendar.mode` value) | 5 | new overlay flag; `calendar.mode` stays `"operating"` so `step()`/`frame()`/clock run unchanged; non-blocking |
| `flowRate(S) → {perHour, driver}` | 1/4 | **read-only** pure selector; no state, no engine field — but **recomputes** net incl. VOLL (must not return `S.flowRate`) |
| `stabFrac ≥ stabilityDanger` while `bookOpen` → close Book | 5 | the *only* pierce; reuses the existing v5.3 danger **threshold** (config.js:481), not `autoPause` |
| boundary (day/quarter) while `bookOpen` → close Book, then beat | 5 | surviveDay clears `bookOpen` before the brief/planning transition; no race |
| skin layer reads `data-era` + `stabFrac` | 3 | promotion of existing hooks; semantics unchanged |
| the v4.2/v5.1 flat fleet lane tables (`buildUnits` row idiom) | 4 | **retired** — replaced by dispatchable tiles (information preserved, idiom changed) |
| continuous throttle dials | — | already retired in v5.3; v5.4 does **not** reintroduce them |

---

## Review resolutions (what changed after the pass)

The DeepSeek pass (2026-11-01) read all seven docs and checked the load-bearing claims against the v5.3
code. Verdict: *implement it, with changes*. How each of the six grill open-questions resolved, plus the
seam audit:

1. **Flow-only deck (the keystone) — decision survives, mechanism was broken (BLOCKER, fixed).** Hiding
   cash is sound *and lower-stakes than feared*: v5.3 made insolvency non-fatal (VOLL capped at $2M/qtr,
   runs only end on the stability bar), so the real question is "did the *grid* collapse while I read," not
   "did I lose money." But both of the spec's safety arguments were false by code: (1) the flow pulse would
   have read `S.flowRate`, which is set *before* VOLL is subtracted — so it would show healthy during a
   blackout; **fixed** by making `flowRate` recompute the true net incl. VOLL. (2) The pierce cited
   `autoPause`, which only fires on a single straining plant and misses a pure capacity shortfall (the
   actual fatal path); **fixed** by keying the pierce on `stabFrac ≥ stabilityDanger` and requiring the
   skin's grid-state bleed to render over the Book. No new threshold added.
2. **Skin before deck — keep, do not merge 3+4.** Confirmed sound: the skin is genuinely independent of
   region materials and is the cheapest high-leverage surface; merging it into the deck would reintroduce
   the big-bang we rejected. One line added to Phase 3: the grid-state bleed must render over the Book too.
3. **Prototype gate — keep, but timeboxed.** Confirmed the right instrument for the one ungrillable (feel)
   call. **Cut** the optional third single-material variant as padding — two candidate pairs are enough.
4. **Six phases — count is fine; Phase 6 was over-stuffed (fixed).** 3+4 merge rejected (see #2). The real
   mis-decomposition was the other end: "finalize the look" inside Phase 6 implied Phase 5 ships with an
   unsettled look. **Fixed** — final material touch-up folds into Phase 5's done-when; Phase 6 is now
   promotion-by-exception only; the playtest is a gate, not phase content.
5. **Interim half-migrated look — wrong question (fixed, and it was deeper).** The old "Book" is the Manage
   modal's Desk, but **cash lives in the frame's top bar**, so Phase 4 removing cash leaves solvency with
   *no surface* until Phase 5 — worse than a cosmetic mismatch. **Fixed** by coupling 4+5 (see
   [Keystone coupling](#the-phases)): Phase 4 leaves a temporary cash readout that Phase 5 deletes.
6. **`priceServed` "why" line — real, low, plus a missed cousin (fixed).** Copy fix is a verb choice: the
   price is *demand-driven* ("demand climbed into the gas band, so gas sets the price"), never "you set the
   price." The cousin the grill missed: `S.price` and `S.spot` are the *same* number since v5.3, yet the
   HUD shows two tiles — **added** to Phase 1 (merge or relabel), or the "why" line explains a number shown
   twice.

**Seam audit.** The only item flagged as a disguised change was the summon seam: a `calendar.mode === "book"`
value would have frozen the clock (`step()` hard-returns off `"operating"`) and rendered the deck — the
opposite of the locked decision. **Fixed** by using a separate `S.bookOpen` flag with `calendar.mode` left
at `"operating"`. `flowRate` and the pierce fixes are folded in above. A day/quarter boundary arriving while
the Book is open now has an explicit rule (close the Book, then run the beat). Everything else in the seam
(attribution from the verdict; cosmetic `CFG.v5_4.*` tokens) audited clean, with the one caveat that
`flowThresholds` must stay display-only and never feed interruption logic.

---

## Deferred past this milestone (explicitly out of scope)

- **The fail-state / "no-game-over" principle.** Still shelved. v5.4 changes *how the game reads*, not
  *how a run ends*; the §4 blackout→CRT-reboot moment stays out (hostage to this decision). The principle
  decision is a milestone of its own, now informed by a legible game.
- **The exact material *look*** is decided in Phase 2 by prototype, not pre-specified here — by design.
- **Any economy/balance change.** v5.4 touches no number that affects an outcome. Balance work remains the
  v5.3 harness's domain.
- **Audio.** Web Audio was cut from this milestone's scope in review (it was listed but unused). A sound
  pass is a later milestone of its own.
- **Mobile/responsive hardening** beyond "does not break" — the deck/Book is designed desktop-first; a
  dedicated small-screen pass is later.

---

*Decomposed from a design grill (2026-10-31) that began on the author's `DESIGN-ui-control-room.md`
direction doc and widened into a ground-up UI rethink for the current persistent-ops game. Sibling of
[`../plan-v5.3/`](../plan-v5.3/README.md); treat as the current best shared understanding, not frozen.
Revised against a DeepSeek review pass (2026-11-01), per the v5.3 precedent.*
