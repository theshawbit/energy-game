# Grid Operator v5.1 — Progression Revamp (DESIGN / scoped)

> **Status: scoped from the design interview (2026-10-26), awaiting build sign-off.**
> This is the first slice of v5 "Identity & Progression". The narrative layer
> (New Veridia / C.A.S.S. — see [STORYLINE-v5-new-veridia.md](STORYLINE-v5-new-veridia.md))
> comes **after** this. Parent: [ROADMAP-v5.md](ROADMAP-v5.md).

## Decisions locked in the interview

1. **First v5 slice = this progression revamp.** Narrative (C.A.S.S. "full", incl.
   stateful autopsy/quips) is the next slice, not this one.
2. **Plant names stay as-is** (v4.2.6 Rust-District-flavoured names). The New Veridia
   re-theme is deferred to the narrative slice.
3. **One shared branch system, four axes**, applied at two levels with the same
   archetype/tree/mechanics:
   - **Performance** — +capacity %, higher availability, faster ramp / spin-up.
   - **Efficiency** — lower `mc` ($/MWh) + lower emissions factor (carbon hedge).
   - **Quality** — slower wear, lower trip odds, cheaper service, longer overhaul interval.
   - **Flexibility** — lower turndown / min-load, faster start, deeper battery duration + recharge.
4. **Per-unit** upgrades cost **cash** (in Manage). Each unit **commits to ONE branch
   for the run** → true archetypes. This **replaces the linear Mk ladder entirely**.
5. **Per-tech** advancement = **RP**; the **research tree is the tech axis**. Advancing a
   tech along an axis raises the **ceiling** (max per-unit tier) + a small fleet-wide baseline
   for every unit of that type. Each tech family gets a **curated subset** of the four axes
   (not all four) — see the mapping below.
6. **Persistence:** both trees reset each run. Permanent **⚡ Skills** only unlock branches
   and raise ceilings (the existing `metaGate` pattern). Roguelike reset intact.

---

## Proposed mechanics (the concrete spec — review me)

### Per-unit: "Specialization" (replaces Mk)
- A unit starts **unspecialized** (tier 0). In Manage, you buy **tier 1** of one branch;
  that **locks the unit to that branch for the run**. Further tiers go up the same branch.
- **Tiers 1–3** per branch (mirrors today's `maxTier: 3`). Cost reuses the existing curve
  shape: `cost = base × costGrowth^(tier-1)` (today `base 50k`, `growth 1.8`). Per-branch
  `base` lets us price axes differently (e.g. Performance pricier than Flexibility).
- **No respec** by default (commit-per-run). *Open knob:* an expensive one-time re-spec.
- Replaces the `u.tier` + `UPGRADE.{capMult,failMult,spinMult}` math in `actions.js`
  `upgradeUnit()` with `u.branch` + `u.branchTier` and a per-branch effect table.

**Per-tier effect table (starting proposal — all balance knobs, harness-tuned):**

| Branch | Per-tier effect (multiplicative unless noted) |
| :--- | :--- |
| Performance | `cap ×1.22`, availability/derate improved, ramp: `spin ×0.85`, peaker `startTime ×0.85` |
| Efficiency | `mc ×0.90`, emissions factor `×0.90` |
| Quality | `wearRate ×0.80`, `fail ×0.65`, service cost `×0.85`, overhaul threshold eased |
| Flexibility | min-load floor down, `startTime ×0.75` (peakers), battery `hours/energy ×1.2`, recharge faster |

> Performance's `cap ×1.22` ≈ today's Mk `capMult 1.25`, so a Performance-specced plant
> tracks roughly the old Mk power curve — the migration stays balance-neutral for that axis.

### Per-tech: the research tree as the tech axis
- Keep the **existing capability unlocks** (SMR/geo/CCS, storage power/depth, demand response,
  forecasting) — those stay as-is; they gate *what you can build*.
- **Add** a per-tech **development** layer in `research.js`: RP nodes along the same 4 axes,
  scoped to a tech family (e.g. "Coal · Quality II"), that (a) **raise the per-unit ceiling**
  for that branch/tech (unlock tier 2, then 3) and (b) give a **small fleet-wide baseline**
  bump for that tech. This is additive to the current tree, same node/`prereq`/`metaGate`
  machinery — nothing in `engine.js` changes.
- **Curated axes per tech family** (locked): each fuel gets a characterful subset of the four
  axes, not all four — less UI, more identity. Starting proposal (tune in build):
  - **Coal / Coal+CCS** → Quality, Efficiency (old, dirty iron: keep it alive + shave carbon)
  - **Gas peakers / Gas+CCS** → Flexibility, Efficiency (fast reserves, fuel-cost sensitive)
  - **Nuclear / SMR** → Quality, Performance (baseload: reliability + raw MW)
  - **Solar** → Performance, Efficiency (more harvest, cheaper build)
  - **Wind** → Performance, Flexibility (more harvest, ride the gusts/lulls)
  - **Geothermal** → Quality, Performance (untiring firm baseload)
  - **Battery** → Flexibility, Performance (duration/recharge + discharge power)

### UI
- Manage: the unit's upgrade control becomes a **branch picker** (once, with a short tooltip
  of each axis) → then a **tier-up button** showing the next tier's effect + cost.
- Fleet table (`fleetsort`/`render`): show the archetype as a small tag (e.g. `QUAL·II`) in
  place of the old `Mk` badge, so identity is legible at a glance.
- R&D screen: the development nodes slot into the existing branch columns.

---

## Migration & safety
- `engine.js` stays **sacred**; `dispatchHour()` + `marginalCost()` untouched. All effects
  flow through unit fields (`cap`, `mc`, `fail`, `spin`, `startTime`, wear knobs) exactly as
  Mk does today.
- Save compat: old saves with `u.tier` map to **Performance** at the matching tier (closest
  analogue), or reset to unspecialized — decide in build. New fields: `u.branch`, `u.branchTier`.
- All tuning stays in `config.js` (per-branch cost bases + the effect table) so the balance
  harness can sweep it. No new engine paths.

## Open knobs to settle during build (not blockers)
- Per-branch cost bases & the exact per-tier multipliers (harness-tuned).
- The exact curated axis → tech-family mapping (starting proposal above; may shift in build).
- Re-spec: off (default) vs. expensive one-time.
- Does Flexibility's "min-load / turndown" need a new dispatch-visible field, or is it
  modelled via standby cost + ramp only? (Prefer the latter to avoid engine surface area.)

## Build sequencing (reviewable slices, each its own PR)
1. **Per-unit specialization** replacing Mk (config effect table + `actions.js` + Manage UI +
   fleet tag). Harness-check the archetypes feel distinct and Performance ≈ old Mk curve.
2. **Per-tech development** nodes in `research.js` (ceilings + baselines) + meta-gate wiring.
3. **Balance pass** across both, win/death-shape check, then docs.

---

*Authored from the v5 design interview. Narrative slice (C.A.S.S. full) follows this.*
