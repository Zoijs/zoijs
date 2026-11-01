// The dependency gates' decision logic, on fixed inputs (no registry, no real lockfiles):
// scripts/check-licenses.mjs and scripts/audit-deps.mjs. The real run is `npm run test:deps`
// (licenses, offline) and the CI "Dependencies" job (npm audit).

import test from "node:test";
import assert from "node:assert/strict";
import { allowedExpression, checkLicenses, lockfileDirs } from "../check-licenses.mjs";
import { findings, judge } from "../audit-deps.mjs";

const allowed = ["MIT", "ISC", "Apache-2.0", "BSD-3-Clause"];

test("SPDX expressions: OR needs one allowed side, AND needs all", () => {
  assert.equal(allowedExpression("MIT", allowed), true);
  assert.equal(allowedExpression("(MIT OR GPL-3.0-only)", allowed), true);
  assert.equal(allowedExpression("MIT AND OFL-1.1", allowed), false);
  assert.equal(allowedExpression("Apache-2.0 AND MIT", allowed), true);
  assert.equal(allowedExpression("GPL-3.0-only", allowed), false);
  assert.equal(allowedExpression("SEE LICENSE IN LICENSE.txt", allowed), false);
});

const lock = (packages) => ({ lockfileVersion: 3, packages: { "": { name: "x" }, ...packages } });
const rules = (exceptions = []) => ({ allowed, exceptions });

test("licenses: direct and transitive packages are checked; first-party links are skipped", () => {
  const { problems, count } = checkLicenses({
    dirs: ["pkg"],
    read: () =>
      lock({
        "node_modules/a": { version: "1.0.0", license: "MIT", dev: true },
        "node_modules/a/node_modules/b": { version: "2.0.0", license: "GPL-3.0-only", dev: true },
        "node_modules/c": { version: "1.0.0", dev: true },
        "node_modules/@zoijs/core": { resolved: "../framework", link: true },
        "../framework": { name: "@zoijs/core", version: "1.10.0" },
      }),
    rules: rules(),
  });
  assert.equal(count, 3);
  assert.deepEqual(problems, [
    'pkg: b@2.0.0 — license "GPL-3.0-only" is not allowed (dev)',
    "pkg: c@1.0.0 — no license declared (dev)",
  ]);
});

test("licenses: an exception is scoped to its lockfile and exact license; unused ones are stale", () => {
  const read = () => lock({ "node_modules/@img/sharp-libvips-x": { version: "1.0.0", license: "LGPL-3.0-or-later" } });
  const ex = { lockfile: "assets", package: "@img/sharp-libvips-*", license: "LGPL-3.0-or-later", reason: "r" };
  assert.deepEqual(checkLicenses({ dirs: ["assets"], read, rules: rules([ex]) }).problems, []);
  const elsewhere = checkLicenses({ dirs: ["framework"], read, rules: rules([ex]) }).problems;
  assert.match(elsewhere[0], /framework: @img\/sharp-libvips-x@1.0.0 — license "LGPL-3.0-or-later" is not allowed/);
  assert.match(elsewhere[1], /stale exception: assets: @img\/sharp-libvips-\*/);
  const otherLicense = checkLicenses({ dirs: ["assets"], read, rules: rules([{ ...ex, license: "LGPL-2.1" }]) }).problems;
  assert.equal(otherLicense.length, 2, "a changed license is not covered by the old exception");
});

test("the real repository: every lockfile is found", () => {
  const dirs = lockfileDirs();
  for (const d of ["framework", "ssr", "router", "sanitize", "examples/task-board"]) assert.ok(dirs.includes(d), d);
});

// A trimmed npm audit v2 report: one direct advisory with a fix, one transitive with none.
const REPORT = {
  vulnerabilities: {
    minimist: {
      name: "minimist", severity: "critical", isDirect: false, range: "<1.2.6", fixAvailable: false,
      via: [{ source: 1, url: "https://github.com/advisories/GHSA-xvch-5gv4-984h", title: "Prototype Pollution", severity: "critical", range: "<1.2.6" }],
    },
    mkdirp: { name: "mkdirp", severity: "critical", isDirect: true, range: "0.4.1 - 0.5.1", via: ["minimist"], fixAvailable: { name: "mkdirp", version: "3.0.1", isSemVerMajor: true } },
    ws: {
      name: "ws", severity: "high", isDirect: true, range: "8.0.0 - 8.17.0", fixAvailable: true,
      via: [{ source: 2, url: "https://github.com/advisories/GHSA-3h5v-q93c-6h6q", title: "DoS", severity: "high" }],
    },
  },
  metadata: { vulnerabilities: { total: 3 } },
};

test("audit: one finding per advisory, with dependency kind and fix", () => {
  const f = findings("framework", REPORT);
  assert.deepEqual(
    f.map((x) => [x.package, x.severity, x.direct, x.advisory, x.fix]),
    [
      ["minimist", "critical", false, "https://github.com/advisories/GHSA-xvch-5gv4-984h", "none yet"],
      ["ws", "high", true, "https://github.com/advisories/GHSA-3h5v-q93c-6h6q", "npm audit fix"],
    ]
  );
});

test("audit: only an exact, unexpired exception accepts a finding; expired and stale ones fail", () => {
  const f = findings("framework", REPORT);
  const ok = { lockfile: "framework", package: "ws", advisory: "https://github.com/advisories/GHSA-3h5v-q93c-6h6q", reason: "dev server only", expires: "2026-12-31" };
  let r = judge(f, [ok], "2026-10-13");
  assert.deepEqual(r.accepted.map((x) => x.package), ["ws"]);
  assert.deepEqual(r.failing.map((x) => x.package), ["minimist"], "everything else still fails");
  r = judge(f, [ok], "2027-01-01");
  assert.equal(r.failing.find((x) => x.package === "ws").note, "exception expired 2026-12-31");
  r = judge([], [ok], "2026-10-13");
  assert.equal(r.stale.length, 1, "an exception that matches nothing is reported");
  r = judge(f, [{ ...ok, lockfile: "router" }], "2026-10-13");
  assert.equal(r.accepted.length, 0, "exceptions are per lockfile");
});

test("Dependabot covers every committed lockfile (except the private assets/ tooling) and GitHub Actions", async () => {
  const { readFileSync } = await import("node:fs");
  const yml = readFileSync(new URL("../../.github/dependabot.yml", import.meta.url), "utf8");
  assert.match(yml, /package-ecosystem: github-actions/);
  assert.match(yml, /package-ecosystem: npm/);
  const listed = [...yml.matchAll(/^ {6}- \/(\S+)/gm)].map((m) => m[1]);
  assert.deepEqual(lockfileDirs().filter((d) => d !== "assets" && !listed.includes(d)), [], "lockfiles missing from dependabot.yml");
  assert.deepEqual(listed.filter((d) => !lockfileDirs().includes(d)), [], "dependabot.yml lists directories without a lockfile");
});
