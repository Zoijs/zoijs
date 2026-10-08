// Tests for createState() — the reactive primitive. Plain Node, no DOM.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../src/reactivity/state.js";
import { effect } from "../src/reactivity/effect.js";
import { flush } from "../src/reactivity/scheduler.js";

test("get() returns the initial value", () => {
  assert.equal(createState(5).get(), 5);
});

test("set() updates the value read by get()", () => {
  const count = createState(0);
  count.set(3);
  assert.equal(count.get(), 3);
});

test("peek() reads without subscribing", () => {
  const count = createState(1);
  let runs = 0;
  effect(() => {
    count.peek(); // does NOT subscribe
    runs++;
  });
  count.set(2);
  flush();
  assert.equal(runs, 1); // effect never re-ran
});

test("set() with an equal value is a no-op (equality-gated)", () => {
  const count = createState(0);
  let runs = 0;
  effect(() => {
    count.get();
    runs++;
  });
  count.set(0);
  flush();
  assert.equal(runs, 1);
});
