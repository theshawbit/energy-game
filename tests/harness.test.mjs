// ============================================================
// ASSERTING HARNESS — in-suite batch (v5.3 Phase 2). Runs the incentive asserts from
// tools/balance.mjs over a small seed batch as part of `npm test`, so the revised milestone
// principle — "measure the game, not just the modules" — is enforced on EVERY run, same
// standing as the module suites, not only when someone remembers to run the balance tool.
//
// The asserts themselves (continuity, incentive U-sweep, price-taking, cash↔PnL conservation,
// reach-a-quarter, dominant-strategy + the adaptive hill-climb probe, mint tracking, and the
// no-dead-content registry) live in tools/balance.mjs and are documented there. This file is the
// thin test wrapper: run them, print each ok/FAIL, exit non-zero on any violation. Two seeds keeps
// it ~2s; the heavier sweep is `node tools/balance.mjs <n>` locally (and the Phase 5 balance gate).
// Run: `npm test` (or `node tests/harness.test.mjs`).
// ============================================================
import { runAsserts } from "../tools/balance.mjs";

const failed = runAsserts(2);
process.exit(failed === 0 ? 0 : 1);
