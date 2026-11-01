// computed(fn, equals) first-run semantics (L3, found by Zoijs Insight). Core ≤ 1.9.0 called
// `equals(undefined, first)` on the first computation, so a comparator that reads its arguments
// (`(a, b) => a.page === b.page`) threw. `equals` now only ever compares two computed values.

import test from "node:test";
import assert from "node:assert/strict";
import { createState, computed, effect } from "../src/index.js";
import { flush } from "../src/reactivity/scheduler.js";

test("the first value is stored without calling equals", () => {
  const calls = [];
  const c = computed(() => ({ page: 1 }), (a, b) => (calls.push([a, b]), a.page === b.page));
  assert.deepEqual(c.get(), { page: 1 });
  assert.equal(calls.length, 0);
});

test("equal results keep the old value and don't wake observers; unequal ones do", () => {
  const n = createState(1);
  const calls = [];
  const c = computed(() => ({ odd: n.get() % 2 === 1 }), (a, b) => (calls.push([a.odd, b.odd]), a.odd === b.odd));
  let runs = 0;
  effect(() => (c.get(), runs++));
  const first = c.peek();
  n.set(3); // still odd → equal
  flush();
  assert.equal(c.peek(), first, "the previous value object is kept");
  assert.equal(runs, 1);
  n.set(4); // even → changed
  flush();
  assert.equal(c.peek().odd, false);
  assert.equal(runs, 2);
  assert.deepEqual(calls, [[true, true], [true, false]], "always two computed values");
});

test("undefined is a legitimate value: computed first, then compared like any other", () => {
  const n = createState(0);
  const calls = [];
  const c = computed(() => (n.get() > 0 ? n.get() : undefined), (a, b) => (calls.push([a, b]), a === b));
  let runs = 0;
  effect(() => (c.get(), runs++));
  assert.equal(c.peek(), undefined);
  assert.equal(calls.length, 0);
  n.set(-1); // still undefined → equal → no wake-up
  flush();
  assert.deepEqual(calls, [[undefined, undefined]]);
  assert.equal(runs, 1);
  n.set(2);
  flush();
  assert.equal(c.peek(), 2);
  assert.equal(runs, 2);
});

test("a failed first run establishes no value: the next successful run is still the first", () => {
  const fail = createState(true);
  const calls = [];
  const c = computed(() => {
    if (fail.get()) throw new Error("not yet");
    return { v: 1 };
  }, (a, b) => (calls.push([a, b]), a.v === b.v));
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal(c.get(), undefined, "the error is contained; no value yet");
  } finally {
    console.error = err;
  }
  fail.set(false);
  assert.deepEqual(c.get(), { v: 1 });
  assert.equal(calls.length, 0, "equals is not called with the missing first value");
});

test("a throwing comparator surfaces to the reader; the computed recovers on a later read", () => {
  const n = createState(1);
  let bad = false;
  const c = computed(() => n.get(), (a, b) => {
    if (bad) throw new Error("comparator");
    return a === b;
  });
  assert.equal(c.get(), 1);
  bad = true;
  n.set(2);
  assert.throws(() => c.get(), /comparator/);
  bad = false;
  assert.equal(c.get(), 2, "still dirty after the throw, so the next read recomputes");
});

test("dependency changes and disposal: sources are re-tracked per run; a disposed computed stops", async () => {
  const which = createState("a");
  const a = createState(1);
  const b = createState(10);
  const calls = [];
  let c;
  const { dispose } = effect(() => {
    c = c || computed(() => (which.get() === "a" ? a.get() : b.get()), (x, y) => (calls.push([x, y]), x === y));
    c.get();
  });
  which.set("b");
  flush();
  assert.equal(c.peek(), 10);
  a.set(2); // no longer a dependency
  flush();
  assert.deepEqual(calls, [[1, 10]]);
  dispose();
});
