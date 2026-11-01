// bench/size.mjs — what @zoijs/core costs the apps that use it, with budgets (PERF-2E).
//
// Two ways an app ships the core, each with its own budget (`--check` fails past any of them):
//
//   bundled    an app built with a bundler (esbuild here, as @zoijs/build uses): the core bundled
//              with the "production" export condition, minified, gzipped — the bytes a browser
//              downloads. Measured for the whole API and for a minimal app (html + mount +
//              createState); rows that need an export condition the package doesn't declare yet
//              (e.g. a lean entry) are skipped.
//   unbundled  a no-build app (import map): every module reachable from the production entry
//              (src/prod.js), each gzipped on its own — as a CDN or server sends them.
//
// Reported but not budgeted: every shipped client source file (optional entries such as
// unsafe.js included) concatenated and gzipped — the measure the old, temporary budget used.
// It counts commented source files, not what an app loads, so splitting a module or adding an
// opt-in entry grew it even when apps shipped less.
//
// Budgets are ceilings, not targets, set from the measured size plus a little headroom. Raise one
// only for a reviewed change, with the measurement and the reason recorded below — never to make
// a failing check pass.
//
//   2026-11-01 (PERF-2E, initial): bundled whole API 11,242 B → 11.5 KB; bundled minimal app
//   10,936 B → 11 KB; unbundled production entry 35,894 B (19 files) → 36 KB.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRAMEWORK = join(root, "framework");
const SRC = join(FRAMEWORK, "src");
const KB = 1024;

// [label, budget (gzip bytes), how it's measured]
const BUNDLED = [
  { label: "bundled · whole API · production", budget: 11.5 * KB, conditions: ["production"], code: 'import * as z from "@zoijs/core"; globalThis.z = z;' },
  { label: "bundled · minimal app · production", budget: 11 * KB, conditions: ["production"], code: MINIMAL() },
];
const UNBUNDLED = [{ label: "unbundled · production entry (src/prod.js)", budget: 36 * KB, entry: "prod.js" }];

function MINIMAL() {
  return 'import { html, mount, createState } from "@zoijs/core"; const n = createState(0); mount(() => html`<button onclick=${() => n.set(n.get() + 1)}>${() => n.get()}</button>`, document.body);';
}

// ---- history of the old source budget (superseded by the budgets above) ---------------------------
//
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
// Raised to 24 KB (2026-10-04) for CORE-4 (compiler edge cases): ~23.4 KB then — +1.1 KB of
// required compiler correctness, mostly the HTML-exact attribute entity decoder and its Latin-1
// table. It exceeded 22.5 KB even with every comment removed, and dropping the entity handling
// would trade correctness for bytes. Still a temporary COMMENTED-SOURCE budget until PERF-2.
// This gate counts every client-reachable file, including opt-in entries like unsafe.js
// (SEC-3), which a page only loads if it imports @zoijs/core/unsafe.
// Raised to 25 KB (2026-10-04) for SEC-9 (wider URL guards, opener protection) — client + SSR
// security logic, with only ~394 B left at 24 KB. Required security/correctness work is not
// weakened to fit an obsolete source budget, but this is NOT permission for uncontrolled growth:
// it stays a temporary commented-source budget until PERF-2 replaces it with a
// production/minified budget and a source-delivery budget.
// Raised to 26.5 KB (2026-10-04) once SEC-9 landed at ~26.3 KB (its code alone exceeded 25 KB).
// Same terms: a temporary Phase 1 commented-source budget; required security/correctness behavior
// is not cut to fit an outdated ceiling; PERF-2 replaces it with separate production/minified and
// source-delivery budgets. SEC-10's fixes live in the router/i18n/storage/action packages, so they
// should not move this number.
// Raised to 28.5 KB (2026-10-12, reviewed with the maintainer) for the Zoijs Insight limitation fixes:
// L1/L2/L3/L7 landed at exactly 27,136 B, and the follow-up fixes need ~+500 B of code (live span
// tracking for multi-root each() items, enumerable item proxies, foreign-class-preserving class
// bindings, MathML context, unsafeHTML in SVG/MathML) plus their explanatory comments (~28.1 KB
// total). Same terms as above: a temporary commented-source budget until PERF-2.
// Raised to 30.5 KB (31,232 B) on 2026-10-14, approved by the maintainer as an exception for the
// hydration correctness fixes only (framework CHANGELOG [Unreleased]). The extra bytes are
// core/hydrate.js (structural validation of server HTML before anything is bound) plus nested DOM
// adoption and form-state preservation in renderer.js/mount.js: ~1.85 KB minified+gzip of code,
// ~3.0 KB of commented source. That fixed a crash on mismatched server HTML, pages left silently
// non-interactive without markers, and inputs losing value/focus on hydrate (and hydration got
// ~68% faster on a 200-row form list). It exceeded the old budget even with every comment removed.
// Conditions: this is a CEILING, not a target (~150 B left); no further raise without measured
// justification; this gate measures commented SOURCE, not what a browser downloads after
// minification — PERF-2 is to add a production minified/gzip budget beside it, and to look at
// moving hydration behind an optional import so apps without SSR don't ship it.

