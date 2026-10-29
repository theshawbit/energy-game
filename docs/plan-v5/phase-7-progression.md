# Phase 7 — Progression

> Part of the [v5 implementation plan](README.md). Builds the three progression lanes: **per-asset
> specialization (cash)** along the four axes, **research (RP)** that raises axis ceilings + unlocks
> tech, and **⚡ perks** including late-game **automation**. Depends on Phase 3 (the axes + `u.caps`)
> and Phase 6 (the currencies earn against the economy). `engine.js` sacred.

## Goal

Plants **emergently specialize**: you spend cash to upgrade any of the four axes with **free
development but a steepening per-axis cost**, so a plant drifts toward a shape rather than
hard-committing to an archetype. **RP** (diverted cash → R&D, the revived v3 tree) raises the axis
*ceilings* (`u.caps`) and unlocks new tech. **⚡** expands reach — crew slots/promotions (Phase 4),
control-room perks, unlocking research branches, and **automation** (auto-maintenance, dispatch
assists) that is **deliberately gated to late-mid/end game**: feel the scaling burden first, then
earn the relief.

## Module contract

- **`src/live/progression.js` (new, pure)** — exports:
  - `upgradeCost(u, axis) → cash` — the steepening per-axis curve (each point in an axis costs more
    than the last), clamped at the axis's current `u.caps[axis]` ceiling.
  - `applyUpgrade(S, unitId, axis) → bool` — validates (cash available; below ceiling), deducts
    cash, raises `u.kpis[axis]`'s *max attainable* / sets the upgrade so maintenance can restore to
    the new level. Free dev, steepening cost — no branch lock.
  - `raiseCeiling(S, tech, axis) → bool` — spends RP via the research tree to lift `u.caps[axis]`
    for a tech family (the tree IS the per-tech ceiling axis).
  - `PERKS` + `unlockPerk(S, perkId) → bool` — ⚡ perks: crew ceiling, control-room conveniences,
    research-branch unlocks, and automation perks tagged with a **growth-tier gate**.
  - `automationTier(S) → tier` and `isAutomationUnlocked(S, perkId) → bool` — the late-game gate:
    automation perks are refused until the grid's growth tier (fleet size / year / ⚡ earned) crosses
    the configured threshold.
  - `autoMaintenancePlan(S) → Task[]` / `dispatchAssist(S)` — the actual automation behaviours,
    active only when their perk is unlocked (route through Phase 4 `scheduleTask` / Phase 2 dials).
- **`src/live/research.js` (revived v3 tree)** — re-pointed so nodes raise `u.caps` axis ceilings +
  unlock tech, instead of the v3/v4 one-off mods. Keep the tree/prereq/meta-gating machinery (and
  its test suite) — change what nodes *do*.
- **`config.js`** — `CFG.v5.upgrade` (per-axis cost curve), `CFG.v5.perks` (⚡ costs, automation
  growth-tier thresholds). ⚡ earned by growth tiers + achievements (Phase 6 surfaces the triggers).
- **`render.js`** — the Planning Office gains **per-asset specialization** (four axis upgrade tracks
  with live costs), the **research** panel (revived), and the **⚡ perk** board with automation
  clearly shown as locked-until-tier.

## Tasks (TDD)

Create `tests/progression.test.mjs`; extend the revived `tests/research.test.mjs`.

1. **Upgrade raises an axis and costs cash.** `applyUpgrade(S, u, "efficiency")` → efficiency's
   attainable max up, cash down by `upgradeCost`.
2. **Cost steepens per axis.** Successive upgrades on one axis each cost more than the last
   (`upgradeCost` monotonic in current level).
3. **Ceiling blocks until raised.** Upgrading past `u.caps[axis]` is refused; `raiseCeiling` (RP)
   lifts it, then the upgrade succeeds.
4. **RP raises ceilings via the tree.** A research node spends RP and lifts the tech family's axis
   cap; the existing prereq/meta-gating tests still pass (re-based).
5. **Emergent, not committed.** A plant can take upgrades on *multiple* axes (no one-branch lock);
   spreading thin is costly (steepening curve) but never forbidden. (Explicitly reverses the legacy
   PLAN-v5.1 archetype lock.)
6. **⚡ unlocks a research branch / perk.** `unlockPerk` spends ⚡, fails if short, enables the gated
   capability.
7. **Automation is growth-gated.** An automation perk is refused while `automationTier(S)` is below
   its threshold, *even with ample ⚡*; crossing the tier makes it buyable. (Locks "feel the burden
   first.")
8. **Auto-maintenance obeys the model.** Once unlocked, `autoMaintenancePlan` only schedules
   quarter-end tasks (never mid-quarter), respects crew availability, and spends cash like a manual
   plan — relief, not a cheat.
9. **Dispatch assist respects dials.** `dispatchAssist` sets dials within legal bands and never
   overrides a value the player pinned; determinism preserved under pinned RNG.

## Done when

- `npm test` green incl. `progression.test.mjs` and the re-based `research.test.mjs`.
- In the Planning Office you can specialize plants along four axes (watching costs steepen), spend RP
  to raise ceilings and unlock tech, and buy ⚡ perks — with automation visibly locked until your
  grid is big enough to have earned it.
- A large fleet with automation unlocked plays with meaningfully less per-quarter clerical load.

## Notes / caveats

- **Automation is the churn answer.** Its gate is a feature, not a limitation — if a small grid can
  automate, the progression hollows out. Tune the tier so relief arrives right as the burden starts
  to grate.
- Specialization restores-to-level interplay with Phase 4: an upgrade raises the attainable max; a
  maintenance task restores toward that raised max. Test the two together so upgrades aren't erased
  by the next overhaul's cap.
- Keep the revived research tree's suite as the regression anchor — re-point node *effects* without
  disturbing gating/prereq logic.
