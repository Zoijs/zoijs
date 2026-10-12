// each() item proxies and function fields (L2, found by Zoijs Insight). Core ≤ 1.9.0 returned
// every function field as `fn.bind(item)` — a new function on each read, without the original's
// own properties. Own function fields now come back as-is; inherited methods are still bound.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, each, createState } from "../src/index.js";
import { flush } from "../src/reactivity/scheduler.js";

const host = () => document.body.appendChild(document.createElement("div"));

function capture(items, render = () => html`<li></li>`) {
  const seen = new Map();
  const list = createState(items);
  mount(() => html`<ul>${each(() => list.get(), (x) => x.id, (x) => (seen.set(x.id, x), render(x)))}</ul>`, host());
  return { seen, list };
}

test("own function fields keep their identity and their own properties", () => {
  const fn = () => "ok";
  fn.preload = () => "preloaded";
  const { seen } = capture([{ id: 1, fn }]);
  const x = seen.get(1);
  assert.equal(x.fn, fn);
  assert.equal(x.fn, x.fn, "stable across reads");
  assert.equal(x.fn.preload(), "preloaded");
});

test("own functions work as event callbacks (identity preserved)", () => {
  let clicks = 0;
  const onPick = () => clicks++;
  const el = host();
  mount(() => html`<ul>${each([{ id: 1, onPick }], (x) => x.id, (x) => html`<li><button onclick=${x.onPick}>b</button></li>`)}</ul>`, el);
  el.querySelector("button").click();
  assert.equal(clicks, 1);
});

test("method-style own functions read the live item through `this` and may write to it", () => {
  const item = {
    id: 1,
    name: "ada",
    label() {
      return this.name.toUpperCase();
    },
    rename(n) {
      this.name = n;
    },
  };
  const { seen, list } = capture([item], (x) => html`<li>${() => x.label()}</li>`);
  const x = seen.get(1);
  assert.equal(x.label(), "ADA");
  x.rename("grace"); // a write through `this` reaches the item (as with the old bound method)
  assert.equal(item.name, "grace");
  assert.equal(x.label(), "GRACE");
  list.set([{ ...item, name: "lin" }]); // same key, new object: `this` follows the live item
  flush();
  assert.equal(x.label(), "LIN");
});

test("inherited methods keep the real receiver (Date#getTime, Map#get, class methods)", () => {
  class Point {
    constructor(id, x) {
      this.id = id;
      this.x = x;
    }
    double() {
      return this.x * 2;
    }
  }
  const when = new Date(0);
  const map = new Map([["k", 7]]);
  const { seen } = capture([{ id: 1, when, map }, new Point(2, 5)]);
  assert.equal(seen.get(1).when.getTime(), 0, "a non-plain value field is returned as-is");
  assert.equal(seen.get(1).map.get("k"), 7);
  const p = seen.get(2);
  assert.equal(p.double(), 10);
  assert.equal(p.double.call(undefined), 10, "inherited methods stay bound to the item");
});

test("nested objects and keyed updates: functions read after an update are the new item's", () => {
  const f1 = () => 1;
  const f2 = () => 2;
  const { seen, list } = capture([{ id: 1, meta: { fn: f1 }, fn: f1 }]);
  const x = seen.get(1);
  assert.equal(x.meta.fn, f1, "nested objects are plain values");
  list.set([{ id: 1, meta: { fn: f2 }, fn: f2 }]);
  flush();
  assert.equal(x.fn, f2);
  assert.equal(x.meta.fn, f2);
});

test("writes through a frozen item fail like a direct strict-mode write", () => {
  const { seen } = capture([Object.freeze({ id: 1, n: 1 })]);
  assert.throws(() => {
    seen.get(1).n = 2;
  }, TypeError);
});
