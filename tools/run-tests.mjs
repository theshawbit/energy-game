// Test runner — discovers and runs every tests/*.test.mjs suite.
//
// Each suite is a self-executing script that prints its own ok/FAIL lines and
// exits non-zero on failure (see tests/engine.test.mjs for the pattern). This
// runner just finds them all, runs each in its own Node process, and fails if
// any suite fails — so adding a new `tests/<name>.test.mjs` needs no edit here
// (the old hand-maintained chain in package.json silently skipped forgotten
// files). No dependencies; mirrors the project's no-build, no-CI discipline.
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
