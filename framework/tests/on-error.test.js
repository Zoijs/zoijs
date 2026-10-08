// CORE-3 — configure({ onError }) observes every error Zoijs catches or contains.
//
// One report per failure, at the layer that contains it, with the ORIGINAL thrown
// value and a small { kind, component? } info object. Errors that escape today
// keep escaping. Works in production mode, and the hook is realm-wide (shared by
// every compatible copy of the core, CORE-2).

import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { html, mount, createState, computed, effect, boundary, configure, onCleanup } from "../src/index.js";
import { isDev } from "../src/reactivity/env.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;
const tick = () => new Promise((r) => setTimeout(r));
const KEY = Symbol.for("zoijs.runtime@1");

// Install a recording hook, silence (and capture) console.error, always restore.
async function withHook(fn, { dev = true } = {}) {
  const calls = [];
  const logs = [];
  const origError = console.error;
  console.error = (...a) => logs.push(a);
  configure({ dev, onError: (error, info) => calls.push({ error, info }) });
  try {
    await fn(calls, logs);
  } finally {
    configure({ dev: true, onError: null });
    console.error = origError;
  }
}
const root = () => document.body.appendChild(document.createElement("div"));

// ---- configure semantics --------------------------------------------------------------

test("configure: install, replace, partial updates keep it, null clears it", () => {
  const a = () => {};
  const b = () => {};
  try {
    configure({ onError: a });
    assert.equal(globalThis[KEY].onError, a);
    configure({ dev: false });
    assert.equal(globalThis[KEY].onError, a, "a dev-only update keeps the hook");
    configure({ onError: undefined });
    assert.equal(globalThis[KEY].onError, a, "undefined / omitted = unchanged");
    configure({ onError: "nope" });
    assert.equal(globalThis[KEY].onError, a, "non-functions are ignored");
    configure({ onError: b });
    assert.equal(globalThis[KEY].onError, b, "replace");
    assert.equal(isDev(), false, "setting onError did not touch dev");
    configure({ onError: null });
    assert.equal(globalThis[KEY].onError, null, "null clears");
  } finally {
    configure({ dev: true, onError: null });
  }
});

// ---- binding ---------------------------------------------------------------------------

test("binding: a throwing binding reports once, original value, other bindings keep working", { skip }, () =>
  withHook(async (calls, logs) => {
    const err = new TypeError("bad binding");
    const ok = createState("ok");
    const el = root();
    mount(() => html`<p>${() => { throw err; }}</p><b>${() => ok.get()}</b>`, el);
    ok.set("still ok");
    await tick();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].error, err, "identity preserved (not wrapped)");
    assert.deepEqual(calls[0].info, { kind: "binding" });
    assert.equal(el.querySelector("b").textContent, "still ok");
    assert.ok(logs.length >= 1, "existing console.error is kept");
    el.remove();
  }));

test("binding: a thrown non-Error value is passed through as-is", { skip }, () =>
  withHook(async (calls) => {
    const el = root();
    mount(() => html`<p>${() => { throw "plain string"; }}</p>`, el);
    assert.equal(calls[0].error, "plain string");
    el.remove();
  }));

// ---- effect / computed -----------------------------------------------------------------

test("effect: each failing run reports once with kind effect", () =>
  withHook(async (calls) => {
    const s = createState(0);
    const errs = [];
    const e = effect(() => { const v = s.get(); const x = new Error("run " + v); errs.push(x); throw x; });
    s.set(1);
    await tick();
    assert.deepEqual(calls.map((c) => c.info.kind), ["effect", "effect"]);
    assert.deepEqual(calls.map((c) => c.error), errs);
    e.dispose();
  }));

test("computed: a throwing computed reports once as computed, not again by its reader", () =>
  withHook(async (calls) => {
    const err = new Error("bad derive");
    const c = computed(() => { throw err; });
    let seen = "unset";
    const e = effect(() => { seen = c.get(); });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { error: err, info: { kind: "computed" } });
    assert.equal(seen, undefined, "the reader kept running (computed keeps its previous value)");
    e.dispose();
  }));

// ---- cleanup ---------------------------------------------------------------------------

test("cleanup: a throwing cleanup reports; the others still run, in order", { skip }, () =>
  withHook(async (calls) => {
    const order = [];
    const errA = new Error("cleanup A");
    const errC = new Error("effect cleanup");
    const el = root();
    const unmount = mount(() => {
      onCleanup(() => order.push("B"));
      onCleanup(() => { order.push("A"); throw errA; });
      effect(() => () => { order.push("C"); throw errC; });
      return html`<i>x</i>`;
    }, el);
    unmount();
    assert.deepEqual(order, ["C", "A", "B"], "same order as before; B still ran after A threw");
    assert.deepEqual(calls.map((c) => [c.error, c.info.kind]), [[errC, "cleanup"], [errA, "cleanup"]]);
    el.remove();
  }));

// ---- boundary ----------------------------------------------------------------------------

test("boundary: fallback renders and the error is reported once, with the component name", { skip }, () =>
  withHook(async (calls) => {
    const err = new Error("child failed");
    function ProfileCard() { throw err; }
    const el = root();
    mount(() => html`<div>${boundary(ProfileCard, (e) => html`<p class="fb">${e.message}</p>`)}</div>`, el);
    assert.equal(el.querySelector(".fb").textContent, "child failed");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { error: err, info: { kind: "boundary", component: "ProfileCard" } });
    el.remove();
  }));

test("boundary inside a reactive binding: still exactly one report (the boundary's)", { skip }, () =>
  withHook(async (calls) => {
    const show = createState(true);
    const el = root();
    mount(() => html`<div>${() => (show.get() ? boundary(() => { throw new Error("x"); }, "fallback") : null)}</div>`, el);
    assert.equal(el.textContent, "fallback");
    assert.deepEqual(calls.map((c) => c.info), [{ kind: "boundary" }], "anonymous child: no component field");
    el.remove();
  }));

