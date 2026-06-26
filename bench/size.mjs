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

// Budget for the whole core, gzipped. Generous headroom over today's size; the
// point is to catch a regression (a careless dependency or a big new feature),
// not to shave bytes.
const BUDGET_GZIP = 16 * 1024; // 16 KB — ~20% headroom over today's ~13.3 KB

function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) jsFiles(p, out);
    else if (name.endsWith(".js")) out.push(p); // shipped runtime; .d.ts are types, not served
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
