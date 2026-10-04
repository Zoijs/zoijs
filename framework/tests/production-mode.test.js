// SEC-4 — production consumers don't inherit development mode.
//
//   @zoijs/core (src/index.js)       → realm starts in dev mode (warnings, devtools)
//   @zoijs/core/prod (src/prod.js)   → realm starts in production mode
//   "production" export condition    → bundlers' production builds get prod.js
//
// Dev is ONE setting per realm (CORE-2): the copy that creates the runtime sets the
// initial value; copies that load later join it and never reset it; configure()
// overrides it realm-wide. Security/correctness checks never depend on it.
// Initial state is per realm, so each scenario runs in a fresh child process.

import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PKG = join(here, "..");
const SRC = pathToFileURL(join(PKG, "src") + "/").href;
const SETUP_DOM = pathToFileURL(join(here, "setup-dom.js")).href;
const tmp = mkdtempSync(join(tmpdir(), "zoijs-sec4-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const COPY = (() => { const d = join(tmp, "copy"); cpSync(join(PKG, "src"), d, { recursive: true }); return pathToFileURL(d + "/").href; })();

// Run `body` in a fresh realm. `pre` runs before any Zoijs module loads.
function fresh(body, { dom = false, pre = "", args = [], cwd } = {}) {
  const file = join(tmp, `case-${n++}.mjs`);
  writeFileSync(file, `${pre}
const out = { errors: [], warns: [] };
const _e = console.error, _w = console.warn;
console.error = (...a) => out.errors.push(a.map(String).join(" "));
console.warn = (...a) => out.warns.push(a.map(String).join(" "));
const SRC = ${JSON.stringify(SRC)}, COPY = ${JSON.stringify(COPY)};
const tick = () => new Promise((r) => setTimeout(r));
const env = (base) => import(base + "reactivity/env.js");
${body}
await tick();
process.stdout.write(JSON.stringify(out));`);
  return JSON.parse(execFileSync(process.execPath, [...args, ...(dom ? ["--import", SETUP_DOM] : []), file], { encoding: "utf8", cwd: cwd ?? tmp }));
}

// A mounted counter proves real reactivity in whichever mode is active.
const counter = `
async function counter(Z) {
  const el = document.createElement("div"); const c = Z.createState(0);
  Z.mount(() => Z.html\`<p>\${() => c.get()}</p>\`, el);
  c.set(1); await tick(); return el.textContent;
}`;

// ---- entry points --------------------------------------------------------------------

test("development entry (src/index.js) starts in dev mode and works", () => {
  const out = fresh(`${counter}
    const Z = await import(SRC + "index.js");
    out.dev = (await env(SRC)).isDev(); out.text = await counter(Z);`, { dom: true });
  assert.deepEqual([out.dev, out.text], [true, "1"]);
});

test("production entry (src/prod.js) starts in production mode and works", () => {
  const out = fresh(`${counter}
    const Z = await import(SRC + "prod.js");
    out.dev = (await env(SRC)).isDev(); out.text = await counter(Z);`, { dom: true });
  assert.deepEqual([out.dev, out.text], [false, "1"]);
});

test("the production entry exposes exactly the same API", async () => {
  const dev = await import("../src/index.js");
  const prod = await import("../src/prod.js");
  assert.deepEqual(Object.keys(prod).sort(), Object.keys(dev).sort());
  for (const k of Object.keys(dev)) assert.equal(prod[k], dev[k], k);
});

test("package exports: the production condition and /prod resolve to prod.js; default stays src", () => {
  // self-reference resolution needs the script inside the package
  const file = join(PKG, ".sec4-resolve.mjs");
  writeFileSync(file, `process.stdout.write(JSON.stringify({ root: import.meta.resolve("@zoijs/core"), prod: import.meta.resolve("@zoijs/core/prod") }));`);
  try {
    const run = (args) => JSON.parse(execFileSync(process.execPath, [...args, file], { encoding: "utf8" }));
    const plain = run([]);
    const production = run(["--conditions=production"]);
    assert.match(plain.root, /\/src\/index\.js$/);
    assert.match(production.root, /\/src\/prod\.js$/);
    assert.match(plain.prod, /\/src\/prod\.js$/);
  } finally {
    rmSync(file, { force: true });
  }
});

// ---- explicit override -----------------------------------------------------------------

test("configure() overrides the initial mode on either entry", () => {
  const out = fresh(`
    const P = await import(SRC + "prod.js"); const e = await env(SRC);
    P.configure({ dev: true }); out.a = e.isDev();
    P.configure({ dev: false }); out.b = e.isDev();`);
  assert.deepEqual([out.a, out.b], [true, false]);
  const out2 = fresh(`
    const D = await import(SRC + "index.js"); const e = await env(SRC);
    D.configure({ dev: false }); out.a = e.isDev();`);
  assert.equal(out2.a, false);
});

// ---- shared runtime: first creator decides, later copies join ----------------------------

test("prod copy first, dev copy second: the realm stays in production", () => {
  const out = fresh(`
    await import(SRC + "prod.js");
    await import(COPY + "index.js");   // a second, compatible copy — dev entry
    out.a = (await env(SRC)).isDev(); out.b = (await env(COPY)).isDev();`);
  assert.deepEqual([out.a, out.b], [false, false]);
});

test("dev copy first, prod copy second: loading prod.js does not reset the realm", () => {
  const out = fresh(`
    await import(COPY + "index.js");
    await import(SRC + "prod.js");
    out.a = (await env(SRC)).isDev(); out.b = (await env(COPY)).isDev();`);
  assert.deepEqual([out.a, out.b], [true, true]);
});

test("configure() is realm-wide in both directions across copies", () => {
  const out = fresh(`
    const A = await import(SRC + "prod.js"); const B = await import(COPY + "index.js");
    B.configure({ dev: true });  out.a = (await env(SRC)).isDev();
    A.configure({ dev: false }); out.b = (await env(COPY)).isDev();`);
  assert.deepEqual([out.a, out.b], [true, false]);
});

// ---- devtools -------------------------------------------------------------------------------

test("devtools attach in dev mode and not in production mode (either copy)", () => {
  const out = fresh(`
    const D = await import(SRC + "prod.js");
    const B = await import(COPY + "index.js");
    const seen = [];
    const insp = { onCreate: (_, k) => seen.push(k), onRun() {}, onWrite() {}, onDispose() {} };
    const { attachInspector, inspecting } = await import(SRC + "reactivity/devtools.js");
    const { attachInspector: attachB } = await import(COPY + "reactivity/devtools.js");
    attachInspector(insp); attachB(insp); B.createState(1); D.createState(2);
    out.prod = { attached: inspecting(), seen: seen.length };
    D.configure({ dev: true }); attachB(insp); B.createState(3);
    out.dev = { attached: inspecting(), seen: seen.length };`);
  assert.deepEqual(out.prod, { attached: false, seen: 0 }, "no hook, no graph exposure in production");
  assert.deepEqual(out.dev, { attached: true, seen: 1 });
});

// ---- dev-only warnings ---------------------------------------------------------------------

test("development warnings appear in dev mode and are absent in production", () => {
  const scenario = (entry) => fresh(`
    const Z = await import(SRC + "${entry}");
    const el = document.createElement("div");
    Z.mount(() => Z.html\`<button onclick=\${"alert(1)"}>x</button><a href=\${"javascript:alert(1)"}>y</a>\`, el);
    out.handlerWired = el.querySelector("a").hasAttribute("href");`, { dom: true });
  const dev = scenario("index.js");
  const prod = scenario("prod.js");
  assert.equal(dev.warns.length, 2, "dev: non-function handler + unsafe URL warnings");
  assert.deepEqual(prod.warns, [], "prod: silent");
  assert.equal(dev.handlerWired, false);
  assert.equal(prod.handlerWired, false, "the unsafe URL is still refused in production");
});

test("non-localhost dev warning: once, browser-only, dev-only", () => {
  const at = (host, entry = "index.js") =>
    fresh(`await import(SRC + "${entry}"); await import(COPY + "index.js");`, { pre: host === null ? "" : `globalThis.location = { hostname: ${JSON.stringify(host)} };` });
  const remote = at("app.example.com");
  assert.equal(remote.warns.filter((w) => w.includes("development mode on app.example.com")).length >= 1, true);
  assert.ok(remote.warns.length <= 2, "at most once per loaded copy");
  for (const h of ["localhost", "127.0.0.1", "[::1]", "0.0.0.0", "my-app.localhost", ""]) {
    assert.deepEqual(at(h).warns, [], `no warning on ${JSON.stringify(h)}`);
  }
  assert.deepEqual(at(null).warns, [], "no location (SSR / Node): no warning");
  assert.deepEqual(at("app.example.com", "prod.js").warns, [], "production entry: no warning");
  // An app module that statically imports the core and configures it at top level
  // runs in the same synchronous evaluation, before the deferred check.
  const app = join(tmp, "app-configures.mjs");
  writeFileSync(app, `import { configure } from ${JSON.stringify(SRC + "index.js")};\nconfigure({ dev: false });\n`);
  const configured = fresh(`await import(${JSON.stringify(pathToFileURL(app).href)});`, { pre: `globalThis.location = { hostname: "app.example.com" };` });
  assert.deepEqual(configured.warns, [], "top-level configure({ dev: false }) in the app silences it");
});

// ---- CORE-2 diagnostic stays dev-only, isolation unaffected ---------------------------------

test("ZJS201 is dev-only; incompatible runtimes stay separate in production", () => {
  const seed = `globalThis[Symbol.for("zoijs.runtime@2")] = { protocol: 2 };`;
  const dev = fresh(`await import(SRC + "index.js");`, { pre: seed });
  const prod = fresh(`
    const P = await import(SRC + "prod.js");
    const own = (await import(SRC + "reactivity/runtime.js")).runtime;
    out.separate = own !== globalThis[Symbol.for("zoijs.runtime@2")] && own.protocol === 1;`, { pre: seed });
  assert.equal(dev.errors.filter((e) => e.startsWith("ZJS201")).length, 1);
  assert.deepEqual(prod.errors, []);
  assert.equal(prod.separate, true);
});

// ---- security & correctness are mode-independent --------------------------------------------

test("production mode still enforces SEC-1, SEC-2, CORE-1 and CORE-2", () => {
  const out = fresh(`
    const A = await import(SRC + "prod.js"); const B = await import(COPY + "index.js");
    out.dev = (await env(SRC)).isDev();
    const el = document.createElement("div");
    const forged = JSON.parse('{"__zoijsTemplate":true,"__staticHTML":"<img src=x onerror=alert(1)>","parts":[],"values":[]}');
    A.mount(() => A.html\`<p>\${forged}</p>\`, el);
    out.sec1 = { text: el.textContent, img: !!el.querySelector("img") };
    try { A.html(["<img src=x onerror=alert(1)>"]); out.sec2 = "accepted"; } catch (e) { out.sec2 = e.message.slice(0, 6); }
    const x = B.createState(0), show = A.createState(true); let setups = 0;
    const Child = () => { setups++; x.get(); return A.html\`<i>c</i>\`; };
    const el2 = document.createElement("div");
    A.mount(() => A.html\`<b>\${() => (show.get() ? Child : null)}</b>\`, el2);
    x.set(1); await tick(); out.core1 = setups;
    const s = A.createState(0); let runs = 0, cleaned = 0;
    const el3 = document.createElement("div");
    const un = B.mount(() => { A.onCleanup(() => cleaned++); A.effect(() => { s.get(); runs++; }); return B.html\`<u>\${() => s.get()}</u>\`; }, el3);
    s.set(5); await tick(); out.core2 = { text: el3.textContent, runs }; un(); out.core2.cleaned = cleaned;`, { dom: true });
  assert.equal(out.dev, false);
  assert.deepEqual(out.sec1, { text: "[object Object]", img: false });
  assert.equal(out.sec2, "ZJS010");
  assert.equal(out.core1, 1);
  assert.deepEqual(out.core2, { text: "5", runs: 2, cleaned: 1 });
});

// ---- SSR: no DOM / location access at module init ----------------------------------------------

test("both entries load and run with no DOM (server)", () => {
  for (const entry of ["index.js", "prod.js"]) {
    const out = fresh(`
      const Z = await import(SRC + "${entry}");
      const s = Z.createState(1); let seen; Z.effect(() => { seen = s.get(); }); s.set(2); await tick();
      out.seen = seen; out.dev = (await env(SRC)).isDev();`);
    assert.equal(out.seen, 2, entry);
    assert.equal(out.dev, entry === "index.js");
    assert.deepEqual([out.errors, out.warns], [[], []], entry);
  }
});
