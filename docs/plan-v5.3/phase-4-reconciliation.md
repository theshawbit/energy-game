# Phase 4 — Reconciliation + Version Stamp

> Part of the [v5.3 Integrity plan](README.md). One sweep to make the **docs stop out-ranking the
> code**, and a version stamp so a bug report can name the build it came from. No mechanics. **Split by
> timing (review m4):** the *structural* docs — module map, the principle note, the version stamp —
> land **early** (they don't depend on tuning); the *economy / How-to* copy lands **after Phase 5's
> numbers and the fail-state read are locked**, so it isn't stale on arrival.

## Goal

The audit's sharpest process finding: *the docs have become the source of truth instead of the code.*
Three generations of copy coexist, and the CHANGELOG confidently describes fixes that the verified
bugs show never worked. That's not dishonesty — it's a pipeline that writes intent with more rigor
than it verifies it. The credibility cost is real and compounding. This phase closes the gap in one
deliberate pass, now that Phases 1–3 have made the code honest.

## The work

### A. One docs sweep (M9)

- **`docs/README` module map** — currently misses ~17 live modules; regenerate it from the actual
  `src/live/` tree so every module is listed with its real responsibility.
- **CHANGELOG** — reconcile the contradiction (one place says "v5 not built," the docs/README say
  "built"); fold in the v5.3 integrity work truthfully, including **what was deleted** (Phase 3) and
  **what the economy now does** (Phase 1 — real market + VOLL). Do not re-assert any claim the audit
  falsified; where a past entry was wrong (e.g. the mint "fixed the orphaned currency"), correct it or
  annotate it, don't silently keep it.
- **How-to / in-game copy** — currently describes v4.2.6 brownout/blackout/lost-licence failure modes;
  rewrite to the *actual* v5.x model (the one trouble-meter from Phase 3, the real fail-state as it
  stands).
- **Home-screen copy** — the home screen still sells a finite run ("survive it to win"); align it with
  the persistent-ops model the live UI actually presents. A new player must be told the **same** game
  at every click.

### B. Version stamp (version-only, on a release checklist — review m3)

- Add a visible **version** to the page (a small footer / About line) from a single `version.js`
  constant. **Version-only** — *not* a git SHA: with no build step and Pages serving `main` directly, a
  SHA can't be injected at serve time, and a hand-bumped SHA that lies is worse than none.
- Bumping the constant goes on a **release checklist** (the manual-deploy ritual), so the stamp can't
  silently drift from what's deployed.
- Surface it where a bug report would naturally quote it.

### C. The revised-principle note (lands early)

- Record both principle changes in the docs (README / CHANGELOG): (1) **no-CI stands for *deploy***;
  tests are now CI-gated (Phase 2); (2) **"the *clearing logic* is sacred," not the `engine.js` file** —
  additive engine outputs (like `priceServed`) are allowed. One short section, so the next collaborator
  understands why the Action exists, why deploy is still manual, and why `engine.js` gained a field —
  the exact questions that started this milestone.

## Tasks

*Early (don't depend on Phase 5 tuning):*
1. **Regenerate the module map** from `src/live/` — verify every listed module exists and every
   existing module is listed (a tiny script or a careful `Glob` + diff).
2. **Version stamp** — single-sourced `version.js`, visible, quotable; bump on the release checklist.
3. **Principle note** — the no-CI-for-tests + clearing-logic-sacred section.

*After Phase 5 locks the numbers and the fail-state read:*
4. **CHANGELOG reconciliation** — one honest entry for v5.3; correct the falsified past claims.
5. **In-game + home copy rewrite** — to the real model (the one meter, the real economy); cross-check
   against the live UI so no screen contradicts another.

## Done when

- The module map matches `src/live/` exactly (no missing, no phantom modules).
- No two surfaces (home / How-to / live UI / README / CHANGELOG) describe different games.
- The page shows a version stamp a player can quote.
- The docs describe the code as it is after Phases 1–3 and the Phase-5 lock — the deletions, the real
  market, the settled numbers, the final fail-state read.

## Notes / caveats

- **Documentation honesty is an integrity fix**, which is why it's in this milestone and not a "later
  cleanup." The audit named it as a first-class credibility risk.
- **Split timing (m4).** Structural docs (module map, principle note, version stamp) land early and
  parallel; the economy/How-to copy lands after Phase 5 — documenting the game *before* its numbers and
  fail-state settle is how the doc/code gap reopened.
- **No new claims.** Describe what is, not what's planned; aspirational copy is how the gap reopened.
- A **content-pipeline note** (the audit's "10× content test fails on UI density, not data") belongs
  to the deferred UI legibility pass, not here — mention it in the CHANGELOG's "known / deferred" list
  so it isn't lost.
