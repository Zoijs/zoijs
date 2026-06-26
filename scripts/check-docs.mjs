// check-docs.mjs — documentation-coverage gate (Phase 6: "docs as product").
//
// Enforces the plan's "zero undocumented public APIs" line: every public VALUE
// export (a function or const — the things you call) of every package must be
// named in that package's README.md. Types/interfaces are supporting surface and
// are documented alongside the functions that use them, so they're not gated.
//
// This is what catches a stale README — e.g. shipping `effect` / `boundary` but
// forgetting to add them to the core's API list. Run with `node scripts/check-docs.mjs`
// (wired into the root `npm test`).

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Each package's authoritative public surface is its types entry. Extra subpaths
// (e.g. the core's dev-only devtools hook) are checked against the same README.
const PACKAGES = [
  { dir: "framework", entries: ["src/index.d.ts", "src/devtools.d.ts"] },
  { dir: "router", entries: ["src/index.d.ts"] },
  { dir: "resource", entries: ["src/index.d.ts"] },
  { dir: "head", entries: ["src/index.d.ts"] },
  { dir: "action", entries: ["src/index.d.ts"] },
  { dir: "storage", entries: ["src/index.d.ts"] },
  { dir: "forms", entries: ["src/index.d.ts"] },
  { dir: "testing", entries: ["src/index.d.ts"] },
  { dir: "devtools", entries: ["src/index.d.ts"] },
];

const VALUE_EXPORT = /export (?:declare )?(?:async )?(?:function|const) ([A-Za-z0-9_]+)/g;

const failures = [];
let checked = 0;

for (const { dir, entries } of PACKAGES) {
  const readmePath = join(root, dir, "README.md");
  if (!existsSync(readmePath)) {
    failures.push(`${dir}: no README.md`);
    continue;
  }
  const readme = readFileSync(readmePath, "utf8");
  const names = new Set();
  for (const entry of entries) {
    const p = join(root, dir, entry);
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, "utf8").matchAll(VALUE_EXPORT)) names.add(m[1]);
  }
  for (const name of names) {
    checked++;
    // A whole-word match — `effect` must appear as `effect`, not inside `effects`.
    if (!new RegExp(`\\b${name}\\b`).test(readme)) {
      failures.push(`${dir}: public export \`${name}\` is not documented in README.md`);
    }
  }
}

if (failures.length) {
  console.error(`\n✖ Doc-coverage check failed (${failures.length}):`);
  for (const f of failures) console.error("  - " + f);
  console.error("\nEvery public function/const must be named in its package README.");
  process.exit(1);
}
console.log(`✔ Doc-coverage check passed: all ${checked} public exports across ${PACKAGES.length} packages are documented in their READMEs.`);
