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
