// Tests for {{APP_NAME}}. Pure logic — no DOM needed. Run with `npm test`.

import test from "node:test";
import assert from "node:assert/strict";
import { counter } from "../src/index.js";

test("counts up and down", () => {
  const c = counter(0);
  assert.equal(c.value(), 0);
  c.increment();
  assert.equal(c.value(), 1);
  c.increment(5);
  assert.equal(c.value(), 6);
  c.decrement(2);
  assert.equal(c.value(), 4);
});

test("reset restores the initial value", () => {
  const c = counter(10);
  c.increment();
  c.reset();
  assert.equal(c.value(), 10);
});

test("exposes the raw reactive cell", () => {
  const c = counter(3);
  assert.equal(typeof c.state.get, "function");
  assert.equal(c.state.peek(), 3);
});
