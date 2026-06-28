// Tests for each() — keyed list reconciliation (Milestone 3).
//
// The marker-shape test runs in plain Node. The reconciliation tests need a DOM,
// so they skip in Node and are verified in-browser.

import test from "node:test";
import assert from "node:assert/strict";
import { each } from "../src/core/each.js";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { createState } from "../src/reactivity/state.js";
import { flush } from "../src/reactivity/scheduler.js";

test("each() returns a marker carrying items/keyFn/renderFn", () => {
  const itemsFn = () => [];
  const keyFn = (x) => x.id;
  const renderFn = (x) => x;
  const marker = each(itemsFn, keyFn, renderFn);
  assert.equal(marker.__zoijsEach, true);
  assert.equal(marker.items, itemsFn);
  assert.equal(marker.keyFn, keyFn);
  assert.equal(marker.renderFn, renderFn);
});

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

function listMount(state) {
  const target = document.createElement("div");
  mount(
    () => html`<ul>${each(() => state.get(), (x) => x.id, (x) => html`<li>${() => x.name}</li>`)}</ul>`,
    target
  );
  return target;
}
const texts = (target) => [...target.querySelectorAll("li")].map((li) => li.textContent);

test("initial render lists all items", { skip }, () => {
  const s = createState([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
  const target = listMount(s);
  assert.deepEqual(texts(target), ["a", "b"]);
});

test("append, prepend, remove", { skip }, () => {
  const s = createState([{ id: 1, name: "a" }]);
  const target = listMount(s);

  s.set([{ id: 1, name: "a" }, { id: 2, name: "b" }]); flush();
  assert.deepEqual(texts(target), ["a", "b"]);

  s.set([{ id: 0, name: "z" }, { id: 1, name: "a" }, { id: 2, name: "b" }]); flush();
  assert.deepEqual(texts(target), ["z", "a", "b"]);

  s.set([{ id: 1, name: "a" }, { id: 2, name: "b" }]); flush();
  assert.deepEqual(texts(target), ["a", "b"]);
});

test("reorder preserves node identity (moves, not recreates)", { skip }, () => {
  const s = createState([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }]);
  const target = listMount(s);
  const liByText = (t) => [...target.querySelectorAll("li")].find((li) => li.textContent === t);
  const nodeA = liByText("a");
  const nodeC = liByText("c");

  s.set([{ id: 3, name: "c" }, { id: 2, name: "b" }, { id: 1, name: "a" }]); flush();
  assert.deepEqual(texts(target), ["c", "b", "a"]);
  assert.equal(liByText("a"), nodeA); // same node, moved
  assert.equal(liByText("c"), nodeC);
});

test("unchanged key keeps its exact DOM node across an append", { skip }, () => {
  const s = createState([{ id: 1, name: "a" }]);
  const target = listMount(s);
  const node = target.querySelector("li");
  s.set([{ id: 1, name: "a" }, { id: 2, name: "b" }]); flush();
  assert.equal(target.querySelector("li"), node);
});

test("replace all items swaps the whole list", { skip }, () => {
  const s = createState([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
  const target = listMount(s);
  s.set([{ id: 9, name: "x" }, { id: 8, name: "y" }]); flush();
  assert.deepEqual(texts(target), ["x", "y"]);
});

test("removed item's effects are disposed (no detached updates)", { skip }, () => {
  // Per-item binding reads x.name via the proxy; after removal, changing the
  // array must not throw or touch the removed node.
  const s = createState([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
  const target = listMount(s);
  const removed = [...target.querySelectorAll("li")][1];
  s.set([{ id: 1, name: "a" }]); flush();
  assert.equal(removed.isConnected, false); // node removed
  s.set([{ id: 1, name: "A" }]); flush(); // no throw; only surviving item updates
  assert.deepEqual(texts(target), ["A"]);
});

test("null / undefined list is treated as empty", { skip }, () => {
  const s = createState(null);
  const target = document.createElement("div");
  mount(() => html`<ul>${each(() => s.get(), (x) => x.id, (x) => html`<li>${() => x.name}</li>`)}</ul>`, target);
  assert.equal(target.querySelectorAll("li").length, 0);
  s.set([{ id: 1, name: "a" }]); flush();
  assert.deepEqual(texts(target), ["a"]);
  s.set(undefined); flush();
  assert.equal(target.querySelectorAll("li").length, 0);
});

test("duplicate keys warn in dev mode", { skip }, () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const s = createState([{ id: 1, name: "a" }, { id: 1, name: "b" }]);
    listMount(s);
  } finally {
    console.warn = original;
  }
  assert.ok(warnings.some((w) => w.includes("duplicate key")));
});

test("a sibling binding after each() binds to its own node (no marker collision)", { skip }, () => {
  // The <li> items contain their own text marker (index 1); the sibling <p>
  // binding is also index 1. It must bind to the <p>, not an <li> inside.
  const s = createState([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
  const target = document.createElement("div");
  mount(
    () => html`<div><ul>${each(() => s.get(), (x) => x.id, (x) => html`<li>${() => x.name}</li>`)}</ul><p>${() => s.get().length}</p></div>`,
    target
  );
  assert.equal(target.querySelector("p").textContent, "2");
  s.set([{ id: 1, name: "a" }]); flush();
  assert.equal(target.querySelector("p").textContent, "1");
});

test("updating one item does not re-render the others", { skip }, () => {
  const s = createState([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
  const target = listMount(s);
  const nodeB = [...target.querySelectorAll("li")][1];

  // change only item 1's object; item 2 keeps its reference
  const arr = s.get();
  s.set([{ id: 1, name: "A" }, arr[1]]); flush();

  assert.deepEqual(texts(target), ["A", "b"]);
  assert.equal([...target.querySelectorAll("li")][1], nodeB); // item 2 node untouched
});
