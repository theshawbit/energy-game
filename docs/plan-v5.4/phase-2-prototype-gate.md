# Phase 2 — Prototype gate (decide the look)

> **No production code.** A decision activity, mirrored on v5.3's playtest-gate precedent (a phase that
> owns no code of its own). It exists to settle the one thing the grill ruled explicitly ungrillable: the
> exact *material look*. You decide it by reacting to a mockup, not by arguing in the abstract.

## Why a gate, not an argument

The grill locked *what* the materials are for (frame / deck / Book, by role) and *how many* (three, plus a
possible ceremony variant). It deliberately did **not** lock what each one looks like — is the deck brushed
metal with seven-segment readouts, or clean-modern dark with no bevels? Is the Book phosphor-amber or flat
glass? That is a feel call, and feel calls are decided in two seconds looking at a thing and never in
paragraphs. Phase 4 must not open with an undecided aesthetic.

## Owns

- A **throwaway** static mockup (its own scratch file, not wired into the app, not shipped) showing:
  - the live **deck** with one plant **tile** and the master chart instrument,
  - the **Book** summoned full-screen over it,
  - **one skin** over both, so the mode-change morph can be felt.
- Rendered in at least the two candidate material pairings:
  1. brushed **metal** deck + **phosphor-amber** terminal Book (most "cockpit"),
  2. **clean-modern** instrument deck + **ink/mono** terminal Book (restrained, ages better).

Two candidate pairs is the whole scope (the optional third single-material variant was **cut in review** as
padding). The decision rule already collapses to one material on its own if the two-material contrast reads
as "two apps" — so the single-material option is covered without building it.

## Approach

Build the mockup in Lane (a) (SVG + CSS, no framework) so it doubles as a spike on the real techniques
(`conic-gradient` dials, `clip-path` bevels, the View-Transition morph). React to it directly. The decision
rule the grill gave: *"Do I want my brain to change gears when my eye moves from the deck into the Book?"*
If yes → two contrasting materials; if it reads as two apps → collapse toward one.

## Done when

- A single material pairing is **chosen** and written down (deck look, Book look, skin finish), with one
  sentence on why.
- The chosen mockup is kept as the visual target for Phases 3–5; the rest is discarded.

## Risks & open questions

- **O3 (README):** is a formal no-code phase the right instrument, or should the mockup simply be the
  opening commit of Phase 4? Kept separate here so the look is decided *before* any production surface
  commits to it — but a reviewer may collapse it.
- Guard against the mockup quietly becoming production code. It is a reaction tool; its job is a decision,
  not a head start.
- The mockup spikes the View-Transition morph, but a static mockup **cannot prove the runtime morph** — only
  Phase 5's real mode-change can. Treat the morph as "looks promising," not "settled"; Phase 5 owns the
  graceful-degradation fallback.

## Decided (2026-11-01)

**Pairing A — Metal + Amber — for both the deck and the Book.** Decided by reacting to the
[Material Gate mockup](https://claude.ai/artifact/RSZh1BGU6kqCAkjuuNtQu5) (throwaway; deck + summoned Book
under one skin, both candidate looks, with strain and the morph). The decision rule — *"do I want my brain
to change gears when my eye moves from the deck into the Book?"* — resolved **yes**: the brushed-metal
instrument deck and the phosphor-amber terminal Book are genuinely different materials, but they live in one
warm amber world and under one skin, so the mode-change reads as *the same machine showing a different
screen*, not two apps. This is the "cockpit" identity the direction doc was reaching for.

So the three materials (by role) take these looks, and **these token values are the Phase 3 `--mat-*`
scaffold** — lift them verbatim:

```css
/* frame — brushed dark chrome, cool text */
--mat-frame-bg: linear-gradient(180deg,#1a202b,#10141c);
--mat-frame-bd: #33404f; --mat-frame-tx: #c6d2e2; --mat-frame-sub: #78879b;

/* deck — bevelled brushed metal, amber readouts with a soft glow */
--mat-deck-surface: linear-gradient(176deg,#222a35 0%,#161c25 60%,#12171f 100%);
--mat-deck-face:    linear-gradient(176deg,#1c232e,#10151d);
--mat-deck-bd: #3a4858; --mat-deck-hi: rgba(255,255,255,.09); --mat-deck-lo: rgba(0,0,0,.55);
--mat-deck-read: #ffbf45; --mat-deck-read-glow: 0 0 10px rgba(255,176,46,.35);
--mat-deck-accent: #ffb02e; --mat-deck-radius: 13px;
--mat-deck-shadow: 0 2px 0 rgba(255,255,255,.05) inset, 0 -16px 26px rgba(0,0,0,.4) inset,
                   0 10px 24px -14px #000;   /* the bevel */

/* book — phosphor-amber terminal: warm near-black, amber phosphor, scanlines, glow */
--mat-book-bg: radial-gradient(130% 120% at 50% -10%,#14100a 0%,#0a0805 70%);
--mat-book-tx: #ffca61; --mat-book-dim: #9a7636; --mat-book-accent: #ffb02e;
--mat-book-line: rgba(255,176,46,.16); --mat-book-glow: 0 0 12px rgba(255,176,46,.28);
--mat-book-scan: 1;   /* phosphor scanline overlay on; 0 would disable it */
```

The skin (grain + top glow + the red `--grid` grid-state bleed) is constant over both and is what fuses
them — it must render over the Book too (Phase 3 / Phase 5). The other pairing (Clean + Ink) and the
mockup itself are discarded. **This closes the gate; Phases 3–5 build to this look.**
