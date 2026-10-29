# Phase 9 — World & Narrative

> Part of the [v5 implementation plan](README.md). The **flavour layer**: the named **Rust District
> → New Veridia** identity arc, the **C.A.S.S.** dispatch-AI / overlord voice, and reconciling the
> storyline bibles to the persistent-grid, KPI-axis frame. Pure data + copy over the finished
> mechanics — **it colours the sim, never gates it.** Lands last so copy reconciles against shipped
> behaviour. `engine.js` sacred.

## Goal

Dress the proven loop in its world. The grid visibly grows from the gritty **Rust District** (the
shipped moor/foundry fleet names — Blackmoor, Cinderhope, Forgewell, Kilnbrook) into gleaming **New
Veridia** as demand steepens year over year — the aesthetic *is* the progression. **C.A.S.S.** (a
deadpan dispatch AI in a brutalist bunker) narrates via ticker/brief/flash, and the overlord's
quarter-end verdict (Phase 6) speaks in the monopoly's never-a-thank-you voice. ⚡ is re-skinned
**"Guild Cred."** The storyline bibles' dead *succession-loop/Mk* framing is reconciled to the
persistent frame and the four KPIs.

## Module contract

- **`src/live/world.js` (new, pure data + selectors)** — exports:
  - `eraOf(S) → "rust"|"transition"|"veridia"` — maps the growth arc (year / fleet size / demand
    tier) to an aesthetic era.
  - `plantName(tech, n, era) → string` — extends the shipped v4.2 `plantName` with era-aware pools
    (Rust-District foundry names early; New-Veridia names late), so Phase 5's new builds inherit the
    right name for when they're built. Preserves every shipped name.
  - `cassLine(S, event) → string` and `overlordNote(verdict) → string` — select deadpan C.A.S.S.
    barks and the overlord's verdict copy from pools keyed to real game state (regime, trips,
    verdict grade, milestones). Pure selectors over `config` copy tables.
- **`src/live/config.js`** — `CFG.v5.world`: the era thresholds + per-era name pools, the C.A.S.S.
  bark tables (mapped to the real mutator/event ids and KPI/verdict states), and the overlord
  verdict phrasings. All copy lives here as data.
- **`docs/` reconciliation** — update `STORYLINE-v5-new-veridia.md` / `STORYLINE-v5-script.md` where
  they lean on `Mk` tiers and the succession/reset loop: re-point to the four KPI axes and the
  persistent-grid frame. (Docs only — no mechanical change.)
- **`render.js`** — wire `cassLine`/`overlordNote` into the existing ticker/annunciator, the daily
  brief/flash, and the Phase 6 verdict card; apply the `eraOf` aesthetic (palette/label accents) to
  the Operating Room and Planning Office as the grid grows.

## Tasks (TDD + copy)

Create `tests/world.test.mjs` (light — this phase is mostly data, so tests lock the *contracts*, not
the prose).

1. **Era maps to the growth arc.** `eraOf` returns "rust" at game start, advances to "transition"
   then "veridia" as the configured thresholds (year/fleet/demand) are crossed; monotonic (never
   regresses).
2. **Names are era-aware and preserve the shipped set.** `plantName(tech, n, "rust")` draws from the
   foundry pool (the exact shipped names still appear); "veridia" draws New-Veridia names; a built
   plant's name is stable once assigned (Phase 5 stores it, doesn't re-roll).
3. **C.A.S.S. barks map to real ids.** `cassLine` returns a line for every shipped mutator/event id
   and for the key states (trip, brownout, milestone, quarter verdict grades); no id falls through
   to empty. (The bible fidelity check — all five mutator briefings + the chaotic-market gap — is
   closed here.)
4. **Overlord note reads the verdict.** `overlordNote(verdict)` differs by grade (praise is never
   warm; a fine is barbed) and is a pure function of the `Verdict` fields Phase 6 provides — Phase 6
   only swaps the stub string for this.
5. **Flavour never gates.** A property test / assertion: with all world copy stripped to empty
   strings, the game still runs identically (same KPIs, cash, dispatch) — narrative is strictly
   additive. (The paramount guard: flavour colours, never blocks.)

## Done when

- `npm test` green incl. `world.test.mjs`.
- Playing from Y1 forward, the grid *looks* and *reads* like it's growing out of the Rust District
  into New Veridia; C.A.S.S. narrates in character; the overlord's verdicts sting in the monopoly's
  voice; ⚡ reads as Guild Cred.
- The storyline bibles no longer reference `Mk`/succession-reset; they describe the persistent grid
  and the four KPIs.
- Stripping the copy leaves the mechanics untouched — proven by test.

## Notes / caveats

- This is the layer most likely to keep evolving (the user plans Gemini-authored name sets /
  storylines wired in as `config.js` data + this thin module — no engine changes). Keep `world.js` a
  pure selector over copy tables so new content is a data drop, not a code change.
- The full 5-act "Leviathan" campaign and Tier-4 external-crisis grids remain **out of scope** — this
  phase is the ambient/world layer only.
- Reconcile, don't rewrite, the bibles: the New-Veridia *setting* survives the pivot; only the
  roguelike *structure* references die.
