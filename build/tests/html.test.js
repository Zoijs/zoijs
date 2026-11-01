// htmlTags(), stripImportMap(), inlineScripts()/scriptHashes(), and import-map verification.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { build, BuildError, htmlTags, stripImportMap, inlineScripts, scriptHashes } from "../src/index.js";
import { project, read, sri, exists, APP_FILES, CORE_FILES } from "./helpers.js";

const csp = (text) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

test("htmlTags: stylesheet, modulepreload for the entry's static chunks, then the module script", async (t) => {
  const root = project(t);
  const r = await build({ root, entryPoints: ["src/main.js"], outDir: "dist", css: ["src/a.css"] });
  const e = r.entries["src/main.js"];
  assert.deepEqual(htmlTags(r), [
    `<link rel="stylesheet" href="${r.css.url}" />`,
    `<link rel="modulepreload" href="${e.imports[0]}" />`,
    `<script type="module" src="${e.url}"></script>`,
  ]);
  // The written manifest works too (css is a URL string there), and dynamic chunks aren't preloaded.
  const fromManifest = htmlTags(JSON.parse(read(root, "dist/asset-manifest.json")));
  assert.deepEqual(fromManifest, htmlTags(r));
  assert.ok(!fromManifest.join().includes(e.dynamicImports[0]));
  assert.throws(() => htmlTags(r, { entry: "src/other.js" }), (err) => err instanceof BuildError && /no entry "src\/other\.js"/.test(err.message));
});

