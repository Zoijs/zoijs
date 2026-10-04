// bench/size.mjs — the shipped size of @zoijs/core.
//
// Zoijs has no build step: the published package IS its source, so the gzipped
// size of `framework/src/**/*.js` is literally what a browser fetches from a
// gzip/brotli CDN. Deterministic and dependency-free (Node's zlib). Run with
// `--check` to fail the build if the core grows past its budget.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "framework", "src");

// Budget for the whole CLIENT core, gzipped. The point is to catch a regression (a
// careless dependency, accidental bloat), not to shave bytes — so it keeps generous
// headroom and is raised deliberately when a reviewed feature lands. The core has
// grown through RFC-gated additions (ref, effect, boundary, the devtools hook, the
// DOM-free server compiler, and in-place hydration) from ~13.3 KB to ~16 KB; raised
// to 18 KB (2026-06-27) to restore ~10% headroom after hydration shipped; raised to
// 19 KB (2026-08-06) after the reviewed reactivity/security fixes landed (per-run owner
// scoping, disposed-node/owner cleanup, case-insensitive URL sanitization) — ~18.1 KB now;
// 20 KB for <textarea>/<title> content binding.
//
// TEMPORARY Phase 1 budget (2026-10-04): 21 KB. The Phase 1 security/correctness fixes
// (SEC-1 Symbol brands, CORE-1, CORE-2 shared runtime, SEC-2 tagged-template check)
// needed real code and comments, leaving no headroom under 20 KB (~20.8 KB now). This is
// NOT permission for uncontrolled core growth. Because this gate measures the published,
// commented SOURCE, PERF-2's minified distribution build is meant to replace it with two
// budgets: one for the production/minified output and one for source/module delivery.
// Raised to 22.5 KB (2026-10-04) for SEC-4 (production entry) + CORE-3 (onError):
// ~21.96 KB now (~300 B of CORE-3 is code), leaving room for the remaining Phase 1 items.
const BUDGET_GZIP = 22.5 * 1024; // 22.5 KB (23,040 B) — temporary Phase 1 source budget, see above

// Server-only entry modules: shipped in the package, but never reachable from the
// client entry (index.js), so a browser using @zoijs/core never fetches them. They
// don't count against the CLIENT bundle budget. (server.js is only imported by
// @zoijs/ssr, on the server.)
const SERVER_ONLY = new Set(["server.js"]);

function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) jsFiles(p, out);
    else if (name.endsWith(".js") && !SERVER_ONLY.has(name)) out.push(p); // shipped, browser-reachable runtime
  }
  return out;
}

const files = jsFiles(SRC).sort();
const buffers = files.map((f) => readFileSync(f));
const raw = buffers.reduce((n, b) => n + b.length, 0);
const gz = gzipSync(Buffer.concat(buffers), { level: 9 }).length;

console.log(`@zoijs/core — shipped source (${files.length} files)`);
console.log(`  raw:      ${(raw / 1024).toFixed(1)} KB (${raw} B)`);
console.log(`  gzipped:  ${(gz / 1024).toFixed(2)} KB (${gz} B)`);
console.log(`  per file:`);
for (const f of files) {
  const b = readFileSync(f);
  console.log(`    ${relative(SRC, f).padEnd(28)} ${(gzipSync(b, { level: 9 }).length / 1024).toFixed(2)} KB gz`);
}

if (process.argv.includes("--check")) {
  if (gz > BUDGET_GZIP) {
    console.error(`\n✖ gzipped ${gz} B exceeds budget ${BUDGET_GZIP} B — the core grew. Investigate before merging.`);
    process.exit(1);
  }
  console.log(`\n✔ within budget: ${gz} B ≤ ${BUDGET_GZIP} B`);
}
