# v5.4 "The Instrument" — Phase 6 Capstone & Playtest Record

> The closing act of the [v5.4 UI-rewrite milestone](plan-v5.4/README.md): land fleet-at-scale on
> the Phase-4 deck, then run the playtest gate on a surface that can finally attribute its own
> economy — closing the human gate [v5.3 left open](PLAYTEST-v5.3.md#b-the-playtest-gate-human--partial-proxy-pass-human-gate-outstanding).
> Recorded per Phase 6. **No economy or clearing logic was touched anywhere in v5.4.**

## A. Fleet-at-scale (promotion-by-exception) — PASS

The deck no longer draws every plant as a full tile. The two **auto** lanes — *Baseload · firm* and
*Renewable*, the plants you set and forget — collapse into a one-line **capacity instrument**
(`N/total online · MW online / installed cap`), and only the plants that need you are left as tiles.
The two **dispatchable** lanes — *Dispatchable gas* and *Storage*, the ones you actually operate —
always show every tile. Full per-plant detail for a folded plant stays a planning-rhythm concern
(Manage / brief / board), exactly as the spec asks.

**Promotion-by-exception** reads the *same* trouble signal the rest of the game already exposes — the
new `needsAttention(u)` predicate in `fleetsort.js` is a pure read over `status` + `condition` +
`maintDown` (tripped · straining · in-shop · worn below the 85% trip-risk onset), a sibling of the
existing `attentionRank`. It is **not** a second "is this plant in trouble?" source of truth.

### Acceptance (browser, 1360-wide desktop)

- **At rest:** firm folds all 3 plants into `3/3 online · 570 MW / 570 cap · all nominal`; renewable
  folds both into `2/2 online · 86 MW / 380 cap · all nominal`; gas shows 3 tiles, storage 1. The
  spreadsheet is gone — the quiet fleet is one line per lane.
- **Promotion, mid-operating:** trip one firm plant and wear a second below the band, force a frame →
  both jump to tiles (`Harrowgate Nuclear [TRIPPED]`, `Blackmoor Coal [ONLINE]`), the healthy third
  stays folded, and the instrument flips to `2/3 online · 320 MW / 570 cap · 2 need attention ↓` with
  its alert accent. The fold/promote is **instant** (folded into the status-pill className rebuild),
  so a trip surfaces the moment it happens, not on the throttled readout cadence.
- **Determinism untouched:** 38 suites + the 9-assert incentive harness green; the stripped headless
  run is byte-identical (cash 171293 == 171293), confirming the change is purely render-side.
- **New unit coverage:** `tests/fleetsort.test.mjs` pins the predicate — tripped/strained/maint and
  worn-below-band promote; healthy thermal and condition-less idle renew/battery do not; the band is
  the documented trip-risk onset (85).

## B. The two v5.3 legibility findings — both CLOSED on this surface

v5.3's proxy playtest routed two findings to "the deferred UI pass with a concrete requirement." That
pass **was** v5.4. Both requirements are now met on the shipped surface:

| v5.3 finding | v5.4 requirement | Where it closed |
| :-- | :-- | :-- |
| #1 — the passive cash trough / VOLL penalty isn't attributed live | surface unserved-load/VOLL as a live line item | **Phase 1** read-side VOLL attribution line + the live price "why" line; confirmed in this session — tripping a firm plant immediately raised `⚠ 217 MW forced unserved → paying VOLL $3,000/MWh` with the deficit drawn on the chart. |
| #2 — finance showed "debt-free" at negative cash | the credit line must reflect an overdrawn position | **Phase 1** overdraft fix. |

The deeper structural answer to #1 is **the Book** (Phases 4+5): cash-on-hand and the live QTD
itemised P&L (floor + swing income, minus opCost / interest / fines / VOLL → net) now live on a
summoned terminal that patches while the clock runs — so "why is my cash moving *right now*" is
answerable live, not only at the board review.

## C. The playtest gate (human) — proxy PASS, human gate OUTSTANDING (the user's to run)

As in v5.3, an automated session cannot *be* a fresh player. The proxy walk this session — landing →
first shift → operating deck → forced trip → VOLL attribution → Book → fleet fold/promote — found the
surface **coherent and self-attributing, zero console errors**. The three outstanding v5.3 questions
are now answerable *from the UI*, not only at the review:

1. **Reach one board review in ≤ ~15 engaged minutes** — unchanged from v5.3's settled pacing
   (`secondsPerDay` 100; a 22-day quarter ≈ 12 fast-mode minutes). The milestone changed the *look*,
   not the clock.
2. **Explain why you made/lost money** — now answerable *live*, not only at the review: the **Flow
   tile** names the driver (`earning · spot sales` / `⚠ bleeding on dark load — VOLL`), the VOLL line
   attributes an active shortfall, and the **Book** itemises QTD P&L on demand while the day runs.
3. **Name one strategy you'd change next run** — the fleet now *tells you where the lever is*: the
   capacity instrument's `N need attention ↓` points at the plants bleeding reliability, and the gas
   tiles are the dispatch you can change. "Commit gas sooner / maintain the worn baseload" is now a
   read, not a deduction.

**The human gate remains the user's to run.** A fresh player should, unobserved by code:
1. reach one board review without coaching in ≤ ~15 *engaged* minutes;
2. explain why they made or lost money; and
3. name one strategy they'd change next run.

Capture those three verbatim. Per the spec's escape valve, an **outcome-2 failure** (surface still
not legible) routes to a follow-up legibility pass with a concrete requirement — it does **not**
reopen the economy, which v5.3 already asserted and this milestone left untouched.

## Verdict

**v5.4 "The Instrument" closes on a legible, scalable surface.** The deck reads as a control room, the
Book answers the money question on demand, the fleet scales past a handful of plants by promoting only
what needs attention, and both v5.3 legibility findings are closed. The economy is byte-identical to
v5.3 throughout. The final human judgement is the one recorded hand-off.

## Known / deferred onward

- **The human playtest** (§C) — the user's to run and record.
- **The fail-state principle decision** — "is roguelite game-over the right model at all?" With a
  fair, legible quarter now in hand it is finally answerable, but it is a *model* decision, not a UI
  one, and was deliberately **not** taken on by this UI-rewrite milestone. It remains the open
  direction question for whatever follows v5.4.
- *(Done in this phase)* **Version stamp** — the single-source `VERSION` in `version.js` is bumped
  `v5.3 → v5.4`, so the cmdbar badge reads the shipped milestone per the module's own release ritual.