test("an effect failing inside a boundary's child is reported by the effect, not the boundary", { skip }, () =>
  withHook(async (calls) => {
    const el = root();
    function Child() { effect(() => { throw new Error("async-ish"); }); return html`<b class="ok">rendered</b>`; }
    mount(() => html`<div>${boundary(Child, "fallback")}</div>`, el);
    assert.ok(el.querySelector(".ok"), "the child rendered (the boundary did not catch)");
    assert.deepEqual(calls.map((c) => c.info.kind), ["effect"]);
    el.remove();
  }));

// ---- hook failure ------------------------------------------------------------------------

test("a throwing hook is logged, never re-invoked recursively, and keeps working afterwards", () =>
  withHook(async (_calls, logs) => {
    let invocations = 0;
    const original = new Error("original");
    configure({ onError: () => { invocations++; throw new Error("monitoring failed"); } });
    const e1 = effect(() => { throw original; });
    assert.equal(invocations, 1);
    assert.ok(logs.some((l) => String(l[0]).includes("onError hook threw")), "hook failure logged");
    assert.ok(logs.some((l) => l.includes(original)), "original error still logged");
    const e2 = effect(() => { throw new Error("later"); });
    assert.equal(invocations, 2, "a later failure is still reported");
    assert.equal(globalThis[KEY].reporting, false);
    e1.dispose(); e2.dispose();
  }));

test("an error raised while the hook runs is logged, not reported recursively", { skip }, () =>
  withHook(async (_calls, logs) => {
    let invocations = 0;
    const el = root();
    const unmount = mount(() => { onCleanup(() => { throw new Error("nested cleanup"); }); return html`<i></i>`; }, el);
    configure({ onError: () => { invocations++; unmount(); } }); // the hook triggers another contained error
    const e = effect(() => { throw new Error("first"); });
    assert.equal(invocations, 1);
    assert.ok(logs.some((l) => String(l[0]).includes("inside onError")));
    e.dispose();
    el.remove();
  }));

// ---- what is NOT reported: errors that escape keep escaping ------------------------------------

test("errors that escape today still escape and are not reported", { skip }, () =>
  withHook(async (calls) => {
    const el = root();
    assert.throws(() => mount(() => { throw new Error("setup outside any boundary"); }, el), /setup outside/);
    assert.throws(() => html(["<img>"]), /ZJS010/);
    assert.throws(() => boundary(() => { throw new Error("child"); }, () => { throw new Error("fallback too"); }), /fallback too/);
    assert.deepEqual(calls.map((c) => c.info.kind), ["boundary"], "only the contained child error");
    el.remove();
  }));

// ---- production mode -----------------------------------------------------------------------------

test("production mode (dev=false): every kind still reaches the hook; dev console stays quiet", { skip }, () =>
  withHook(async (calls, logs) => {
    assert.equal(isDev(), false);
    const el = root();
    const un = mount(() => {
      onCleanup(() => { throw new Error("c"); });
      effect(() => { throw new Error("e"); });
      return html`<p>${() => { throw new Error("b"); }}</p>${boundary(() => { throw new Error("x"); }, "fb")}`;
    }, el);
    un();
    assert.deepEqual(calls.map((c) => c.info.kind).sort(), ["binding", "boundary", "cleanup", "effect"]);
    assert.ok(!logs.some((l) => String(l[0]).includes("boundary caught")), "dev-only boundary log stays off");
    el.remove();
  }, { dev: false }));

test("production entry (src/prod.js): onError works with dev off", () => {
  const dir = mkdtempSync(join(tmpdir(), "zoijs-core3-"));
  try {
    const file = join(dir, "prod-case.mjs");
    const SRC = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "src") + "/").href;
    writeFileSync(file, `
      console.error = () => {};
      const Z = await import(${JSON.stringify(SRC + "prod.js")});
      const { isDev } = await import(${JSON.stringify(SRC + "reactivity/env.js")});
      const got = []; const err = new Error("prod failure");
      Z.configure({ onError: (e, i) => got.push([e === err, i.kind]) });
      Z.effect(() => { throw err; });
      process.stdout.write(JSON.stringify({ dev: isDev(), got }));`);
    const out = JSON.parse(execFileSync(process.execPath, [file], { encoding: "utf8" }));
    assert.deepEqual(out, { dev: false, got: [[true, "effect"]] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- cross-copy (CORE-2): one hook per realm ---------------------------------------------------

test("a hook configured by one copy receives errors contained by another, both ways; last configure wins", { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zoijs-core3-copy-"));
  cpSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src"), dir, { recursive: true });
  const B = await import(pathToFileURL(join(dir, "index.js")).href);
  const origError = console.error;
  console.error = () => {};
  try {
    const gotA = [];
    configure({ onError: (e, i) => gotA.push(i.kind) }); // copy A configures
    const el = root();
    B.mount(() => B.html`<p>${() => { throw new Error("from B"); }}</p>`, el); // copy B contains
    assert.deepEqual(gotA, ["binding"]);

    const gotB = [];
    B.configure({ onError: (e, i) => gotB.push(i.kind) }); // copy B configures — replaces A's
    const e = effect(() => { throw new Error("from A"); }); // copy A contains
    assert.deepEqual(gotB, ["effect"]);
    assert.deepEqual(gotA, ["binding"], "last configure wins (realm-wide)");
    e.dispose();
    el.remove();
  } finally {
    configure({ onError: null });
    console.error = origError;
    rmSync(dir, { recursive: true, force: true });
  }
});
