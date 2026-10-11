// Stale version pins in current docs (Phase 10): the tag-time check in release-check.mjs and the
// post-publish check-doc-pins.mjs. Fixtures are throwaway docs; npm's `latest` is injected.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { docPins, docFiles, currentDocs, stalePins, floatingUrls, importMaps, mapProblems, wrongHashes } from "../check-doc-pins.mjs";
import { createHash } from "node:crypto";
import { check } from "../release-check.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("docPins finds exact pins in URLs, import maps and npm lines — not ranges or look-alikes", () => {
  const dir = mkdtempSync(join(tmpdir(), "zoijs-pins-"));
  try {
    writeFileSync(join(dir, "a.md"), [
      '"@zoijs/api": "https://cdn.jsdelivr.net/npm/@zoijs/api@0.1.0/src/index.js",',
      "npm install @zoijs/core@1.9.0 create-zoijs@2.0.1",
      "peer range @zoijs/core@^1.2.0 and @zoijs/core@1 and @zoijs/core@1.9 are not pins",
      "my@zoijs/api@0.0.1 is not a pin; @zoijs/api@0.2.0-rc.1 is",
      "historical: @zoijs/api@0.0.9 <!-- pin-ok -->",
    ].join("\n"));
    writeFileSync(join(dir, "b.txt"), "@zoijs/api@0.0.1");
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "c.md"), "@zoijs/api@0.0.1");
    const pins = docPins(docFiles([dir])).map((p) => `${p.line}:${p.name}@${p.version}`);
    assert.deepEqual(pins, ["1:@zoijs/api@0.1.0", "2:@zoijs/core@1.9.0", "2:create-zoijs@2.0.1", "4:@zoijs/api@0.2.0-rc.1"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stalePins judges only the packages it's told about", () => {
  const pins = [{ name: "@zoijs/api", version: "0.1.0" }, { name: "@zoijs/api", version: "0.0.5" }, { name: "@zoijs/core", version: "1.0.0" }];
  assert.deepEqual(stalePins(pins, new Map([["@zoijs/api", new Set(["0.1.0"])]])), [pins[1]]);
});

test("currentDocs covers READMEs and framework/docs, never CHANGELOGs, RFCs or migration guides", () => {
  const files = currentDocs(repo).map((f) => f.slice(repo.length + 1));
  assert.ok(files.includes("README.md") && files.includes("api/README.md") && files.includes("sanitize/README.md") && files.includes("framework/docs/installation.md"));
  assert.ok(!files.some((f) => /CHANGELOG|rfcs|migration/.test(f)));
});

test("release-check (online): a doc may pin this release or npm latest; older is stale, newer is a typo", () => {
  const root = mkdtempSync(join(tmpdir(), "zoijs-pins-release-"));
  try {
    for (const d of ["api", "scripts"]) cpSync(join(repo, d), join(root, d), { recursive: true, filter: (s) => !s.includes("node_modules") && !s.includes("test-results") });
    mkdirSync(join(root, "framework", "docs"), { recursive: true });
    writeFileSync(join(root, "README.md"), "# Zoijs\n");
    const doc = join(root, "framework", "docs", "installation.md");
    const run = (pinned, latest = "0.1.0") => {
      writeFileSync(doc, `"@zoijs/api": "https://cdn.jsdelivr.net/npm/@zoijs/api@${pinned}/src/index.js"\n`);
      const r = check("api", version, { root, latestOf: () => latest, fetchCore: fetchFloor });
      return r.problems.filter((p) => p.includes("pins @zoijs/api"));
    };
    const version = JSON.parse(String(readPkg(root))).version;
    assert.deepEqual(run(version), []); // this release
    assert.deepEqual(run("0.1.0"), []); // npm latest — the release being superseded
    assert.match(run("0.0.5")[0], /framework\/docs\/installation\.md:1 pins @zoijs\/api@0\.0\.5 — stale/);
    assert.match(run("9.0.0")[0], /newer than this release/);
    assert.match(run("0.0.5", null)[0], /none published/);
    // offline: not judged (the registry is needed to know what's still current)
    writeFileSync(doc, "@zoijs/api@0.0.5\n");
    assert.deepEqual(check("api", version, { root, offline: true }).problems.filter((p) => p.includes("pins")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const readPkg = (root) => readFileSync(join(root, "api", "package.json"));
// Stand-in for the published core at the api's peer floor: the repo's own framework (it only needs
// to provide the imports so the floor check passes; this test is about doc pins).
const fetchFloor = () => join(repo, "framework");

test("import maps in docs: floating URLs, missing/malformed/wrong integrity are caught; prose and self-hosted maps aren't", () => {
  const dir = mkdtempSync(join(tmpdir(), "zoijs-maps-"));
  try {
    const good = "export const x = 1;\n";
    const hash = "sha384-" + createHash("sha384").update(good).digest("base64");
    const url = "https://cdn.jsdelivr.net/npm/@zoijs/api@0.1.0/src/index.js";
    const map = (integrity, imports = { "@zoijs/api": url }) => `<script type="importmap">\n${JSON.stringify({ imports, integrity })}\n</script>`;
    writeFileSync(join(dir, "a.md"), [
      map({ [url]: hash }),
      map({ [url]: "sha384-" + "A".repeat(64) }),
      map({}),
      map({ [url]: "sha256-short" }),
      map({}, { "@zoijs/core": "/node_modules/@zoijs/core/src/index.js" }), // self-hosted: no integrity needed
      "Hash every character between `<script type=\"importmap\">` and `</script>` (prose, not a map).",
      "  <script type=\"importmap\">{ not json }</script>",
      "floating: https://cdn.jsdelivr.net/npm/@zoijs/core@1/src/index.js https://cdn.jsdelivr.net/npm/@zoijs/core/src/index.js https://cdn.jsdelivr.net/npm/@zoijs/core@1.9.0",
      "fine: https://cdn.jsdelivr.net/npm/@zoijs/core@1.9.0/src/prod.js and https://cdn.jsdelivr.net/npm/@zoijs/core@<version>/src/prod.js",
    ].join("\n"));
    const files = docFiles([dir]);
    assert.deepEqual(floatingUrls(files).map((f) => f.url), [
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1/src/index.js",
      "https://cdn.jsdelivr.net/npm/@zoijs/core/src/index.js",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.9.0",
    ]);
    const maps = importMaps(files);
    assert.equal(maps.length, 6);
    assert.equal(maps[5].error, "isn't valid JSON");
    assert.deepEqual(maps.slice(0, 5).map((m) => mapProblems(m)), [[], [], [`${url} has no integrity`], [`malformed integrity for ${url}`], []]);
    const read = (name, version, file) => {
      assert.deepEqual([name, version, file], ["@zoijs/api", "0.1.0", "src/index.js"]);
      return Buffer.from(good);
    };
    assert.deepEqual(wrongHashes(maps[0], read), []);
    assert.deepEqual(wrongHashes(maps[1], read), [`integrity for ${url} doesn't match the published file`]);
    assert.throws(() => wrongHashes(maps[0], () => { throw new Error("registry down"); }), /registry down/, "a fetch failure propagates — never a silent pass");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