// ---- measuring --------------------------------------------------------------------------------------
const gz = (b) => gzipSync(b, { level: 9 }).length;
const exportsOf = JSON.parse(readFileSync(join(FRAMEWORK, "package.json"), "utf8")).exports["."];
const declared = (c) => c === "production" || c === "default" || c in exportsOf;

async function bundled({ conditions, code }) {
  let esbuild;
  try {
    esbuild = await import("esbuild");
  } catch {
    throw new Error("bench/size.mjs needs esbuild for the bundled sizes: npm ci --prefix bench");
  }
  const r = await esbuild.build({
    stdin: { contents: code, resolveDir: FRAMEWORK, sourcefile: "app.js" }, // "@zoijs/core" resolves to this package
    absWorkingDir: FRAMEWORK,
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    conditions,
    write: false,
    outdir: "out",
    logLevel: "silent",
  });
  const out = r.outputFiles.find((f) => f.path.endsWith(".js")).contents;
  return { raw: out.length, gzip: gz(out) };
}

/** Modules reachable from `entry` by static import/export…from (what a browser fetches). */
function reachable(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const m of code.matchAll(/(?:^|[\n;])\s*(?:import|export)\b[^;]*?\bfrom\s*["'](\.[^"']+)["']|(?:^|[\n;])\s*import\s*["'](\.[^"']+)["']/g)) {
    reachable(resolve(dirname(file), m[1] ?? m[2]), seen);
  }
  return seen;
}

function unbundled({ entry }) {
  const files = [...reachable(join(SRC, entry))].sort();
  return { raw: files.reduce((n, f) => n + statSync(f).size, 0), gzip: files.reduce((n, f) => n + gz(readFileSync(f)), 0), files: files.length };
}

// Report only: every shipped client source file (server.js is server-only: @zoijs/ssr imports it).
function allSource() {
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (name.endsWith(".js") && name !== "server.js") out.push(p);
    }
    return out;
  };
  const files = walk(SRC).sort();
  const bufs = files.map((f) => readFileSync(f));
  return { files, raw: bufs.reduce((n, b) => n + b.length, 0), gzip: gz(Buffer.concat(bufs)) };
}

// ---- report -----------------------------------------------------------------------------------------
const fmt = (n) => `${n.toLocaleString("en-US")} B`;
const rows = [];
for (const b of BUNDLED) {
  const missing = b.conditions.filter((c) => !declared(c));
  if (missing.length) {
    rows.push({ ...b, skipped: `the package declares no "${missing.join('", "')}" condition yet` });
    continue;
  }
  rows.push({ ...b, ...(await bundled(b)) });
}
for (const u of UNBUNDLED) rows.push({ ...u, ...unbundled(u) });

console.log("@zoijs/core — what apps ship (gzip level 9; budgets are ceilings)\n");
for (const r of rows) {
  if (r.skipped) {
    console.log(`  ${r.label.padEnd(46)} skipped: ${r.skipped}`);
    continue;
  }
  const left = r.budget - r.gzip;
  const extra = r.files ? `, ${r.files} files` : "";
  console.log(`  ${r.label.padEnd(46)} ${fmt(r.gzip).padStart(9)} gz  (${fmt(r.raw)} raw${extra})  budget ${fmt(r.budget)}  ${left >= 0 ? `${fmt(left)} left` : `OVER by ${fmt(-left)}`}`);
}
const all = allSource();
console.log(`\n  report only — all ${all.files.length} client source files, commented, concatenated: ${fmt(all.gzip)} gz (${fmt(all.raw)} raw)`);
console.log(`  per file (gz):`);
for (const f of all.files) console.log(`    ${relative(SRC, f).padEnd(28)} ${fmt(gz(readFileSync(f))).padStart(9)}`);

if (process.argv.includes("--check")) {
  const over = rows.filter((r) => !r.skipped && r.gzip > r.budget);
  if (over.length) {
    for (const r of over) console.error(`\n✖ ${r.label}: ${fmt(r.gzip)} gzipped exceeds its budget of ${fmt(r.budget)} — the core grew. Investigate before merging; a reviewed raise is recorded at the top of bench/size.mjs.`);
    process.exit(1);
  }
  console.log(`\n✔ every budget holds (${rows.filter((r) => !r.skipped).length} measured${rows.some((r) => r.skipped) ? `, ${rows.filter((r) => r.skipped).length} skipped` : ""})`);
}
