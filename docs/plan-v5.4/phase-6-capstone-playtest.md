# Phase 6 — Capstone + playtest gate

> Fleet-at-scale and the human gate. Closes v5.3's outstanding human playtest at the same time.
> *(The material look is finalized in Phase 5, against the real shipped surfaces — not here. Review folded
> it forward so Phase 5 can't ship with an unsettled look.)*

## Owns

- Fleet-at-scale behaviour on top of the Phase-4 tiles: rhythm-dependent decomposition + promotion-by-
  exception.
- The human playtest gate (and the deferred v5.3 human gate, now runnable on a legible surface).

## Approach

1. **Rhythm-dependent fleet.** Live, the deck shows dispatchable tiles + a capacity instrument + an
   annunciator rail; it does **not** show every plant as a full tile. The full per-plant detail is a
   planning-rhythm concern (brief / board / manage), not a live-operating one.
2. **Promotion-by-exception.** Any plant in trouble — degrading, maintenance-due, straining — jumps the
   queue to a full tile on the deck, even mid-operating. The fleet surface is driven by *what needs
   attention now*, not a static roster. This is what makes "managing a fleet" scale past a handful of
   plants without reverting to a spreadsheet.
3. **Playtest gate.** A fresh-player session on the full v5.4 surface, measured in *engaged* minutes
   (v5.3 precedent). The three outstanding v5.3 playtest questions are answered here on a surface that can
   finally attribute its own economy.

## Done when

- The fleet scales: live shows dispatchable + by-exception tiles; full roster is a planning concern; a
  troubled plant promotes to a tile mid-operating.
- A human plays a full quarter on v5.4 and can answer, unaided: *why did I make/lose money, and what should
  I do about it?* — the milestone's definition of done.
- Suites + v5.3 harness green throughout; no economy/clearing touched across the whole milestone.

## Risks & open questions

- **O4 (README):** this phase may fold into 4/5 if promotion-by-exception proves small. Kept separate so the
  deck (Phase 4) can ship at a fixed fleet size before the at-scale logic lands.
- Promotion-by-exception reads the *same* trouble signals the stability/maint systems already expose — it
  must not introduce a new "is this plant in trouble?" source of truth (reuse the existing one).
- The playtest gate can fail. An outcome-2 failure (surface still not legible) routes to a follow-up legibility
  pass with a concrete requirement, exactly as v5.3's did — it does not silently pass.
