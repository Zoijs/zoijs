// CORE-2 — one shared reactive runtime per JS realm.
//
// Two physically separate copies of @zoijs/core (a CDN copy + a bundled one, a UI
// kit that bundled its own core, …) must form ONE reactive graph and ONE owner
// tree. Copy A is this repo's src (loaded first, statically); copy B is a real
// second copy of src in a temp dir, evaluated as separate modules. Load-order and
// protocol-mismatch scenarios need a fresh realm, so they run in child processes.

import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as A from "../src/index.js";
import { attachInspector } from "../src/reactivity/devtools.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;
const tick = () => new Promise((r) => setTimeout(r));
const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "src");
const SETUP_DOM = pathToFileURL(join(here, "setup-dom.js")).href;
const KEY = Symbol.for("zoijs.runtime@1");

const tmp = mkdtempSync(join(tmpdir(), "zoijs-core2-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
function copyCore(name) {
  const dir = join(tmp, name);
  cpSync(SRC, dir, { recursive: true });
  return pathToFileURL(dir + "/").href;
}
const B_BASE = copyCore("b");
const B = await import(B_BASE + "index.js");
const B_env = await import(B_BASE + "reactivity/env.js");

function root() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

test("copy B is a genuinely separate module instance", () => {
  assert.notEqual(B.createState, A.createState);
  assert.notEqual(B.mount, A.mount);
});

test("both copies use the one runtime registered on globalThis", async () => {
  const rtA = (await import("../src/reactivity/runtime.js")).runtime;
  const rtB = (await import(B_BASE + "reactivity/runtime.js")).runtime;
  assert.equal(rtA, rtB);
  assert.equal(globalThis[KEY], rtA);
  assert.equal(rtA.protocol, 1);
  assert.throws(() => { "use strict"; globalThis[KEY] = {}; }, TypeError, "cannot be replaced");
  assert.equal(globalThis[KEY], rtA);
});

// ---- state ↔ renderer -------------------------------------------------------------

test("A state → B renderer updates the DOM", { skip }, async () => {
  const count = A.createState(0);
  const el = root();
  const unmount = B.mount(() => B.html`<span>${() => count.get()}</span>`, el);
  assert.equal(el.textContent, "0");
  count.set(1); await tick();
  assert.equal(el.textContent, "1");
  count.set(2); await tick();
  assert.equal(el.textContent, "2");
  unmount();
});

test("B state → A renderer updates the DOM", { skip }, async () => {
  const count = B.createState(0);
  const el = root();
  const unmount = A.mount(() => A.html`<span>${() => count.get()}</span>`, el);
  count.set(1); await tick();
  assert.equal(el.textContent, "1");
  count.set(2); await tick();
  assert.equal(el.textContent, "2");
  unmount();
});

// ---- effects, computed, scheduler ----------------------------------------------------

test("an effect from B re-runs on writes to A state", async () => {
  const state = A.createState(0);
  let runs = 0;
  const e = B.effect(() => { state.get(); runs++; });
  state.set(1); await tick();
  state.set(2); await tick();
  assert.equal(runs, 3);
  e.dispose();
});

test("a computed graph crosses copies in both directions", async () => {
  const a = A.createState(1);
  const doubled = B.computed(() => a.get() * 2);
  const plusOne = A.computed(() => doubled.get() + 1);
  let seen;
  const e = B.effect(() => { seen = plusOne.get(); });
  assert.equal(seen, 3);
  a.set(5); await tick();
  assert.equal(seen, 11);
  e.dispose();
});

test("one queue: writes from either copy batch and dedupe into a single flush", async () => {
  const s = A.createState(0);
  const t = B.createState(0);
  const runs = { a: 0, b: 0 };
  const ea = A.effect(() => { s.get(); t.get(); runs.a++; });
  const eb = B.effect(() => { s.get(); t.get(); runs.b++; });
  s.set(1); t.set(1); s.set(2); t.set(2); // four writes, same tick, from both copies
  assert.equal(globalThis[KEY].queue.size, 2, "both effects queued once, in one shared queue");
  await tick();
  assert.deepEqual(runs, { a: 2, b: 2 }, "one re-run each");
  assert.equal(globalThis[KEY].queue.size, 0);
  ea.dispose(); eb.dispose();
});

// ---- ownership & cleanup ----------------------------------------------------------------

test("cleanups and effects created with B are owned by A's tree and disposed exactly once", { skip }, async () => {
  const s = A.createState(0);
  let cleanups = 0;
  let effectCleanups = 0;
  let runs = 0;
  function Widget() {
    B.onCleanup(() => cleanups++);
    B.effect(() => { s.get(); runs++; return () => effectCleanups++; });
    return B.html`<b>${() => s.get()}</b>`;
  }
  const el = root();
  const unmount = A.mount(() => A.html`<div>${Widget()}</div>`, el);
  s.set(1); await tick();
  assert.equal(el.textContent, "1");
  assert.deepEqual([cleanups, runs], [0, 2]);
  unmount();
  assert.equal(cleanups, 1, "B onCleanup ran on A unmount");
  assert.equal(effectCleanups, 2, "B effect torn down (once per re-run + once on dispose)");
  s.set(2); await tick();
  assert.equal(runs, 2, "disposed effect no longer runs");
  unmount();
  assert.equal(cleanups, 1, "never twice");
});

test("a B mount nested in an A component's lifetime is disposed with it", { skip }, async () => {
  const s = B.createState("x");
  const el = root();
  let inner = 0;
  const Inner = () => { A.onCleanup(() => inner++); return A.html`<i>${() => s.get()}</i>`; };
  const unmount = B.mount(() => B.html`<p>${A.html`<span>${Inner()}</span>`}</p>`, el);
  s.set("y"); await tick();
  assert.equal(el.textContent, "y");
  unmount();
  assert.equal(inner, 1);
});

// ---- SEC-1 and CORE-1 still hold across copies ------------------------------------------

test("SEC-1: B templates and each() lists render reactively under A", { skip }, async () => {
  const items = A.createState(["a", "b"]);
  const el = root();
  const unmount = A.mount(() => B.html`<ul>${B.each(() => items.get(), (x) => x, (x) => B.html`<li>${x}</li>`)}</ul>`, el);
  assert.equal(el.textContent, "ab");
  items.set(["b", "c"]); await tick();
  assert.equal(el.textContent, "bc");
  unmount();
});

test("CORE-1: an uncalled component using B state under an A binding is isolated", { skip }, async () => {
  const visible = A.createState(true);
  const x = B.createState(0);
  let setups = 0;
  let cleanups = 0;
  function Child() {
    setups++;
    x.get(); // setup read (B) — must not subscribe the A binding
    const local = B.createState("local");
    B.onCleanup(() => cleanups++);
    return B.html`<em>${() => local.get()} ${() => x.get()}</em>`;
  }
  const el = root();
  const unmount = A.mount(() => A.html`<section>${() => (visible.get() ? Child : null)}</section>`, el);
  const em = el.querySelector("em");
  x.set(1); await tick();
  x.set(2); await tick();
  assert.equal(setups, 1);
  assert.equal(el.querySelector("em"), em);
  assert.equal(em.textContent, "local 2");
  visible.set(false); await tick();
  assert.equal(cleanups, 1);
  visible.set(true); await tick();
  assert.equal(setups, 2);
  unmount();
  assert.equal(cleanups, 2);
});

// ---- configuration & devtools are realm-wide ----------------------------------------------

test("configure() is one realm-wide setting shared by every copy", () => {
  try {
    A.configure({ dev: false });
    assert.equal(B_env.isDev(), false);
    B.configure({ dev: true });
    assert.equal(globalThis[KEY].dev, true);
  } finally {
    A.configure({ dev: true });
  }
});

test("one attached inspector sees nodes created by either copy", () => {
  const created = [];
  const detach = attachInspector({ onCreate: (n, kind) => created.push(kind), onRun() {}, onWrite() {}, onDispose() {} });
  try {
    B.createState(1);
    A.createState(2);
  } finally {
    detach();
  }
  assert.deepEqual(created, ["state", "state"]);
});

// ---- no leaks through the long-lived runtime --------------------------------------------------

test("lifecycle churn across copies leaves nothing behind in the runtime", { skip }, async () => {
  const s = A.createState(0);
  let runs = 0;
  for (let i = 0; i < 200; i++) {
    const el = root();
    const [M, H] = i % 2 ? [A, B] : [B, A];
    const unmount = M.mount(() => H.html`<p>${() => { runs++; return s.get(); }}</p>`, el);
    unmount();
    el.remove();
  }
  const before = runs;
  s.set(1); await tick();
  assert.equal(runs, before, "no binding from an unmounted root is still subscribed");
  const rt = globalThis[KEY];
  assert.equal(rt.observer, null);
  assert.equal(rt.owner, null);
  assert.equal(rt.queue.size, 0);
});

// ---- fresh realms: load order + protocol diagnostics ----------------------------------------

function runFresh(body, { dom = false } = {}) {
  const file = join(tmp, `case-${Math.random().toString(36).slice(2)}.mjs`);
  const C = copyCore("c-" + Math.random().toString(36).slice(2));
  writeFileSync(
    file,
    `const out = { errors: [], warns: [] };
console.error = (...a) => out.errors.push(a.join(" "));
console.warn = (...a) => out.warns.push(a.join(" "));
const SRC_A = ${JSON.stringify(pathToFileURL(SRC + "/").href)}, SRC_C = ${JSON.stringify(C)};
const tick = () => new Promise((r) => setTimeout(r));
${body}
process.stdout.write(JSON.stringify(out));`
  );
  const args = dom ? ["--import", SETUP_DOM, file] : [file];
  return JSON.parse(execFileSync(process.execPath, args, { encoding: "utf8" }));
}

test("load order B-then-A behaves the same as A-then-B", { skip }, () => {
  const out = runFresh(
    `const B = await import(SRC_C + "index.js");   // the other copy initializes the runtime
     const A = await import(SRC_A + "index.js");
     const r = (M, H, S) => { const el = document.createElement("div"); const c = S.createState(0);
       M.mount(() => H.html\`<span>\${() => c.get()}</span>\`, el); return { el, c }; };
     const x = r(A, A, B), y = r(B, B, A);
     x.c.set(1); y.c.set(2); await tick();
     out.result = [x.el.textContent, y.el.textContent];`,
    { dom: true }
  );
  assert.deepEqual(out.result, ["1", "2"]);
  assert.deepEqual(out.errors, [], "compatible duplicates load silently");
  assert.deepEqual(out.warns, []);
});

test("an incompatible runtime protocol is diagnosed and never shared", () => {
  const out = runFresh(
    `const foreign = { protocol: 2 };
     globalThis[Symbol.for("zoijs.runtime@2")] = foreign;   // e.g. a future @zoijs/core 2.x
     const A = await import(SRC_A + "index.js");
     const s = A.createState(0); let runs = 0;
     A.effect(() => { s.get(); runs++; }); s.set(1); await tick();
     out.runs = runs;
     out.foreignUntouched = Object.keys(foreign).join() === "protocol";`
  );
  assert.equal(out.errors.length, 1);
  assert.match(out.errors[0], /ZJS201: incompatible @zoijs\/core copies loaded \(runtime protocol 2 vs 1\)/);
  assert.equal(out.runs, 2, "this copy still works on its own runtime");
  assert.equal(out.foreignUntouched, true);
});

test("an unrecognized object under the protocol-1 key is not adopted or overwritten", () => {
  const out = runFresh(
    `const odd = { protocol: 99 };
     globalThis[Symbol.for("zoijs.runtime@1")] = odd;
     const A = await import(SRC_A + "index.js");
     const s = A.createState(0); let runs = 0;
     A.effect(() => { s.get(); runs++; }); s.set(1); await tick();
     out.runs = runs;
     out.kept = globalThis[Symbol.for("zoijs.runtime@1")] === odd && Object.keys(odd).join() === "protocol";`
  );
  assert.equal(out.errors.length, 1);
  assert.match(out.errors[0], /ZJS201.*protocol 99 vs 1/);
  assert.equal(out.runs, 2);
  assert.equal(out.kept, true);
});

test("the diagnostic respects production mode already set on the realm", () => {
  const out = runFresh(
    `const A = await import(SRC_A + "index.js");
     A.configure({ dev: false });
     globalThis[Symbol.for("zoijs.runtime@2")] = { protocol: 2 };
     await import(SRC_C + "index.js");   // loads after: shares the protocol-1 runtime (dev:false)`
  );
  assert.deepEqual(out.errors, []);
});
