// Tests for the public effect() — a side effect that re-runs when its reads
// change, with a returned cleanup (same convention as a ref) and owner-scoped
// auto-disposal. (RFC 0003, core 1.2.0.)

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../src/reactivity/state.js";
import { computed } from "../src/reactivity/computed.js";
import { effect } from "../src/reactivity/effect.js";
import { flush } from "../src/reactivity/scheduler.js";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";

test("runs once immediately", () => {
  let runs = 0;
  effect(() => runs++);
  assert.equal(runs, 1);
});

test("re-runs when a state it reads changes", () => {
  const s = createState(0);
  let seen;
  effect(() => (seen = s.get()));
  assert.equal(seen, 0);
  s.set(1);
  flush();
  assert.equal(seen, 1);
});

test("re-runs when a computed it reads changes", () => {
  const s = createState(1);
  const doubled = computed(() => s.get() * 2);
  let seen;
  effect(() => (seen = doubled.get()));
  assert.equal(seen, 2);
  s.set(5);
  flush();
  assert.equal(seen, 10);
});

test("batches multiple changes into one re-run per flush", () => {
  const s = createState(0);
  let runs = 0;
  effect(() => (runs++, s.get()));
  assert.equal(runs, 1);
  s.set(1);
  s.set(2);
  s.set(3);
  flush();
  assert.equal(runs, 2); // one initial + one batched re-run
});

test("does not re-run when a write is value-equal (equality-gated)", () => {
  const s = createState(7);
  let runs = 0;
  effect(() => (runs++, s.get()));
  assert.equal(runs, 1);
  s.set(7); // same value
  flush();
  assert.equal(runs, 1);
});

test("tracks dependencies automatically — drops stale conditional deps", () => {
  const useX = createState(true);
  const x = createState(1);
  const y = createState(2);
  let runs = 0;
  effect(() => (runs++, useX.get() ? x.get() : y.get()));
  assert.equal(runs, 1);

  useX.set(false); // now depends on y, not x
  flush();
  assert.equal(runs, 2);

  x.set(99); // x is no longer a dependency
  flush();
  assert.equal(runs, 2); // not re-run
});

test("the returned cleanup runs before the next run", () => {
  const s = createState(0);
  const log = [];
  effect(() => {
    const v = s.get();
    log.push("run" + v);
    return () => log.push("cleanup" + v);
  });
  assert.deepEqual(log, ["run0"]);
  s.set(1);
  flush();
  assert.deepEqual(log, ["run0", "cleanup0", "run1"]);
});

test("the returned cleanup runs on dispose", () => {
  const log = [];
  const e = effect(() => {
    log.push("run");
    return () => log.push("cleanup");
  });
  assert.deepEqual(log, ["run"]);
  e.dispose();
  assert.deepEqual(log, ["run", "cleanup"]);
});

test("dispose() stops further runs", () => {
  const s = createState(0);
  let runs = 0;
  const e = effect(() => (runs++, s.get()));
  assert.equal(runs, 1);
  e.dispose();
  s.set(1);
  flush();
  assert.equal(runs, 1);
});

test("dispose() is idempotent — cleanup runs only once", () => {
  let cleanups = 0;
  const e = effect(() => () => cleanups++);
  e.dispose();
  e.dispose();
  assert.equal(cleanups, 1);
});

test("a throwing effect is contained and does not throw to the caller", () => {
  // creation must not throw; other effects keep working
  assert.doesNotThrow(() => effect(() => { throw new Error("boom"); }));
  const s = createState(0);
  let seen;
  effect(() => (seen = s.get()));
  s.set(2);
  flush();
  assert.equal(seen, 2);
});

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

test("an effect created in a component auto-disposes (with cleanup) on unmount", { skip }, () => {
  const target = document.createElement("div");
  const s = createState(0);
  const log = [];
  const unmount = mount(() => {
    effect(() => {
      s.get();
      log.push("run");
      return () => log.push("cleanup");
    });
    return html`<div></div>`;
  }, target);

  assert.deepEqual(log, ["run"]);
  unmount();
  assert.deepEqual(log, ["run", "cleanup"]); // cleanup fired on unmount

  s.set(1);
  flush();
  assert.deepEqual(log, ["run", "cleanup"]); // no further runs after unmount
});
