# Phase 5 — The Book

> The summoned finance surface: a full-screen terminal you call up over the deck, with the clock still
> running. The last new surface, and the one that carries the milestone's only model seam (a new overlay
> flag + a close hook). Cash-on-hand lives here; this phase deletes Phase 4's temporary cash stopgap.
> **Ships paired with Phase 4** — the keystone makes them interdependent.

## Owns

- A new overlay flag `S.bookOpen` (a boolean, **not** a `calendar.mode` value — see the seam note below),
  its full-screen render under the `Book` material, and the View-Transition morph deck↔Book.
- The close/pierce hook: `stabFrac ≥ stabilityDanger` (config.js:481) firing while `bookOpen` closes the
  Book → deck; the day/quarter-boundary close rule.
- The Book's contents: cash-on-hand, quarter-to-date P&L, the contracts desk, the tape/log.
- **Deleting Phase 4's temporary frame cash readout** in the same commit the Book takes over solvency.
- The final material/skin touch-up against the real shipped deck + Book (folded here from Phase 6 in
  review, so Phase 5 does not ship with an unsettled look).

## Why not `calendar.mode === "book"` (the seam fix)

The grill first wrote the summon as a fourth `calendar.mode`. Review caught that this is a disguised
control-flow change: `step()` hard-returns unless `calendar.mode === "operating"` (sim.js:307), and `frame()`
has no `book` branch (main.js:190-211) — so a `"book"` mode would **freeze the clock and render the deck**,
the exact opposite of "clock keeps running, Book on screen." The fix is an *overlay flag*: `calendar.mode`
stays `"operating"`, `step()`/`frame()`/the clock run completely unchanged, and `render()` simply draws the
Book when `S.bookOpen`. This also leaves every existing `mode === "operating"` guard (Manage, pause, keys —
main.js:85/95/228/234) correct for free.

## Approach

1. **Summon = full-screen, clock keeps running.** Unlike `brief` (which pauses via autoPause, brief.js:86),
   setting `bookOpen` does **not** pause — the day keeps advancing while you read. This is the locked
   "operations IS the business" choice: studying the Book is time not spent watching the stack.
2. **Drift-tolerant pierce — keyed on the real danger threshold.** The Book tolerates ordinary drift; only
   true blackout-imminent danger interrupts it. The trigger is `stabFrac ≥ stabilityDanger` (config.js:481,
   the threshold that already exists), **not** `autoPause`. Review's catch: `autoPause` only fires on a
   single straining plant (sim.js:378) — it misses a *pure capacity shortfall* (demand > committed supply,
   every plant online, none individually straining), which is the actual fatal path. Keying off `stabFrac`
   catches both. While `bookOpen`, crossing the threshold clears `bookOpen` and drops to the deck.
3. **Grid-state bleed carries over the Book.** The Phase-3 skin's stability bleed must render over the Book
   (not just the deck), so a reservoir filling toward the pierce is *visible* as it fills, not a jump-cut at
   the threshold. This is the ambient half of the warning; the pierce is the hard stop.
4. **No financial pierce.** Going broke never interrupts — and in v5.3 it is non-fatal (VOLL capped, runs
   end only on the stability bar), so it *needs* no pierce. Money is the player's to watch via the deck's
   flow (Phase 4, now craters on VOLL); the Book is where they confirm it.
5. **Boundary close rule.** Because the clock runs while `bookOpen`, a day or quarter boundary can arrive
   mid-read (`surviveDay` → `brief`; quarter close → `planning`). Rule: the boundary **closes the Book first**
   (clear `bookOpen`, drop to deck), *then* the brief/planning beat runs. The Book never coexists with the
   brief/planning branches, so `bookOpen` cannot race the frame's mode machine.
6. **The reckoning content.** Cash-on-hand (deliberately *absent* from the deck; this phase also deletes the
   Phase-4 temporary stopgap), QTD P&L tracing the same itemization Phase 1 gave the board review, the
   contracts desk (de-modaled from today's Desk), and the tape — all under the `Book` (terminal) material,
   dense and keyboard-navigable.
7. **Morph.** The deck→Book transition uses the View Transitions API so the material change is *felt* as a
   mode change under the constant skin — the same machine showing a different screen, never a second app.

## Done when

- `S.bookOpen` summons the Book full-screen over the deck; `calendar.mode` stays `"operating"` and the clock
  keeps running while it is open.
- Crossing `stabFrac ≥ stabilityDanger` closes the Book and returns to the deck; a day/quarter boundary
  closes it then runs the beat; nothing financial interrupts it.
- Cash-on-hand, QTD P&L, contracts, and tape live in the Book and nowhere on the deck — and Phase 4's
  temporary cash readout is gone.
- The grid-state bleed renders over the Book; the material look is settled against the shipped surfaces.
- `brief` and `planning` modes are unchanged; `step()`/`frame()` untouched; suites + v5.3 harness green; no
  economy/clearing touched.

## Risks & open questions

- **The keystone edge (was O1) — resolved, verify in build.** Review confirmed the fairness axis is the
  *grid*, not money (insolvency is non-fatal in v5.3). The unwarned-collapse hole was the mechanism, now
  closed two ways: the pierce keys off `stabFrac` (catches a pure shortfall, which `autoPause` missed), and
  the grid-state bleed renders over the Book (ambient fill-up cue). Confirm in build that a capacity
  shortfall while `bookOpen` both tints *and* pierces — that was the exact edge the grill under-specified.
- The morph must degrade gracefully where View Transitions are unsupported (instant swap, no broken state).
  A static mockup can't prove this (Phase 2 note) — this phase owns the fallback.
- The Book must be summonable only while `calendar.mode === "operating"` (never from `brief`/`planning`/home),
  and the boundary rule must clear `bookOpen` *before* the mode transition, or the overlay tangles with the
  mode machine.
