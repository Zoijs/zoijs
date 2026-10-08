// Tests for computed() — lazy, cached derived state (Task 7).

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../src/reactivity/state.js";
import { computed } from "../src/reactivity/computed.js";
import { effect } from "../src/reactivity/effect.js";
import { flush } from "../src/reactivity/scheduler.js";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";

test("computed is lazy — fn does not run until first read", () => {
  let runs = 0;
  const c = computed(() => (runs++, 1));
  assert.equal(runs, 0); // not evaluated yet
  c.get();
  assert.equal(runs, 1);
});

test("reads are cached until a dependency changes", () => {
  const s = createState(2);
  let runs = 0;
  const c = computed(() => (runs++, s.get() * 2));
  assert.equal(c.get(), 4);
  assert.equal(c.get(), 4);
  assert.equal(runs, 1); // cached, recomputed once
});

test("recomputes only after a dependency changes, and only on read", () => {
  const s = createState(2);
  let runs = 0;
  const c = computed(() => (runs++, s.get()));
  c.get();
  assert.equal(runs, 1);
  s.set(3);
  assert.equal(runs, 1); // lazy: not recomputed yet
  assert.equal(c.get(), 3);
  assert.equal(runs, 2);
});

test("nested computed values work", () => {
  const a = createState(1);
  const b = computed(() => a.get() + 1);
  const c = computed(() => b.get() * 2);
  assert.equal(c.get(), 4);
  a.set(2);
  assert.equal(c.get(), 6);
});

test("computed cleans up stale (conditional) dependencies", () => {
  const useX = createState(true);
  const x = createState(1);
  const y = createState(2);
  let runs = 0;
  const c = computed(() => (runs++, useX.get() ? x.get() : y.get()));

  assert.equal(c.get(), 1);
  assert.equal(runs, 1);

  useX.set(false);
  assert.equal(c.get(), 2); // now depends on y, not x
  assert.equal(runs, 2);

  x.set(99); // x is no longer a dependency
  assert.equal(c.get(), 2);
  assert.equal(runs, 2); // not recomputed
});

test("an effect re-runs when a computed it reads changes", () => {
  const s = createState(1);
  const doubled = computed(() => s.get() * 2);
  let seen = null;
  effect(() => (seen = doubled.get()));
  assert.equal(seen, 2);
  s.set(5);
  flush();
  assert.equal(seen, 10);
});

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

test("computed works inside a template binding", { skip }, () => {
  const target = document.createElement("div");
  const first = createState("Jane");
  const last = createState("Doe");
  const full = computed(() => `${first.get()} ${last.get()}`);
  mount(() => html`<p>${() => full.get()}</p>`, target);

  assert.equal(target.querySelector("p").textContent, "Jane Doe");
  first.set("John");
  flush();
  assert.equal(target.querySelector("p").textContent, "John Doe");
});
