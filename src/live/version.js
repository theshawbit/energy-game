// ============================================================
// VERSION (v5.3 Phase 4) — the single source of truth for the build stamp shown in the UI.
// There is NO build step and GitHub Pages serves `main` directly, so a git SHA can't be
// injected at serve time and a hand-typed one would lie; the stamp is VERSION-ONLY by design.
//
// RELEASE CHECKLIST: bump VERSION here as part of the manual-deploy ritual, in the same commit
// that ships the release, so the stamp can never silently drift from what's deployed. This
// constant is the only place the number lives — the cmdbar badge + any About line read it.
// ============================================================
export const VERSION = "v5.3";
