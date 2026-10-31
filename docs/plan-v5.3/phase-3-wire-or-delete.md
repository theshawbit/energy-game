# Phase 3 — Delete the Residue + One Trouble-Meter

> Part of the [v5.3 Integrity plan](README.md). The subtractive heart of the milestone, under a **hard
> freeze**: every inert or lying mechanic is **deleted** (not wired — any *upside* or *consequence* is
> v5.4), the four overlapping "grid in trouble" mechanisms collapse to **one**, the two-click resume is
> single-sourced, and the one broken *payoff* on a live mechanic (H2) is fixed. No new mechanics — this
> makes the thing on screen match the thing in the code. The **dispatch-touching** deletions (`push`,
> `bandMin`) are **not here** — they moved to Phase 1 so Phase 2 asserts the final dispatch surface.
> Independent of Phase 4; the two honesty passes can run in parallel after Phase 2.

## The freeze line (review M7)

> **Delete inert or lying mechanics; fix broken incentives/payoffs on *live* mechanics; add no new
> capability.** So: the crew repair discount, `S.satisfaction`, and (in Phase 1) `push`/`bandMin` are
> **deleted** — not wired to a new effect. The only "wiring" allowed is the two *correctness* fixes on
> live mechanics (the floor-decouple in Phase 1, and H2 below), because they repair a broken incentive
> rather than invent one. A real upside for `push` / a consequence for `satisfaction` / a wired crew
> discount are **v5.4**.

## Goal

The audit's "residue now exceeds a phase of work": dead meta purchases, an unreachable service path,
two wear models, a dead mutator banner, three generations of copy, and four mechanisms that all mean
"the grid is in trouble." Each is individually small; together they're why a new collaborator would
trust the docs and get burned. Phase 2's **no-dead-content gate** makes these deletions permanent —
but first they have to be made.

## The work

### A. Delete the inert content (H3, L1–L3, M4-audit)

| Item | Finding | Action |
| :--- | :--- | :--- |
| `servicemgr` purchase (48 ⚡) | H3 — retired service path, no consumer | **Delete** (purchase + any UI). |
| Maintenance Crew repair discount | H3 — unreachable consumer | **Delete** (wiring it a new effect is v5.4). |
| Longer Shifts (`runLengthFor`/`maxRunDays`) | H3 — never called | **Delete** (v5 has no run length). |
| Mutator banner (`S.mutators` always `[]`) | L1 | **Delete** the banner + dead state. |
| `status="service"` path | L2 — unreachable | **Delete** the branch + its config. |
| `effPeakGrowth` import | L3 — imported unused | **Delete**. |
| Second wear model (`wearRate`/`ageMult`, `u.ageHours`) | M4-audit — `CFG.v5.decay` is the live one | **Delete** the dead knobs + unused field. |

Every deletion must leave `npm test` green; a suite that only protected dead code (M7-audit:
`runLengthFor`, `updateRecords`, `rampFactor` tests) is **pruned**, not preserved.

### B. Pick ONE trouble-meter (M5)

Four mechanisms currently overlap: the **stability/strain HP reservoir** (the v5.1 fail-state, shown
in the top strip — relabelled "Grid Strain" in v5.2), the separate **`S.strain`** scalar (drives only
a vignette), **`S.satisfaction`** (gates nothing, despite the "licence pulled" copy), and the
**crisis toolkit** (load-shed / demand-response — *actions*, not a meter). Keeping all four means
chasing their interactions forever.

> **Decision (locked): keep the HP reservoir as the single meter.** It is the player-facing
> fail-state, it already couples to the quarter grade, and v5.2 just relabelled it. Then: **delete the
> redundant `S.strain` vignette driver** (fold any signal it carried into the reservoir's inputs) and
> **delete `S.satisfaction`** (it gates nothing today; per the freeze, giving it a real consequence is
> v5.4, so it goes rather than grows). The crisis toolkit stays as *tools* that feed the one meter, not
> a parallel meter. `CFG.instantBlackout` (unused) is deleted too.

This does **not** decide the fail-state *principle* (whether roguelite game-over is right at all) —
that's Phase 5's to judge once a fair quarter is playable. This phase only removes the *redundancy*,
so there's one honest "trouble" read instead of four.

### C. Single-source the pause state (M6-audit)

`autoPause` sets `clock.speed = 0` but leaves `S.paused = false`, so pause lives in two places and
resume needs two clicks (this is what made the v5.2 clock look "frozen" in testing). **Fix:** one
source of truth for paused-ness; auto-pause and manual pause set the same state; one click resumes.

### D. Fix the one broken payoff (H2) — a correctness fix, not a new mechanic

- **H2** — buying a KPI upgrade raises `u.caps[axis]` but not `u.kpis[axis]`
  ([contractor.js:44](../../src/live/contractor.js#L44)); a fresh plant gets **0 MW** from tier 1 until
  maintenance also runs, so the main cash sink has invisible payoff. **Fix:** apply the delta on tier
  completion (preferred) or surface "cap N / live M" so the gap is legible — buying a tier must never
  be a 0-MW purchase. This repairs a broken *payoff* on a live mechanic (allowed under the freeze); it
  adds no new capability.

> **Not here:** `push` and `bandMin` (H5) are **deleted in Phase 1** (they touch dispatch); `rampFactor`
> is deleted with the dead imports in A. No dial gains an upside in v5.3 — that's v5.4.

## Tasks (TDD)

1. **Deletions, one commit cluster per group** (A) — each with its dead-code test pruned; `npm test`
   green after each.
2. **No-dead-content gate turns green** — the Phase-2 gate now passes because the inert ids are gone
   (if Phase 2 landed first, it was *red* on these; this is what greens it).
3. **One-meter consolidation** (B) — delete the redundant meter(s); a test asserts the surviving meter
   is the only one with gameplay consequence (nothing reads the deleted scalars).
4. **Pause single-source** (C) — a test: after `autoPause`, a single resume call returns the clock to
   its prior speed and clears paused-ness in one place.
5. **Payoff honesty** (D, H2) — a test: completing a KPI upgrade tier raises the *live* KPI (or the UI
   shows cap-vs-live); buying a tier is never a 0-MW purchase.

## Done when

- `npm test` green; the no-dead-content gate (Phase 2) passes with no exceptions list.
- Grepping the tree for each deleted id returns nothing; no module imports a retired export.
- One trouble-meter; one pause state; no purchase with invisible payoff.
- The code a new collaborator reads matches the game they play.

## Notes / caveats

- **Deletion is the feature.** The freeze line is hard: delete the lie, don't wire it. A wired-up
  mechanic no one designed around is new residue — and in a freeze, out of scope. Upsides → v5.4.
- **Keep the clearing logic out of it** — none of this touches merit-order dispatch or marginal cost.
- Items explicitly **not** here (deferred in the README): grid persistence (H6), deeper economy
  (audit M1–M3, M8), late-game aging (H7). Env-RNG (M10) is **in** v5.3 — but in Phase 2, not here.
  This phase is residue removal, not new economy.
