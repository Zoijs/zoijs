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

// ---- enumeration, arrays, instanceof (found while reviewing L2) ------------------------------
// The proxy's target was an empty object, so {...item}, Object.keys(item) and JSON.stringify(item)
// all saw nothing — `save({ ...todo, done: true })` silently sent { done: true }.

test("spread, Object.keys/entries and JSON.stringify see the live item", () => {
  const { seen, list } = capture([{ id: 1, text: "a", done: false }]);
  const x = seen.get(1);
  assert.deepEqual({ ...x, done: true }, { id: 1, text: "a", done: true });
  assert.deepEqual(Object.keys(x), ["id", "text", "done"]);
  assert.deepEqual(Object.entries(x), [["id", 1], ["text", "a"], ["done", false]]);
  assert.equal(JSON.stringify(x), '{"id":1,"text":"a","done":false}');
  assert.deepEqual(Object.assign({}, x), { id: 1, text: "a", done: false });
  list.set([{ id: 1, text: "b", extra: 2 }]); // same key, new object
  flush();
  assert.deepEqual({ ...x }, { id: 1, text: "b", extra: 2 });
});

test("non-enumerable, symbol and frozen properties follow the item's own descriptors", () => {
  const sym = Symbol("s");
  const item = Object.freeze(Object.defineProperties({ id: 1, [sym]: 1 }, { hidden: { value: 1, enumerable: false } }));
  const { seen } = capture([item]);
  const x = seen.get(1);
  assert.deepEqual(Object.keys(x), ["id"]);
  assert.ok(Reflect.ownKeys(x).includes(sym));
  assert.equal(Object.getOwnPropertyDescriptor(x, "hidden").enumerable, false);
  assert.equal(x.hidden, 1);
});

test("array items are arrays (Array.isArray, length, iteration, spread, JSON)", () => {
  let seen;
  const list = createState([[1, 2]]);
  mount(() => html`<ul>${each(() => list.get(), (a) => a[0], (a) => ((seen = a), html`<li></li>`))}</ul>`, host());
  assert.equal(Array.isArray(seen), true);
  assert.equal(seen.length, 2);
  assert.deepEqual([...seen], [1, 2]);
  assert.equal(JSON.stringify(seen), "[1,2]");
  assert.deepEqual(seen.map((n) => n * 2), [2, 4]);
  list.set([[1, 2, 3]]);
  flush();
  assert.equal(seen.length, 3);
  assert.equal(JSON.stringify(seen), "[1,2,3]");
  const frozen = createState([Object.freeze([7, 8])]);
  let f;
  mount(() => html`<ul>${each(() => frozen.get(), (a) => a[0], (a) => ((f = a), html`<li></li>`))}</ul>`, host());
  assert.deepEqual([...f], [7, 8], "a frozen array item still satisfies the proxy invariants");
});

test("instanceof and the prototype follow the item", () => {
  class Point {
    constructor(id) {
      this.id = id;
    }
  }
  const { seen } = capture([new Point(1), { id: 2, when: new Date(0) }]);
  assert.ok(seen.get(1) instanceof Point);
  assert.equal(Object.getPrototypeOf(seen.get(1)), Point.prototype);
  assert.ok(seen.get(2).when instanceof Date);
});

test("enumeration inside a binding is reactive", () => {
  const el = host();
  const list = createState([{ id: 1, a: 1 }]);
  mount(() => html`<ul>${each(() => list.get(), (x) => x.id, (x) => html`<li>${() => Object.keys(x).join(",")}</li>`)}</ul>`, el);
  assert.equal(el.querySelector("li").textContent, "id,a");
  list.set([{ id: 1, a: 1, b: 2 }]);
  flush();
  assert.equal(el.querySelector("li").textContent, "id,a,b");
});
