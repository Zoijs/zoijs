// SEC-7 — generated apps pin @zoijs/core deterministically and securely.
//
// Every Zoijs version a template emits comes from create/core-cdn.json (one exact,
// published core version + its jsDelivr integrity map) through tokens; templates
// never hard-code a version or a CDN URL. Parsed structurally, not grepped.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scaffold, loadCore, TEMPLATES } from "../bin/create-zoijs.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(here, "..", "templates");
const compat = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "scripts", "zoijs-compat.json"), "utf8"));
const core = loadCore();
const cmp = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
const EXACT = /^\d+\.\d+\.\d+$/;
// Floating framework references (`npm create zoijs@latest` invokes the scaffolder, not a dependency).
const FLOATING = /esm\.sh|unpkg\.com|skypack|@zoijs\/[a-z-]+@(?:latest|\d+(?:\.\d+)?(?![.\d]))/;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
function generate(template, coreOverride) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `zoijs-v-${template}-`));
  scaffold({ name: "demo", template, targetDir: path.join(dir, "demo"), ...(coreOverride ? { core: coreOverride } : {}) });
  return path.join(dir, "demo");
}
function importMap(html) {
  const m = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
  return m && JSON.parse(m[1]);
}

test("create targets one exact, published-style core version at or above the security floor", () => {
  assert.match(core.version, EXACT);
  assert.ok(cmp(core.version, compat.securityFloor) >= 0, `${core.version} < security floor ${compat.securityFloor}`);
});

test("template sources never hard-code a Zoijs version or CDN URL (tokens only)", () => {
  for (const file of walk(templatesDir)) {
    const text = fs.readFileSync(file, "utf8");
    if (file.endsWith("package.json")) {
      const pkg = JSON.parse(text);
      for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
        const v = pkg[field]?.["@zoijs/core"];
        if (v !== undefined) assert.equal(v, "^{{ZOIJS_CORE_VERSION}}", `${file} ${field}`);
      }
    }
    assert.doesNotMatch(text, /cdn\.jsdelivr\.net\/npm\/@zoijs|esm\.sh|unpkg\.com/, file);
  }
});

test("every generated app pins core to the target version; nothing floats", () => {
  for (const template of TEMPLATES) {
    const dir = generate(template);
    for (const file of walk(dir)) {
      const text = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(text, /\{\{ZOIJS_/, `${template}: unreplaced token in ${file}`);
      assert.doesNotMatch(text, FLOATING, `${template}: floating reference in ${file}`);
      if (path.basename(file) === "package.json") {
        const pkg = JSON.parse(text);
        for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
          const v = pkg[field]?.["@zoijs/core"];
          if (v !== undefined) assert.equal(v, `^${core.version}`, `${template} ${field}`);
        }
      }
    }
  }
});

test("the minimal (CDN) app's import map is exact and fully integrity-protected", () => {
  const map = importMap(fs.readFileSync(path.join(generate("minimal"), "index.html"), "utf8"));
  assert.ok(map, "has an import map");
  const base = `https://cdn.jsdelivr.net/npm/@zoijs/core@${core.version}/`;
  assert.equal(map.imports["@zoijs/core"], `${base}src/index.js`);
  for (const url of Object.values(map.imports)) assert.ok(map.integrity[url], `no integrity for ${url}`);
  for (const [url, hash] of Object.entries(map.integrity)) {
    assert.ok(url.startsWith(base), `${url} is not exact`);
    assert.match(hash, /^sha384-[A-Za-z0-9+/]{64}$/, url);
  }
  assert.deepEqual(map.integrity, core.integrity, "matches core-cdn.json exactly");
});

test("substitution is deterministic: a different target core flows everywhere", () => {
  const fake = { version: "9.8.7", imports: { "@zoijs/core": "https://cdn.jsdelivr.net/npm/@zoijs/core@9.8.7/src/index.js" }, integrity: { "https://cdn.jsdelivr.net/npm/@zoijs/core@9.8.7/src/index.js": "sha384-" + "A".repeat(64) } };
  assert.equal(JSON.parse(fs.readFileSync(path.join(generate("app", fake), "package.json"), "utf8")).dependencies["@zoijs/core"], "^9.8.7");
  assert.deepEqual(importMap(fs.readFileSync(path.join(generate("minimal", fake), "index.html"), "utf8")).integrity, fake.integrity);
});
