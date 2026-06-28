// Tests for microtask batching (Task 3). Plain Node, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../src/reactivity/state.js";
import { effect } from "../src/reactivity/effect.js";
import { flush } from "../src/reactivity/scheduler.js";

test("multiple sets are batched into a single effect run", () => {
  const c = createState(0);
  let runs = 0;
  effect(() => (c.get(), runs++));
  assert.equal(runs, 1);

  c.set(1);
  c.set(2);
  c.set(3);
  assert.equal(runs, 1); // not flushed yet — queued

  flush();
  assert.equal(runs, 2); // exactly one batched run
  assert.equal(c.get(), 3); // with the final value
});

test("an effect scheduled by several states still runs once per flush", () => {
  const a = createState(0);
  const b = createState(0);
  let runs = 0;
  effect(() => (a.get(), b.get(), runs++));

  a.set(1);
  b.set(1); // same effect queued again -> deduped
  flush();
  assert.equal(runs, 2);
});

test("queued effects run in the order they were first scheduled", () => {
  const s = createState(0);
  const order = [];
  effect(() => (s.get(), order.push("first")));
  effect(() => (s.get(), order.push("second")));
  order.length = 0;

  s.set(1);
  flush();
  assert.deepEqual(order, ["first", "second"]);
});

test("updates flush automatically on a microtask (no manual flush)", async () => {
  const c = createState(0);
  let seen = null;
  effect(() => (seen = c.get()));
  c.set(42);
  assert.equal(seen, 0); // synchronous: not yet
  await Promise.resolve(); // let the microtask run
  assert.equal(seen, 42);
});