test("stripImportMap: removes the map (and its line), returns it parsed; pages without one are untouched", () => {
  const page = '<head>\n    <meta charset="utf-8" />\n    <script type="importmap">{"imports":{"@zoijs/core":"/c.js"}}</script>\n    <script type="module" src="/app.js"></script>\n</head>';
  const { html, importMap } = stripImportMap(page);
  assert.equal(html, '<head>\n    <meta charset="utf-8" />\n    <script type="module" src="/app.js"></script>\n</head>');
  assert.deepEqual(importMap, { imports: { "@zoijs/core": "/c.js" } });
  assert.deepEqual(stripImportMap("<p>no map</p>"), { html: "<p>no map</p>", importMap: null });
  // A map mentioned in a comment, or as escaped text in docs, isn't a map.
  const doc = '<!-- <script type="importmap">{}</script> --><pre>&lt;script type="importmap"&gt;</pre>';
  assert.equal(stripImportMap(doc).importMap, null);
  assert.throws(() => stripImportMap('<script type="importmap">{"imports":</script>'), /isn't valid JSON/);
  assert.throws(() => stripImportMap('<script type="importmap">{}</script><script type="importmap">{}</script>'), /2 import maps/);
});

test("inlineScripts / scriptHashes: executable inline scripts get CSP hashes; data blocks and src scripts don't", () => {
  const theme = '(function(){document.documentElement.dataset.theme="light"})();';
  const page = [
    `<script>${theme}</script>`,
    '<script type="module">import "/x.js";</script>',
    '<script type="importmap">{"imports":{}}</script>',
    '<script type="application/ld+json">{"@type":"WebSite"}</script>',
    '<script type="module" src="/assets/main.js"></script>',
    `<script>${theme}</script>`, // duplicates hash once
    "<!-- <script>commented()</script> -->",
  ].join("\n");
  const scripts = inlineScripts(page);
  assert.deepEqual(scripts.map((s) => [s.kind, s.executable]), [["classic", true], ["module", true], ["importmap", true], ["data", false], ["classic", true]]);
  assert.equal(scripts[0].hash, csp(theme));
  assert.deepEqual(scriptHashes(page), [csp(theme), csp('import "/x.js";'), csp('{"imports":{}}')]);
  assert.deepEqual(scriptHashes(stripImportMap(page).html), [csp(theme), csp('import "/x.js";')], "no map, no map hash");
  assert.deepEqual(scriptHashes('<script type="text/javascript">a()</script>'), [csp("a()")]);
});

// ---- import-map verification ------------------------------------------------------------------------

const CDN = "https://cdn.jsdelivr.net/npm/@zoijs/core@1.10.0/src/";
const goodMap = () => ({
  imports: { "@zoijs/core": CDN + "prod.js" },
  integrity: { [CDN + "prod.js"]: sri(CORE_FILES["node_modules/@zoijs/core/src/prod.js"]), [CDN + "index.js"]: sri(CORE_FILES["node_modules/@zoijs/core/src/index.js"]) },
});
const withMap = (root, importMap, extra = {}) => build({ root, entryPoints: ["src/main.js"], outDir: "dist", importMap, ...extra });
async function problems(promise) {
  const err = await promise.then(() => null, (e) => e);
  assert.ok(err instanceof BuildError, String(err));
  return err.problems.join("\n");
}

test("import map: matching versions and integrity pass; its names are the allowed packages", async (t) => {
  const root = project(t, { ...APP_FILES, "package.json": '{"devDependencies":{"@zoijs/core":"1.10.0"}}' }); // not in dependencies
  const r = await withMap(root, goodMap());
  assert.ok(r.entries["src/main.js"]);
});

test("import map: a bundled file that differs from the pinned bytes fails, naming the file and URL", async (t) => {
  const root = project(t);
  writeFileSync(join(root, "node_modules/@zoijs/core/src/prod.js"), 'export const mode = "tampered";\n');
  const p = await problems(withMap(root, goodMap()));
  assert.match(p, /node_modules\/@zoijs\/core\/src\/prod\.js doesn't match the import map's integrity for https:\/\/cdn\.jsdelivr\.net\/npm\/@zoijs\/core@1\.10\.0\/src\/prod\.js/);
  assert.ok(!exists(root, "dist/assets"));
});

test("import map: a different installed version fails with the exact fix", async (t) => {
  const root = project(t, { ...APP_FILES, "node_modules/@zoijs/core/package.json": CORE_FILES["node_modules/@zoijs/core/package.json"].replace("1.10.0", "1.9.0") });
  assert.match(await problems(withMap(root, goodMap())), /importMap pins @zoijs\/core@1\.10\.0, but node_modules has 1\.9\.0 — install exactly 1\.10\.0/);
});

test("import map: a bundled file without an integrity entry, an uninstalled pin, an unversioned URL — each reported", async (t) => {
  const root = project(t);
  const noHash = goodMap();
  delete noHash.integrity[CDN + "prod.js"];
  assert.match(await problems(withMap(root, noHash)), /no integrity hash for https:\/\/cdn\.jsdelivr\.net\/npm\/@zoijs\/core@1\.10\.0\/src\/prod\.js/);
  const extra = goodMap();
  extra.imports["@zoijs/router"] = "https://cdn.jsdelivr.net/npm/@zoijs/router@0.7.0/src/index.js";
  assert.match(await problems(withMap(root, extra)), /importMap pins @zoijs\/router@0\.7\.0, but it isn't installed/);
  assert.match(await problems(withMap(root, { imports: { "@zoijs/core": "/vendor/core.js" } })), /isn't a versioned package URL/);
});

test("import map read from a page with stripImportMap feeds build() directly", async (t) => {
  const root = project(t);
  const page = `<script type="importmap">${JSON.stringify(goodMap())}</script>\n<script type="module" src="/src/main.js"></script>`;
  const { html, importMap } = stripImportMap(page);
  const r = await withMap(root, importMap);
  const out = html.replace('<script type="module" src="/src/main.js"></script>', htmlTags(r).join("\n"));
  assert.doesNotMatch(out, /importmap|\/src\/main\.js/);
  assert.match(out, /<script type="module" src="\/assets\/main-[A-Z0-9]{8}\.js"><\/script>/);
});

test("script end tags as browsers end them: whitespace or / after </script, any case; </scriptx> isn't one", () => {
  const hash = (s) => csp(s);
  assert.deepEqual(scriptHashes("<script>a()</script\t\n bar>"), [hash("a()")]);
  assert.deepEqual(scriptHashes("<SCRIPT>b()</SCRIPT >"), [hash("b()")]);
  assert.deepEqual(scriptHashes("<script>c('</scriptx>')</script/>"), [hash("c('</scriptx>')")]);
  assert.deepEqual(scriptHashes("<script>unterminated()"), [hash("unterminated()")], "a script without an end tag runs to the end of the page");
  assert.deepEqual(scriptHashes('<script data-x="a>b">d()</script>'), [hash("d()")], "> inside a quoted attribute doesn't end the tag");
  assert.deepEqual(scriptHashes("<scripts>no</scripts><script-x>no</script-x>"), []);
  assert.deepEqual(scriptHashes("<!-- <script>x()</script> <!-- --><script>e()</script>"), [hash("e()")]);
  assert.deepEqual(scriptHashes("<!-- unterminated <script>x()</script>"), [], "an unterminated comment hides the rest");
  assert.deepEqual(scriptHashes('<script>"<!--"; f()</script>'), [hash('"<!--"; f()')], "<!-- inside a script isn't a comment");
});

test("the HTML helpers run in linear time on adversarial input (no regex backtracking)", () => {
  for (const unit of ["<!--", "<script", "<script>", "<script>x</script ", "<!-- -->", "'\""]) {
    const big = unit.repeat(100_000);
    const t0 = performance.now();
    inlineScripts(big);
    stripImportMap(big.replace(/importmap/g, ""));
    assert.ok(performance.now() - t0 < 1000, `${JSON.stringify(unit)} × 100,000 took ${Math.round(performance.now() - t0)} ms`);
  }
});
