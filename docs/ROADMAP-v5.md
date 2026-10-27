# Grid Operator v5 — "Identity & Progression" — Roadmap (IDEAS)

> **Status: IDEAS / not scoped.** A capture of playtest-driven ambitions that
> clearly outgrow the v4.2.x UI polish pass. Nothing here is designed or
> committed yet — it's a holding doc so the direction isn't lost. v4.2.x
> (reliability, net-load volatility, readout cadence, and the in-progress fleet
> table / how-to beautification) ships first; this is what comes *after* the
> interface is calm and legible. See [ROADMAP-v4.md](ROADMAP-v4.md),
> [PLAN-v4.2-control-room.md](PLAN-v4.2-control-room.md), and
> [PLAN-v4.2.1-reliability-and-volatility.md](PLAN-v4.2.1-reliability-and-volatility.md).

**Theme (working):** The grid stops being an *anonymous* collection of generic
assets and gains an **identity** — a named world you operate inside, plants with
proper names, and progression systems (upgrades + research) deep enough to make a
run feel like a *campaign*, not a settings screen. v2 gave it a loop, v3 a brain,
v4 a book; v5 gives it a **soul**.

Entertainment-first, zero-backend, web-only still hold. Dispatch stays the live hero.

---

## Sources (playtest notes, 2026-10-26)

Captured verbatim-ish from the user's own notes; the UI items (fleet table,
how-to) are being handled in the v4.2.x pass and are **not** v5.

- *"Upgrades revamp — re-evaluate 'Mk' tier/strategy. Should there be an upgrade
  tree (Performance, Efficiency, Quality, etc.)? More expansive / immersive?"*
- *"If we are revamping upgrades might as well apply the same to the research."*
- *"Use Gemini to construct storylines, and more formal names. I don't like 'Coal
  Plant A' or 'Solar Farm 4' — feels lazy and sloppy; we can do better."*

---

## 1. Progression revamp — upgrades **and** research as one system

The current `Mk` tier is **linear** (Mk1 → `UPGRADE.maxTier`, each step a flat
cap/fail/spin bump). It works but reads like a stat screen, not a choice. v4's
research tree (v3) is the better model; v5 should make *both* feel like a tree of
meaningful, branching decisions — and crucially, make them feel like **one system**
(don't deepen one and leave the other shallow — they'll clash).

**Idea — per-plant upgrade branches** (not one linear ladder). Spend on an axis:
- **Performance** — more MW / faster ramp / higher availability.
- **Efficiency** — lower heat rate → cheaper $/MWh, lower emissions (interacts with
  the carbon curve — an efficiency path is a hedge against rising carbon).
- **Quality / Reliability** — slower wear, lower `fail`, cheaper service, longer
  overhaul intervals (directly ties into the v4.2.1 wear/trip model — a "Quality"
  plant is one you can lean on harder without servicing).

Branches create **archetypes**: a cheap-dirty-but-robust coal workhorse vs. a
lean-efficient-but-fragile one. That's a strategic identity the flat Mk tier can't
express.

**Open design questions** (for the v5 interview):
- Shared currency (cash? a new "engineering" resource?) or per-axis costs?
- Is it per-unit, per-tech, or fleet-wide? (Per-unit = most immersive, most UI.)
- How does it compose with research (which is run-global) — does research *unlock*
  upgrade branches, or are they independent trees?
- Respec / commitment? Roguelike runs are short — probably commit-per-run.
- How much of this is meta (persists across runs) vs. in-run?

**Must-not-break:** `engine.js` stays sacred; upgrades/research keep flowing through
`config.js` knobs + the pure modifier-object pattern (`research.js` / `mutators.js`).
Balance stays centralised and harness-checkable.

## 2. Identity — named world, named plants, storylines

"Coal Plant A" is placeholder-lazy. Real grids name their iron (Drax, Diablo Canyon,
Hornsea, Ratcliffe-on-Soar) — usually after **place, river, or landmark**. Giving the
grid a *named service territory* makes every other name fall out naturally and gives
the roguelike a narrative spine.

**Idea — the run has a setting.** You're assigned (or pick) a territory — a city /
region with a name, a demand character, a renewable profile, a hazard flavour. Plants
inherit proper names from it. The mutators (heatwave, drought, renewable-lull) become
*events in that place's story* rather than abstract modifiers.

**Naming is pure data** — unit names live in `config.js` (`makeFleet` / `makeUnit`),
so a naming scheme or a generated name table drops in with zero mechanics risk, and
can land *before* the full storyline work as a quick quality win. Candidate schemes to
evaluate: territory-prefixed (`Blackwater Unit 1`, `Ironvale CCGT`), river/geographic,
or a seeded generator so each run's fleet feels bespoke.

**Storylines** — lightweight narrative framing: a run intro ("You've taken the desk at
the Blackwater grid…"), event flavour text tied to mutators/milestones, and an
end-of-run epilogue that reflects how you did (longevity / clean / profit tracks →
different endings). Keep it *flavour over cutscene* — it should color the sim, never
gate it.

**Collaboration note:** the user plans to use **Gemini** to generate storylines and
name sets. Division of labour: Gemini (and/or Claude) drafts the creative content
(territory names, plant-name tables, event copy, epilogues); the build side wires it
in as data + a thin narrative layer. Whatever scheme is chosen, integration is a
`config.js` data swap plus (for storylines) a small flavour-text module — no engine or
dispatch changes.

## 3. (Falls out) — identity surfaces the UI can use

Once plants have real names and archetypes, the v4.2.x **fleet monitor table** gets
richer for free (name, archetype/branch, condition, load) — worth keeping in mind when
building that table so it has room to grow into named/branched units later.

---

## Sequencing (tentative)

1. **Naming quick-win** — a proper name scheme for the default fleet (data-only), to
   kill "Coal Plant A" even before the full system. Can slot into the v4.2.x UI pass.
2. **v5 design interview** — scope the upgrade+research tree together (the questions in
   §1), decide meta-vs-in-run and the currency model.
3. **Progression build** — upgrade branches + research depth, harness-tuned.
4. **Identity/storyline layer** — territories, event flavour, epilogues.

Not started. This doc is the capture; the design interview is the real kickoff.
