// Release state machine (release-blocker bundle 2). The documented sequence must be executable:
//   development  — nextCore null: next-only capabilities allowed, dependents BLOCKED, CI green;
//   core release — core-v<x> is READY with nextCore still null (core needs nothing published);
//   after core   — nextCore = x, "next" → x, floors raised, create/core-cdn.json regenerated:
//                  dependents READY once core x is on npm (BLOCKED, not ERROR, before that).
// Each state is staged in a throwaway copy of the packages and checked with check()/verdict().
// The copy is reset to the pre-release baseline (capabilities first shipped in 1.9.0 back to
// "next", ssr floor ^1.7.0, CDN map on 1.8.0), so these tests don't depend on how far the repo
// itself has moved through the sequence.

import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { check, verdict, compat as repoCompat, PACKAGES } from "../release-check.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NEXT = "1.9.0";
const skipNodeModules = (src) => !src.split(/[\\/]/).includes("node_modules") && !src.includes("test-results");

// Capabilities that first ship in NEXT (still "next" before the core release, NEXT after it).
const NEXT_CAPS = Object.keys(repoCompat.capabilities).filter((k) => ["next", NEXT].includes(repoCompat.capabilities[k]));
const PRE_RELEASE_SSR_FLOOR = "1.7.0";
const PUBLISHED_CORE = "1.8.0";

function stage({ nextCore = null, materialize = false, coreVersion = NEXT, ssrFloor = PRE_RELEASE_SSR_FLOOR, cdnTarget = PUBLISHED_CORE, full = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "zoijs-release-state-"));
  const dirs = full ? [...new Set([...Object.values(PACKAGES), "scripts"])] : ["framework", "ssr", "create", "resource", "sanitize", "scripts"];
  for (const dir of dirs) cpSync(join(repo, dir), join(root, dir), { recursive: true, filter: skipNodeModules });
  const json = (p, f) => { const d = JSON.parse(readFileSync(join(root, p), "utf8")); f(d); writeFileSync(join(root, p), JSON.stringify(d, null, 2)); };
  json("framework/package.json", (d) => (d.version = coreVersion));
  json("ssr/package.json", (d) => (d.peerDependencies["@zoijs/core"] = `^${ssrFloor}`));
  const compat = structuredClone(repoCompat);
  compat.nextCore = nextCore;
  for (const k of NEXT_CAPS) compat.capabilities[k] = materialize ? nextCore : "next";
  // The CLI reads the compat file next to it.
  writeFileSync(join(root, "scripts", "zoijs-compat.json"), JSON.stringify(compat, null, 2));
  {
    // A map in the exact shape cdn-importmap.mjs writes, hashed from the staged core's files
    // (standing in for the published tarball — the online --check is skipped offline).
    const src = join(root, "framework", "src");
    const files = [];
    const walk = (d) => readdirSync(d).forEach((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : n.endsWith(".js") && files.push(join(d, n))));
    walk(src);
    const base = `https://cdn.jsdelivr.net/npm/@zoijs/core@${cdnTarget}/`;
    const integrity = Object.fromEntries(files.map((f) => [base + relative(join(root, "framework"), f).split("\\").join("/"), "sha384-" + createHash("sha384").update(readFileSync(f)).digest("base64")]));
    writeFileSync(join(root, "create", "core-cdn.json"), JSON.stringify({ prod: true, imports: { "@zoijs/core": base + "src/prod.js" }, integrity, packages: { "@zoijs/core": { version: cdnTarget } } }));
  }
  return { root, compat, done: () => rmSync(root, { recursive: true, force: true }) };
}

const run = (s, prefix, version, opts = {}) => {
  const r = check(prefix, version, { root: s.root, compat: s.compat, ...opts });
  return { r, v: verdict(r), text: [...r.problems, ...(r.blockers || [])].join(" | ") };
};
const ssrVersion = () => JSON.parse(readFileSync(join(repo, "ssr", "package.json"), "utf8")).version;
const createVersion = () => JSON.parse(readFileSync(join(repo, "create", "package.json"), "utf8")).version;
// A registry where core NEXT is (not) published: returns the staged core dir as the "tarball".
const registry = (s, published) => (version) => {
  if (published && version === NEXT) return join(s.root, "framework");
  throw Object.assign(new Error("not published"), { notFound: true });
};

test("development: core READY; ssr and create BLOCKED (not ERROR) — ordinary CI stays green", () => {
  const s = stage({ coreVersion: "1.8.0" });
  try {
    assert.equal(run(s, "core", "1.8.0", { offline: true }).v, "READY");
    const ssr = run(s, "ssr", ssrVersion(), { offline: true });
    assert.equal(ssr.v, "BLOCKED", ssr.text);
    assert.match(ssr.text, /Publish that core first/);
    assert.equal(run(s, "create", createVersion(), { offline: true }).v, "BLOCKED");
  } finally {
    s.done();
  }
});

test("core release: core-v1.9.0 is READY with nextCore still null and 1.9.0 not on npm", () => {
  const s = stage();
  try {
    // online: core has no peer to fetch, so an unpublished 1.9.0 doesn't matter
    assert.equal(run(s, "core", NEXT, { fetchCore: registry(s, false) }).v, "READY");
  } finally {
    s.done();
  }
});

