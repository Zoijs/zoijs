// Docs consistency — focused checks for stale claims the release audit found, so they can't
// creep back. Semantic checks, not prose snapshots. Run via `npm run test:docs`.
//
// "User-facing docs" = every tracked Markdown/HTML file except CHANGELOGs (historical by
// design), RFCs, the original planning specs, and files that open with a historical-snapshot
// banner. Tests and repository tooling are not docs.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

const HISTORICAL_FILES = [/(^|\/)CHANGELOG\.md$/, /^framework\/docs\/rfcs\//, /^framework\/docs\/Phase-1-MVP-Spec\.md$/, /^framework\/docs\/DEVELOPMENT-PLAN\.md$/];
const isHistorical = (p) => HISTORICAL_FILES.some((r) => r.test(p)) || /^> \*\*Historical snapshot/m.test(read(p).split("\n").slice(0, 8).join("\n"));
const isTestOrTooling = (p) => /(^|\/)(tests|browser-tests|scripts)\//.test(p) || /(^|\/)node_modules\//.test(p);
const DOCS = tracked.filter((p) => /\.(md|html)$/.test(p) && !isTestOrTooling(p) && !isHistorical(p));
// A line that explicitly rejects the pattern ("never `npx serve`", "never `@zoijs/core@1`").
const NEGATED = /\b(never|not|no longer|instead of|replaces|don't|can't)\b/i;

function offenders(files, pattern, { allowNegated = false } = {}) {
  const out = [];
  for (const f of files) {
    read(f).split("\n").forEach((line, i) => {
      if (pattern.test(line) && !(allowNegated && NEGATED.test(line))) out.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return out;
}

test("the doc set under test is non-trivial (sanity)", () => {
  assert.ok(DOCS.length > 40, `only ${DOCS.length} docs found`);
  for (const must of ["README.md", "framework/README.md", "framework/VERSIONING.md", "framework/docs/security.md", "create/templates/minimal/README.md"]) {
    assert.ok(DOCS.includes(must), `${must} should be checked`);
  }
});

test("no active reference to the removed @zoijs/core/internal subpath", () => {
  const bad = offenders(tracked.filter((p) => !isTestOrTooling(p) && /\.(md|html|js|mjs|json|ts)$/.test(p)), /@zoijs\/core\/internal|["']\.\/internal["']|src\/internal/)
    // VERSIONING.md states, historically, that it was removed before any release.
    .filter((l) => !(l.startsWith("framework/VERSIONING.md:") && /removed/.test(l)));
  assert.deepEqual(bad, []);
  const pkg = JSON.parse(read("framework/package.json"));
  assert.equal(pkg.exports["./internal"], undefined);
  assert.equal(JSON.parse(read("scripts/zoijs-compat.json")).capabilities["@zoijs/core/internal"], undefined);
});

test("no user-facing doc recommends a mutable npx-fetched server", () => {
  assert.deepEqual(offenders(DOCS, /\bnpx\s+(serve|http-server|live-server|sirv)\b|(^|\s)serve\s+(\.|-l\b)/, { allowNegated: true }), []);
});

test("no floating or build-service CDN URL for a Zoijs package", () => {
  const FLOATING = /(esm\.sh|unpkg\.com|skypack\.dev|jspm\.(dev|io))\/[^\s"'`)]*@zoijs|@zoijs\/[a-z-]+@(latest|\d+(\.\d+)?)(?![.\d\w])/;
  assert.deepEqual(offenders(DOCS, FLOATING, { allowNegated: true }), []);
});

test("raw HTML is described with the final model (html / sanitize / unsafeHTML)", () => {
  assert.deepEqual(offenders(DOCS, /no raw[- ]html (rendering )?(api|sink)|deliberately no `?unsafeHTML|unsafeHTML.{0,40}\b(future|planned|someday)\b/i), []);
  for (const f of ["framework/SECURITY.md", "framework/docs/security.md", "sanitize/README.md"]) {
    const t = read(f);
    for (const name of ["sanitize", "unsafeHTML"]) assert.match(t, new RegExp(name), `${f} names ${name}`);
  }
});

test("the shared runtime is described version-aware (not 'every 1.x copy')", () => {
  assert.deepEqual(offenders(DOCS, /every 1\.x copy|all 1\.x copies/i), []);
  for (const f of ["framework/docs/troubleshooting.md", "framework/docs/ecosystem.md", "framework/VERSIONING.md"]) {
    assert.match(read(f), /1\.8\.0 and older/, `${f} says which cores don't participate`);
  }
});

test("no blanket CSP-compatibility claim — the allowances are named", () => {
  assert.deepEqual(offenders(DOCS, /\bCSP[- ](friendly|compatible|ready)\b|strict[- ]CSP[- ]compatible|runs under (a|any) strict Content-Security-Policy/i), []);
  // The allowances are spelled out where the CSP guidance lives.
  for (const f of ["framework/docs/production-security.md", "framework/docs/deployment.md"]) {
    assert.match(read(f), /style-src-attr 'unsafe-inline'/, f);
  }
  assert.match(read("framework/docs/production-security.md"), /import map/);
});

test("unsafeHTML's server-rendered <script> behavior is documented where it's used", () => {
  for (const f of ["framework/docs/security.md", "framework/docs/api-reference.md", "framework/docs/production-security.md", "ssr/README.md"]) {
    const t = read(f);
    assert.match(t, /may contain executable markup/, `${f}: SSR warning`);
    assert.match(t, /execut(es|ed)\b[^.]*(page loads|loads server-rendered|on page load)|(page loads|on page load)[^.]*execut/i, `${f}: says the script runs`);
  }
});

test("API counts match the main entry", () => {
  const exports = [...read("framework/src/index.js").matchAll(/^export \{ (\w+) \}/gm)].map((m) => m[1]);
  const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const word = WORDS[exports.length];
  assert.equal(word, "nine", `main entry now has ${exports.length} exports — update the docs that say "nine functions", then this test`);
  const COUNT = /\b(five|six|seven|eight|nine|ten|eleven|twelve) (core )?(public )?functions\b/gi;
  const wrong = [];
  for (const f of ["README.md", "framework/README.md", "framework/VERSIONING.md", "framework/docs/README.md", "framework/docs/api-reference.md", "framework/docs/ecosystem.md", "framework/docs/enterprise-readiness.md", "framework/docs/scope.md"]) {
    for (const m of read(f).matchAll(COUNT)) if (m[1].toLowerCase() !== word) wrong.push(`${f}: "${m[0]}"`);
  }
  assert.deepEqual(wrong, []);
  const versioning = read("framework/VERSIONING.md");
  for (const name of exports) assert.match(versioning, new RegExp("`" + name + "`"), `VERSIONING.md lists ${name}`);
});

test("VERSIONING.md documents every public core subpath and the security-hardening policy", () => {
  const v = read("framework/VERSIONING.md");
  const subpaths = Object.keys(JSON.parse(read("framework/package.json")).exports).map((k) => (k === "." ? "@zoijs/core" : "@zoijs/core/" + k.slice(2)));
  for (const s of subpaths) assert.ok(v.includes("| `" + s + "` |"), `${s} has a row in the subpath table`);
  assert.match(v, /participate in semver/);
  assert.match(v, /## Security hardening/);
  for (const example of ["ZJS010", "<base>", "noopener noreferrer", "@event=", "user-content-"]) assert.ok(v.includes(example), `cites ${example}`);
  assert.match(v, /When in doubt, it is MAJOR/);
});

test("size claims distinguish the commented-source gate from production size", () => {
  const bench = read("bench/README.md");
  assert.match(bench, /commented source/);
  assert.match(bench, /PERF-2/);
  assert.doesNotMatch(bench, /\|\s*\*\*gzipped\*\*\s*\|/, "no current-size table quoting an old figure");
  assert.deepEqual(offenders(DOCS, /≤ ?1[0-9] KB|~13\.3 KB|18\.1 KB/).filter((l) => !/Historical/.test(l)), []);
});

test("the (next release) marker convention stays defined for the next release cycle", () => {
  // Markers were removed when 1.9.0 shipped; the convention is reused for whatever ships next.
  assert.match(read("framework/docs/README.md"), /\*\(next release\)\*/, "the convention is defined");
});

test("migration notes for the next core release exist and cover the material changes", () => {
  const log = read("framework/CHANGELOG.md");
  // Before the release they sit under [Unreleased]; once the version is cut, under its heading.
  const version = JSON.parse(read("framework/package.json")).version;
  const head = log.includes(`## [${version}]`) ? `## [${version}]` : "## [Unreleased]";
  const unreleased = log.slice(log.indexOf(head), log.indexOf("\n## [", log.indexOf(head) + 1));
  assert.match(unreleased, /### Migration notes/);
  for (const topic of ["ZJS010", "? Child : null", "Child()", "user-content-", "idPrefix: \"\"", ".prop=", "noopener noreferrer", "go()", "decodeSlash: false", "<base>"]) {
    assert.ok(unreleased.includes(topic), `migration notes mention ${topic}`);
  }
});
