// Test runner — discovers and runs every tests/*.test.mjs suite.
//
// Each suite is a self-executing script that prints its own ok/FAIL lines and
// exits non-zero on failure (see tests/engine.test.mjs for the pattern). This
// runner just finds them all, runs each in its own Node process, and fails if
// any suite fails — so adding a new `tests/<name>.test.mjs` needs no edit here
// (the old hand-maintained chain in package.json silently skipped forgotten
// files). No dependencies; still no BUILD step.
//
// v5.3 note: the project's "no-CI" discipline is reversed FOR TESTS ONLY — a GitHub
// Action (.github/workflows/test.yml) now runs `npm test` on push/PR, so the revised
// milestone principle ("measure the game, not just the modules") is enforced on every
// change. This includes tests/harness.test.mjs, which runs the incentive asserts over a
// seed batch. DEPLOY stays manual from main (GitHub Pages) — the reversal is tests, not ship.
//
// Run: `npm test` (or `node tools/run-tests.mjs`).

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = join(root, "tests");

const suites = readdirSync(testsDir)
  .filter((f) => f.endsWith(".test.mjs"))
  .sort();

if (suites.length === 0) {
  console.error("No test suites found in tests/.");
  process.exit(1);
}

const failed = [];
for (const suite of suites) {
  console.log(`\n=== ${suite} ===`);
  const res = spawnSync(process.execPath, [join(testsDir, suite)], {
    stdio: "inherit",
  });
  // A non-zero exit OR a signal/spawn error both count as a failure.
  if (res.status !== 0 || res.error) failed.push(suite);
}

console.log(
  failed.length === 0
    ? `\nAll ${suites.length} suite(s) passed.`
    : `\n${failed.length} of ${suites.length} suite(s) FAILED: ${failed.join(", ")}`,
);
process.exit(failed.length === 0 ? 0 : 1);
