// Move-minimization: each() moves the minimal number of DOM nodes on reorder,
// via a longest-increasing-subsequence pass (Phase 4). These tests count the
// insertBefore calls on the list's parent to prove only the necessary nodes move.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../src/reactivity/state.js";
import { flush } from "../src/reactivity/scheduler.js";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { each } from "../src/core/each.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

const ids = (s) => s.split("").map((id) => ({ id }));
const order = (ul) => [...ul.querySelectorAll("li")].map((li) => li.textContent).join("");

function mountList(initial) {
  const target = document.createElement("div");
  const state = createState(initial);
  mount(
    () => html`<ul>${each(() => state.get(), (x) => x.id, (x) => html`<li>${() => x.id}</li>`)}</ul>`,
    target
  );
  return { state, ul: target.querySelector("ul") };
}

// Count insertBefore calls on the list parent during one reactive update.
function countMoves(ul, state, next) {
  const original = ul.insertBefore.bind(ul);
  let moves = 0;
  ul.insertBefore = (...a) => {
    moves++;
    return original(...a);
  };
  state.set(next);
  flush();
  ul.insertBefore = original;
  return moves;
}

test("moving one item across many is a single move (not N)", { skip }, () => {
  const { state, ul } = mountList(ids("abcd"));
  assert.equal(order(ul), "abcd");
  const moves = countMoves(ul, state, ids("dabc")); // d to front; a,b,c keep
  assert.equal(order(ul), "dabc");
  assert.equal(moves, 1);
});

test("a rotation is a single move", { skip }, () => {
  const { state, ul } = mountList(ids("abcd"));
  const moves = countMoves(ul, state, ids("bcda")); // a to the end
  assert.equal(order(ul), "bcda");
  assert.equal(moves, 1);
});

test("an unchanged order does zero moves", { skip }, () => {
  const { state, ul } = mountList(ids("abc"));
  assert.equal(countMoves(ul, state, ids("abc")), 0);
});

test("a pure append leaves existing nodes untouched (only the new tail inserts)", { skip }, () => {
  const { state, ul } = mountList(ids("abc"));
  const moves = countMoves(ul, state, ids("abcd")); // a,b,c keep; d is new
  assert.equal(order(ul), "abcd");
  assert.equal(moves, 1);
});

test("a prepend leaves existing nodes untouched (only the new head inserts)", { skip }, () => {
  const { state, ul } = mountList(ids("abc"));
  const moves = countMoves(ul, state, ids("xabc")); // a,b,c keep; x is new
  assert.equal(order(ul), "xabc");
  assert.equal(moves, 1);
});

test("a full reverse reorders correctly and moves no more than n-1", { skip }, () => {
  const { state, ul } = mountList(ids("abcde"));
  const moves = countMoves(ul, state, ids("edcba"));
  assert.equal(order(ul), "edcba");
  assert.ok(moves <= 4, `expected <= 4 moves, got ${moves}`);
});
