// Tests for effect safety (Tasks 2 & 3): loop guarding + error containment.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../src/reactivity/state.js";
import { effect } from "../src/reactivity/effect.js";
import { flush } from "../src/reactivity/scheduler.js";

function captureConsole(method, fn) {
  const original = console[method];
  const calls = [];
  console[method] = (...args) => calls.push(args);
  try {
    fn();
  } finally {
    console[method] = original;
  }
  return calls;
}

test("a self-triggering effect is stopped, not run forever", () => {
  const c = createState(0);
  let runs = 0;
  const warns = captureConsole("warn", () => {
    effect(() => {
      runs++;
      c.set(c.get() + 1); // reads AND writes c -> self-triggering
    });
    flush();
  });
  assert.ok(runs >= 1 && runs <= 200, `runs was ${runs} (should be bounded)`);
  assert.ok(warns.length > 0, "expected a self-trigger / runaway warning");
});

test("an error in one binding effect does not stop other effects", () => {
  const c = createState(0);
  let good = 0;
  const errors = captureConsole("error", () => {
    effect(() => {
      c.get();
      throw new Error("boom");
    });
    effect(() => {
      c.get();
      good++;
    });
    c.set(1);
    flush();
  });
  assert.equal(good, 2); // ran on creation and on change, despite the sibling throwing
  assert.ok(errors.length > 0, "expected the thrown error to be reported");
});

test("a throwing effect does not break batching for the rest", () => {
  const c = createState(0);
  const seen = [];
  captureConsole("error", () => {
    effect(() => {
      if (c.get() === 1) throw new Error("boom once");
    });
    effect(() => seen.push(c.get()));
    c.set(1);
    flush();
    c.set(2);
    flush();
  });
  assert.deepEqual(seen, [0, 1, 2]); // the healthy effect kept tracking
});
