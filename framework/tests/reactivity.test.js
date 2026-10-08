// Tests for dependency tracking (Task 2). Plain Node, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../src/reactivity/state.js";
import { effect } from "../src/reactivity/effect.js";
import { flush } from "../src/reactivity/scheduler.js";

test("an effect runs once on creation and subscribes to state it reads", () => {
  const c = createState(0);
  let seen = null;
  effect(() => (seen = c.get()));
  assert.equal(seen, 0);
});

test("a state change re-runs the subscribed effect", () => {
  const c = createState(0);
  let seen = null;
  effect(() => (seen = c.get()));
  c.set(5);
  flush();
  assert.equal(seen, 5);
});

test("multiple effects can depend on the same state", () => {
  const c = createState(0);
  let a = 0;
  let b = 0;
  effect(() => (c.get(), a++));
  effect(() => (c.get(), b++));
  c.set(1);
  flush();
  assert.equal(a, 2);
  assert.equal(b, 2);
});

test("one effect can depend on multiple states", () => {
  const x = createState(1);
  const y = createState(2);
  let sum = 0;
  effect(() => (sum = x.get() + y.get()));
  x.set(10);
  flush();
  assert.equal(sum, 12);
  y.set(20);
  flush();
  assert.equal(sum, 30);
});

test("a disposed effect no longer re-runs", () => {
  const c = createState(0);
  let runs = 0;
  const e = effect(() => (c.get(), runs++));
  e.dispose();
  c.set(1);
  flush();
  assert.equal(runs, 1);
});

test("effects auto-unsubscribe from stale (conditional) dependencies", () => {
  const useA = createState(true);
  const a = createState(1);
  const b = createState(2);
  let runs = 0;
  effect(() => {
    runs++;
    useA.get() ? a.get() : b.get();
  });
  assert.equal(runs, 1);

  useA.set(false); // now reads b, not a
  flush();
  assert.equal(runs, 2);

  a.set(99); // a is no longer a dependency
  flush();
  assert.equal(runs, 2);

  b.set(99); // b is a dependency now
  flush();
  assert.equal(runs, 3);
});