test("a declared nextCore must match the core being released", () => {
  const s = stage({ nextCore: NEXT, coreVersion: "1.9.1" });
  try {
    const core = run(s, "core", "1.9.1", { offline: true });
    assert.equal(core.v, "ERROR");
    assert.match(core.text, /next core is 1\.9\.0, but this is core 1\.9\.1/);
  } finally {
    s.done();
  }
});

test("after core: dependent BLOCKED until core is on npm, READY once it is; a stale floor is an ERROR", () => {
  const s = stage({ nextCore: NEXT, materialize: true, ssrFloor: NEXT });
  try {
    const waiting = run(s, "ssr", ssrVersion(), { fetchCore: registry(s, false) });
    assert.equal(waiting.v, "BLOCKED", waiting.text);
    assert.match(waiting.text, /@zoijs\/core@1\.9\.0, which isn't on npm yet — publish core first/);
    const ready = run(s, "ssr", ssrVersion(), { fetchCore: registry(s, true) });
    assert.equal(ready.v, "READY", ready.text);
  } finally {
    s.done();
  }
  const stale = stage({ nextCore: NEXT, materialize: true }); // floor left at ^1.7.0
  try {
    const r = run(stale, "ssr", ssrVersion(), { offline: true });
    assert.equal(r.v, "ERROR");
    assert.match(r.text, /raise the floor to \^1\.9\.0/);
  } finally {
    stale.done();
  }
});

test("create stays BLOCKED until its CDN map targets the published next core, then READY", () => {
  const before = stage({ nextCore: NEXT, materialize: true }); // core-cdn.json still on 1.8.0
  try {
    const r = run(before, "create", createVersion(), { offline: true });
    assert.equal(r.v, "BLOCKED", r.text);
    assert.match(r.text, /once core 1\.9\.0 is on npm, regenerate it/);
  } finally {
    before.done();
  }
  const after = stage({ nextCore: NEXT, materialize: true, cdnTarget: NEXT });
  try {
    const r = run(after, "create", createVersion(), { offline: true });
    assert.equal(r.v, "READY", r.text);
  } finally {
    after.done();
  }
});

test("the CLI: --all exits 0 with BLOCKED packages; a BLOCKED tag fails; ERROR always fails", async () => {
  const { execFileSync } = await import("node:child_process");
  const s = stage({ coreVersion: PUBLISHED_CORE, full: true }); // the development state, every package
  const cli = (...args) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [join(s.root, "scripts", "release-check.mjs"), ...args], { encoding: "utf8", stdio: "pipe" }) };
    } catch (e) {
      return { code: e.status, out: `${e.stdout}${e.stderr}` };
    }
  };
  try {
  const all = cli("--all", "--offline");
  assert.equal(all.code, 0, all.out);
  assert.match(all.out, /⏸ BLOCKED  ssr-v/);
  assert.equal(cli("--all", "--offline", "--strict").code, 1, "strict treats BLOCKED as failing");
  const tag = cli(`ssr-v${ssrVersion()}`, "--offline");
  assert.equal(tag.code, 1);
  assert.match(tag.out, /BLOCKED  ssr-v.*can't be released yet/);
  assert.equal(cli("core-v9.9.9", "--offline").code, 1, "a tag/version mismatch is an ERROR");
  } finally {
    s.done();
  }
});

// No-build docs: a package importing a public core subpath must document mapping it.
test("a README import-map recipe that omits a core subpath the package imports is an ERROR", () => {
  const s = stage({ coreVersion: "1.8.0" });
  const sanitizeVersion = JSON.parse(readFileSync(join(repo, "sanitize", "package.json"), "utf8")).version;
  try {
    assert.equal(run(s, "sanitize", sanitizeVersion, { offline: true }).v, "READY", "the current README maps @zoijs/core/server");
    // The README before this fix: told users to map only "@zoijs/core" and "@zoijs/sanitize".
    const old = 'Or with no install, from a CDN: in an import map, point "@zoijs/core" and "@zoijs/sanitize" at\n**exact-version** jsDelivr file URLs with integrity hashes, then import by name.\n';
    writeFileSync(join(s.root, "sanitize", "README.md"), "# @zoijs/sanitize\n\n" + old);
    const r = run(s, "sanitize", sanitizeVersion, { offline: true });
    assert.equal(r.v, "ERROR");
    assert.match(r.text, /never mentions "@zoijs\/core\/server"/);
    // An embedded map that leaves it out (or drops an integrity hash) is an ERROR too.
    const map = { imports: { "@zoijs/core": "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/index.js", "@zoijs/sanitize": "https://cdn.jsdelivr.net/npm/@zoijs/sanitize@0.1.0/src/index.js" }, integrity: {} };
    writeFileSync(join(s.root, "sanitize", "README.md"), `# x\n\nimport map for @zoijs/core/server:\n\n<script type="importmap">\n${JSON.stringify(map)}\n</script>\n`);
    const r2 = run(s, "sanitize", sanitizeVersion, { offline: true });
    assert.match(r2.text, /doesn't map "@zoijs\/core\/server"/);
    assert.match(r2.text, /no integrity for https:\/\/cdn\.jsdelivr\.net\/npm\/@zoijs\/core@1\.8\.0\/src\/index\.js/);
  } finally {
    s.done();
  }
});
