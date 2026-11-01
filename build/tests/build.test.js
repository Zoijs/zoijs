// build(): resolution, splitting, hashing, CSS, manifest, integrity, maps, determinism and the
// fail-closed checks — each on a small fixture project (tests/helpers.js), no network.

import test from "node:test";
import assert from "node:assert/strict";
import { join, sep, dirname, relative, resolve } from "node:path";
import { mkdirSync, writeFileSync, readdirSync, readFileSync, mkdtempSync, symlinkSync, rmSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { build, BuildError, IMMUTABLE } from "../src/index.js";
import { project, read, exists, list, sri, snapshot, APP_FILES } from "./helpers.js";

const opts = (root, extra = {}) => ({ root, entryPoints: ["src/main.js"], outDir: "dist", ...extra });
const js = (root) => list(join(root, "dist/assets")).filter((f) => f.endsWith(".js"));
const allJs = (root) => js(root).map((f) => read(root, `dist/assets/${f}`)).join("\n");

/** Expect a BuildError whose problems include every pattern. */
async function rejects(promise, ...patterns) {
  const err = await promise.then(() => null, (e) => e);
  assert.ok(err instanceof BuildError, `expected a BuildError, got ${err && err.stack}`);
  for (const p of patterns) assert.ok(err.problems.some((x) => p.test(x)), `no problem matches ${p}:\n  ${err.problems.join("\n  ")}`);
  return err;
}

test("Zoijs resolves to its production entry (the 'production' export condition)", async (t) => {
  const root = project(t);
  await build(opts(root));
  assert.match(allJs(root), /core-production-entry/);
  assert.doesNotMatch(allJs(root), /core-development-entry/);
});

test("dynamic import() becomes its own chunk; shared code is split out; the manifest records both", async (t) => {
  const root = project(t);
  const r = await build(opts(root));
  const main = r.entries["src/main.js"];
  assert.match(main.url, /^\/assets\/main-[A-Z0-9]{8}\.js$/);
  assert.equal(main.dynamicImports.length, 1, "the page is loaded on demand");
  assert.equal(main.imports.length, 1, "the module shared with the page is a static chunk");
  assert.match(main.imports[0], /^\/assets\/chunk-[A-Z0-9]{8}\.js$/);
  const page = read(root, "dist" + main.dynamicImports[0]);
  assert.match(page, /lazy-page/);
  assert.doesNotMatch(read(root, "dist" + main.url), /lazy-page/, "the lazy page isn't in the entry");
  assert.equal(js(root).length, 3);
  // The returned metafile names the files where they are now, for reports.
  for (const [out, o] of Object.entries(r.metafile.outputs)) {
    assert.ok(exists(root, out), out);
    for (const i of o.imports) assert.ok(exists(root, i.path), i.path);
  }
  assert.ok(Object.values(r.metafile.outputs).some((o) => o.entryPoint === "src/page.js"), "the lazy page is findable by its source");
});

test("file names are content hashes: same source, same name; changed source, new name", async (t) => {
  const a = project(t);
  const b = project(t, { ...APP_FILES, "src/main.js": APP_FILES["src/main.js"] + "console.log(1);\n" });
  const [ra, rb] = [await build(opts(a)), await build(opts(b))];
  assert.notEqual(ra.entries["src/main.js"].url, rb.entries["src/main.js"].url);
  assert.equal(ra.entries["src/main.js"].dynamicImports[0], rb.entries["src/main.js"].dynamicImports[0], "an unchanged chunk keeps its name");
});

test("builds are reproducible: two builds of the same tree are byte-identical", async (t) => {
  const root = project(t);
  await build(opts(root, { css: ["src/a.css", "src/b.css"] }));
  const first = snapshot(join(root, "dist"));
  await build(opts(root, { css: ["src/a.css", "src/b.css"] }));
  assert.deepEqual(snapshot(join(root, "dist")), first);
  // …and independent of where the project lives (no absolute paths in any output).
  const other = project(t);
  await build(opts(other, { css: ["src/a.css", "src/b.css"] }));
  assert.deepEqual(snapshot(join(other, "dist")), first);
});

test("CSS: the files in order, minified, in one content-hashed stylesheet", async (t) => {
  const root = project(t);
  const r = await build(opts(root, { css: ["src/a.css", "src/b.css"], cssName: "site" }));
  assert.match(r.css.url, /^\/assets\/site-[0-9a-f]{10}\.css$/);
  const css = read(root, "dist" + r.css.url);
  assert.ok(css.indexOf("color") < css.indexOf("margin"), "cascade order kept");
  assert.doesNotMatch(css, /comment|\n {2}/, "minified");
  await rejects(build(opts(project(t), { css: ["src/missing.css"] })), /css: src\/missing\.css doesn't exist/);
  await rejects(build(opts(project(t, { ...APP_FILES, "src/a.css": "body { color: red" }), { css: ["src/a.css"] })), /^css \(src\/a\.css, concatenated\): line \d+: /);
});

test("manifest: entries, every file with size and sha384 integrity, cache and CSP guidance — sorted, undated", async (t) => {
  const root = project(t);
  const r = await build(opts(root, { css: ["src/a.css"] }));
  const m = JSON.parse(read(root, "dist/asset-manifest.json"));
  assert.deepEqual(Object.keys(m), ["version", "buildId", "publicPath", "entries", "css", "files", "cache", "csp"]);
  assert.match(m.buildId, /^[0-9a-f]{16}$/);
  assert.equal(m.version, 1);
  assert.deepEqual(m.entries, r.entries);
  assert.equal(m.css, r.css.url);
  assert.deepEqual(m.files.map((f) => f.url), [...m.files.map((f) => f.url)].sort());
  for (const f of m.files) {
    const text = read(root, "dist" + f.url);
    assert.equal(f.integrity, sri(text), f.url);
    assert.equal(f.bytes, Buffer.byteLength(text), f.url);
  }
  assert.deepEqual(m.cache, [{ path: "/assets/*", cacheControl: IMMUTABLE }]);
  assert.equal(IMMUTABLE, "public, max-age=31536000, immutable");
  assert.deepEqual(m.csp, { "script-src": ["'self'"], "style-src": ["'self'"] });
  assert.doesNotMatch(JSON.stringify(m), /\d{4}-\d\d-\d\dT|zoijs-build-/, "no dates, no machine paths");
  // Options: a different assets dir / public path / manifest name, or no manifest at all.
  const custom = project(t);
  const rc = await build(opts(custom, { assetsDir: "static/js", publicPath: "https://cdn.example.com/app/", manifest: "build.json" }));
  assert.match(rc.entries["src/main.js"].url, /^https:\/\/cdn\.example\.com\/app\/main-/);
  assert.ok(exists(custom, "dist/static/js") && exists(custom, "dist/build.json"));
  const none = project(t);
  await build(opts(none, { manifest: false }));
  assert.ok(!exists(none, "dist/asset-manifest.json"));
});

test("source maps: none by default; with sourceMapsDir they go there (with sources), never into outDir", async (t) => {
  const root = project(t);
  await build(opts(root));
  assert.deepEqual(list(join(root, "dist/assets")).filter((f) => f.endsWith(".map")), []);
  assert.doesNotMatch(allJs(root), /sourceMappingURL/);

  await build(opts(root, { sourceMapsDir: "maps" }));
  assert.deepEqual(list(join(root, "dist/assets")).filter((f) => f.endsWith(".map")), []);
  assert.doesNotMatch(allJs(root), /sourceMappingURL/);
  const maps = list(join(root, "maps/assets"));
  assert.equal(maps.length, 3);
  const map = JSON.parse(read(root, `maps/assets/${maps.find((m) => m.startsWith("main-"))}`));
  assert.ok(map.sourcesContent.some((s) => s.includes("loadPage")), "private maps carry the sources");

  await rejects(build(opts(root, { sourceMapsDir: "dist/maps" })), /sourceMapsDir: .* must be outside outDir/);
  await rejects(build(opts(root, { sourceMapsDir: "." })), /must be outside outDir/);
});

test("invalid options are reported together, before anything is written", async (t) => {
  const root = project(t);
  const err = await rejects(
    build({ root, entryPoints: [], outDir: "" }),
    /entryPoints: give at least one entry module/,
    /outDir: required/
  );
  assert.ok(err.problems.length >= 2);
  await rejects(build(opts(root, { entryPoints: ["src/nope.js"] })), /entryPoints: src\/nope\.js doesn't exist/);
  await rejects(build(opts(root, { assetsDir: "../escape" })), /assetsDir: .* must be a subdirectory of outDir/);
  await rejects(build(opts(root, { assetsDir: "." })), /must be a subdirectory/);
  await rejects(build(opts(root, { publicPath: "/assets" })), /publicPath: .* must end with "\/"/);
  await rejects(build(opts(root, { cssName: "../x" })), /cssName/);
  const noPkg = project(t, { "src/main.js": "export {};\n" });
  await rejects(build(opts(noPkg)), /allowedPackages: no package\.json/);
  assert.ok(!exists(root, "dist"), "nothing written");
});

test("a missing dependency names the package and the fix", async (t) => {
  const root = project(t, { ...APP_FILES, "package.json": JSON.stringify({ dependencies: { "@zoijs/core": "1", "left-pad": "1" } }), "src/main.js": 'import "left-pad";\n' });
  await rejects(build(opts(root)), /src\/main\.js:1:\d+: Could not resolve "left-pad" — is "left-pad" installed\? Run npm install\./);
  const rel = project(t, { ...APP_FILES, "src/main.js": 'import "./missing";\n' });
  await rejects(build(opts(rel)), /Could not resolve "\.\/missing" — check the path/);
});

test("only allowed packages are bundled: dependencies by default, or allowedPackages", async (t) => {
  const files = { ...APP_FILES, "node_modules/devtool/package.json": '{"name":"devtool","version":"1.0.0","main":"i.js"}', "node_modules/devtool/i.js": "export default 1;\n", "src/main.js": 'import d from "devtool";\nconsole.log(d);\n' };
  await rejects(build(opts(project(t, files))), /"devtool" isn't an allowed package — add it to package\.json dependencies/);
  await build(opts(project(t, files), { allowedPackages: ["devtool"] })); // explicitly allowed: fine
});

test("nothing may stay external: URL imports are rejected", async (t) => {
  const root = project(t, { ...APP_FILES, "src/main.js": 'export const lib = () => import("https://cdn.example.com/lib.js");\n' });
  await rejects(build(opts(root)), /imports "https:\/\/cdn\.example\.com\/lib\.js" at run time — a bundle must be self-contained/);
});

test("a computed import() is rejected (it would 404), unless the bundle only contains it as text", async (t) => {
  const code = 'export const go = (name) => import(name);\n';
  await rejects(build(opts(project(t, { ...APP_FILES, "src/main.js": code }))), /a computed import\(\) can't be bundled/);
  await build(opts(project(t, { ...APP_FILES, "src/main.js": code }), { allowComputedImports: true }));
  await rejects(build(opts(project(t, { ...APP_FILES, "src/main.js": "export const go = (n) => import(`${n}`);\n" }))), /a computed import\(\) can't be bundled/);
  // A fixed prefix is fine: esbuild bundles every matching file (a glob) as its own chunk.
  const globbed = project(t, { ...APP_FILES, "src/pages/a.js": "export default 1;\n", "src/pages/b.js": "export default 2;\n", "src/main.js": "export const page = (n) => import(`./pages/${n}.js`);\n" });
  const g = await build(opts(globbed));
  assert.equal(g.entries["src/main.js"].dynamicImports.length, 2);
  // Prose about import() (as in docs) isn't a computed import.
  await build(opts(project(t, { ...APP_FILES, "src/main.js": 'export const s = "dynamic import()s split code";\n' })));
});

test("eval and new Function are rejected (strict CSP)", async (t) => {
  await rejects(build(opts(project(t, { ...APP_FILES, "src/main.js": 'eval("1");\n' }))), /src\/main\.js:1:\d+: uses eval/);
  await rejects(build(opts(project(t, { ...APP_FILES, "src/main.js": 'export const f = new Function("return 1");\n' }))), /new Function is eval/);
});

test("credentials: bundled key files and token-shaped strings fail the build", async (t) => {
  await rejects(
    build(opts(project(t, { ...APP_FILES, "src/key.js": 'export const k = "-----BEGIN RSA PRIVATE KEY-----";\n', "src/main.js": 'import { k } from "./key.js";\nconsole.log(k);\n' }))),
    /looks like a private key\. Never ship credentials/
  );
  await rejects(
    build(opts(project(t, { ...APP_FILES, "src/main.js": 'console.log("ghp_' + "a".repeat(36) + '");\n' }))),
    /looks like a GitHub token/
  );
  await rejects(
    build(opts(project(t, { ...APP_FILES, ".env": "SECRET=1\n", "src/main.js": 'import env from "../.env";\nconsole.log(env);\n' }))),
    /\.env is imported — it looks like a credentials file/
  );
});

test("a failed build changes nothing live: the last good assets and manifest stay exactly as they were", async (t) => {
  const root = project(t);
  await build(opts(root));
  const before = snapshot(join(root, "dist"));
  writeFileSync(join(root, "src/main.js"), "this is ( not javascript");
  await rejects(build(opts(root)), /src\/main\.js:1:\d+: /);
  assert.deepEqual(snapshot(join(root, "dist")), before, "previous build untouched, no .staging-* left");
  // A failure in the post-build checks (after esbuild wrote files) leaves it untouched too.
  writeFileSync(join(root, "src/main.js"), 'export const f = new Function("x");\n');
  await rejects(build(opts(root)), /new Function/);
  assert.deepEqual(snapshot(join(root, "dist")), before);
  // With no previous build, a failure leaves nothing that looks like one.
  const fresh = project(t, { ...APP_FILES, "src/main.js": "nope (" });
  await rejects(build(opts(fresh)), /src\/main\.js/);
  assert.deepEqual(readdirSync(join(fresh, "dist")), []);
});

test("other files in outDir are left alone; a rebuild replaces only the assets", async (t) => {
  const root = project(t);
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist/index.html"), "<p>app</p>");
  await build(opts(root));
  writeFileSync(join(root, "src/main.js"), APP_FILES["src/main.js"] + "console.log(2);\n");
  await build(opts(root));
  assert.equal(read(root, "dist/index.html"), "<p>app</p>");
  assert.equal(js(root).length, 3, "the old entry is gone, not accumulated");
});

test("missing esbuild: the error says how to install the peer dependency", async (t) => {
  // The package's source copied somewhere esbuild can't be resolved from, as in an app that
  // installed @zoijs/build but not its peer.
  const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  const isolated = project(t, { "src/index.js": src("index.js"), "src/promote.js": src("promote.js"), "package.json": '{"type":"module"}' });
  const { build: isolatedBuild, BuildError: IsolatedError } = await import(pathToFileURL(join(isolated, "src/index.js")).href);
  const root = project(t);
  const err = await isolatedBuild(opts(root)).then(() => null, (e) => e);
  assert.ok(err instanceof IsolatedError);
  assert.match(err.problems[0], /esbuild isn't installed\. It's a peer dependency: npm install --save-dev --save-exact esbuild@0\.28/);
  assert.ok(!exists(root, "dist"));
});

test("an esbuild failure without structured messages is still reported, and cleaned up", async (t) => {
  const root = project(t);
  const broken = { build: () => Promise.reject(new Error("service stopped")) };
  await rejects(build(opts(root, { esbuild: broken })), /service stopped/);
  assert.ok(!exists(root, "dist/assets"));
});

// Paths are joined with the platform separator and URLs with "/": on Windows the options below use
// "\\" (path.sep), on Linux/macOS "/" — either way every URL uses "/". (CI runs Linux.)
test("paths: nested assetsDir and entry paths given with the platform separator become / URLs", async (t) => {
  const root = project(t);
  const r = await build(opts(root, { entryPoints: [["src", "main.js"].join(sep)], assetsDir: ["static", "js"].join(sep) }));
  const [entry] = Object.values(r.entries);
  assert.match(entry.url, /^\/static\/js\/main-[A-Z0-9]{8}\.js$/);
  assert.ok(!entry.url.includes("\\"));
  assert.equal(r.publicPath, "/static/js/");
});


test("a project reached through a symlink (as macOS's /var → /private/var) builds and reports real paths", async (t) => {
  const real = project(t);
  const link = join(mkdtempSync(join(tmpdir(), "zoijs-build-link-")), "app");
  symlinkSync(real, link, "dir");
  t.after(() => rmSync(dirname(link), { recursive: true, force: true }));
  const r = await build({ root: link, entryPoints: ["src/main.js"], outDir: "dist", sourceMapsDir: "maps" });
  for (const [out, o] of Object.entries(r.metafile.outputs)) {
    assert.ok(exists(real, relative(realpathSync(real), resolve(realpathSync(real), out))), `metafile output ${out} exists`);
    for (const i of o.imports) assert.ok(existsSync(resolve(realpathSync(real), i.path)), i.path);
  }
  assert.ok(Object.keys(r.metafile.outputs).every((o) => !o.includes(".staging-")), "no staging paths left in the metafile");
  assert.equal(list(join(real, "maps/assets")).length, 3);
});
