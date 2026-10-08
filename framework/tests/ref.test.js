// Tests for callback refs (`ref=${(el) => …}`).
// Need a DOM, so they skip in plain Node; run with jsdom (`--import ./tests/setup-dom.js`).
//
// Refs fire one microtask after insertion, so tests await a macrotask (setTimeout 0),
// which guarantees all microtasks have flushed. Connection-dependent behavior
// (focus, layout, canvas) lives in the browser specs; jsdom mount targets are detached.

import test from "node:test";
import assert from "node:assert/strict";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { each } from "../src/core/each.js";
import { createState } from "../src/reactivity/state.js";
import { flush } from "../src/reactivity/scheduler.js";
import { configure } from "../src/reactivity/env.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;
const tick = () => new Promise((r) => setTimeout(r, 0));

test("ref receives the rendered element", { skip }, async () => {
  const target = document.createElement("div");
  let received = null;
  mount(() => html`<input ref=${(el) => (received = el)} />`, target);

  assert.equal(received, null); // not yet — deferred
  await tick();
  assert.equal(received, target.querySelector("input"));
  assert.ok(received instanceof Element);
});

test("ref runs exactly once and is not reactive", { skip }, async () => {
  const target = document.createElement("div");
  const c = createState(0);
  let calls = 0;
  // Read state inside the ref to prove it does NOT subscribe.
  mount(() => html`<p ref=${() => { c.get(); calls++; }}>x</p>`, target);
  await tick();
  assert.equal(calls, 1);

  c.set(1);
  flush();
  await tick();
  assert.equal(calls, 1); // unchanged — refs are not effects
});

test("ref cleanup runs on unmount", { skip }, async () => {
  const target = document.createElement("div");
  let cleaned = false;
  const unmount = mount(() => html`<div ref=${() => () => (cleaned = true)}></div>`, target);
  await tick();
  assert.equal(cleaned, false);

  unmount();
  assert.equal(cleaned, true);
});

test("ref fires per item inside each() and cleans up on list removal", { skip }, async () => {
  const target = document.createElement("div");
  const items = createState([{ id: 1 }, { id: 2 }]);
  const seen = [];
  const cleaned = [];
  mount(
    () => html`<ul>${each(
      () => items.get(),
      (x) => x.id,
      (x) => html`<li ref=${() => { seen.push(x.id); return () => cleaned.push(x.id); }}>${() => x.id}</li>`
    )}</ul>`,
    target
  );
  await tick();
  assert.deepEqual(seen, [1, 2]);
  assert.deepEqual(cleaned, []);

  items.set([{ id: 1 }]); // remove item 2
  flush();
  await tick();
  assert.deepEqual(cleaned, [2]); // only the removed item's ref cleaned up
});

test("a ref on a node removed before its microtask never runs setup", { skip }, async () => {
  const target = document.createElement("div");
  let ran = false;
  const unmount = mount(() => html`<span ref=${() => (ran = true)}>x</span>`, target);
  unmount(); // dispose before the deferred microtask fires
  await tick();
  assert.equal(ran, false);
});

test("non-function ref values are ignored safely (no throw, no attribute)", { skip }, async () => {
  configure({ dev: false }); // silence the expected dev warnings
  const target = document.createElement("div");
  // string, number, and a multi-part (string) ref — all inert
  mount(
    () => html`<input ref=${"focus()"} /><b ref=${123}></b><i ref="a${"b"}"></i>`,
    target
  );
  await tick();

  const input = target.querySelector("input");
  assert.equal(input.hasAttribute("ref"), false); // never written as an attribute
  assert.equal(target.querySelector("b").hasAttribute("ref"), false);
  configure({ dev: true });
});

test("a throwing ref cleanup is contained; sibling cleanups still run", { skip }, async () => {
  const target = document.createElement("div");
  let siblingCleaned = false;
  const unmount = mount(
    () => html`
      <div ref=${() => () => { throw new Error("boom"); }}></div>
      <span ref=${() => () => (siblingCleaned = true)}></span>
    `,
    target
  );
  await tick();
  // The thrown error is contained by the owner (logged, not propagated), so
  // unmount() doesn't throw and the sibling's cleanup still runs.
  assert.doesNotThrow(() => unmount());
  assert.equal(siblingCleaned, true);
});
