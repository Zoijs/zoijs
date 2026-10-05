// SEC-7 — every package's @zoijs/core peer floor tells the truth.
//
// Checks each package's real imports (subpaths and named exports) against
// scripts/zoijs-compat.json — the first core version providing each — offline, so
// it runs in every CI job. Packages that need a capability from the next,
// still-unversioned core release must show up as release BLOCKERS (never pass
// silently, never claim an impossible range). Online verification against the
// published tarballs happens in `npm run release:check` at release time.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { check, compat, coreImports, rangeFloor, cmp, PACKAGES } from "../release-check.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkgJson = (dir) => JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
const results = Object.entries(PACKAGES).map(([prefix, dir]) => ({ prefix, dir, ...check(prefix, pkgJson(dir).version, { offline: true }) }));

test("the compat table is well-formed", () => {
  assert.match(compat.securityFloor, /^\d+\.\d+\.\d+$/);
  for (const [cap, v] of Object.entries(compat.capabilities)) {
    assert.ok(v === "next" || /^\d+\.\d+\.\d+$/.test(v), `${cap}: ${v}`);
  }
  assert.ok(compat.nextCore === null || /^\d+\.\d+\.\d+$/.test(compat.nextCore));
});

test("no package has a peer-floor or tarball problem (offline)", () => {
  for (const r of results) assert.deepEqual(r.problems, [], `${r.prefix}: ${r.problems.join("; ")}`);
});

test("sanitize's peer floor excludes every core without @zoijs/core/server", () => {
  const floor = rangeFloor(pkgJson("sanitize").peerDependencies["@zoijs/core"]);
  assert.ok(coreImports("sanitize").some((i) => i.subpath === "@zoijs/core/server"), "sanitize imports /server");
  assert.ok(cmp(floor, compat.capabilities["@zoijs/core/server"]) >= 0, `floor ${floor} < first /server core`);
  assert.ok(cmp(floor, "1.5.0") >= 0, "1.0.0–1.4.x had no /server subpath (verified on npm)");
});

test("ssr's peer floor includes styleObjectToCss from /server (core 1.7.0)", () => {
  const floor = rangeFloor(pkgJson("ssr").peerDependencies["@zoijs/core"]);
  assert.ok(coreImports("ssr").some((i) => i.subpath === "@zoijs/core/server" && i.names.includes("styleObjectToCss")));
  assert.ok(cmp(floor, compat.capabilities["@zoijs/core/server#styleObjectToCss"]) >= 0, `floor ${floor}`);
});

test("packages needing an unreleased core capability are release blockers, not silent passes", () => {
  const needsNext = (r) => coreImports(r.dir).some((i) => [i.subpath, ...i.names.map((n) => `${i.subpath}#${n}`)].some((c) => compat.capabilities[c] === "next"));
  for (const r of results.filter(needsNext)) {
    if (compat.nextCore === null) assert.ok(r.blockers.length > 0, `${r.prefix} must be blocked until the next core version is chosen`);
    else assert.ok(cmp(rangeFloor(pkgJson(r.dir).peerDependencies["@zoijs/core"]), compat.nextCore) >= 0, `${r.prefix} floor < ${compat.nextCore}`);
  }
});

// Packages must never need a private core subpath: no-build apps would have to add an import-map
// entry for it (the CORE-3 regression). resource/action report via the shared runtime instead.
test("no package imports a core subpath beyond the public ones; resource/action import only the root", () => {
  const PUBLIC = new Set(["@zoijs/core", "@zoijs/core/server", "@zoijs/core/devtools"]);
  for (const r of results) for (const i of coreImports(r.dir)) assert.ok(PUBLIC.has(i.subpath), `${r.prefix} imports ${i.subpath}`);
  for (const dir of ["resource", "action"]) assert.deepEqual([...new Set(coreImports(dir).map((i) => i.subpath))], ["@zoijs/core"], dir);
  assert.equal(compat.capabilities["@zoijs/core/internal"], undefined, "the /internal subpath is gone");
});

test("create is blocked until the core with the production entry is published, and never targets an insecure core", () => {
  const r = results.find((x) => x.prefix === "create");
  const target = JSON.parse(readFileSync(join(root, "create", "core-cdn.json"), "utf8")).packages["@zoijs/core"].version;
  assert.ok(cmp(target, compat.securityFloor) >= 0);
  const prod = compat.capabilities["@zoijs/core/prod"];
  if (prod === "next") assert.match(r.blockers.join(" "), /@zoijs\/core\/prod/);
  else {
    // Shipped: the map must target a core that has the production entry, and nothing blocks create.
    assert.ok(cmp(target, prod) >= 0, `core-cdn.json targets ${target}, but /prod first shipped in ${prod}`);
    assert.deepEqual(r.blockers, []);
  }
});

test("npm peer ranges stay ranges (not exact pins)", () => {
  for (const [, dir] of Object.entries(PACKAGES)) {
    const range = pkgJson(dir).peerDependencies?.["@zoijs/core"];
    if (range) assert.match(range, /^(\^|>=)\d+\.\d+\.\d+$/, `${dir}: ${range}`);
  }
});

test("the installation guide's CDN import map is the verified one (same version, same hashes)", () => {
  const cdn = JSON.parse(readFileSync(join(root, "create", "core-cdn.json"), "utf8"));
  const doc = readFileSync(join(root, "framework", "docs", "installation.md"), "utf8");
  const m = /## From a CDN[\s\S]*?<script type="importmap">([\s\S]*?)<\/script>/.exec(doc);
  assert.ok(m, "installation.md has a CDN import map");
  const map = JSON.parse(m[1]);
  assert.deepEqual(map.imports, cdn.imports);
  assert.deepEqual(map.integrity, cdn.integrity, "regenerate the docs map from create/core-cdn.json");
});

test("ssr is blocked until the next core ships the SEC-9 helpers it imports from /server", () => {
  const r = results.find((x) => x.prefix === "ssr");
  const names = coreImports("ssr").flatMap((i) => i.names);
  assert.ok(names.includes("isSafeAttributeValue") && names.includes("openerRel"));
  const first = compat.capabilities["@zoijs/core/server#isSafeAttributeValue"];
  if (first === "next") assert.match(r.blockers.join(" "), /isSafeAttributeValue from @zoijs\/core\/server.*next core release/);
  else {
    // Shipped: the peer floor must include the release that added the helpers.
    assert.equal(compat.capabilities["@zoijs/core/server#openerRel"], first);
    assert.ok(cmp(rangeFloor(pkgJson("ssr").peerDependencies["@zoijs/core"]), first) >= 0, `ssr floor < ${first}`);
    assert.deepEqual(r.blockers, []);
  }
});
