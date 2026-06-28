// Tests for mount() — setup-once render + reactive update + cleanup.
// Needs a DOM, so these skip in plain Node; run in a browser or with jsdom.

import test from "node:test";
import assert from "node:assert/strict";
import { mount } from "../src/core/mount.js";
import { html } from "../src/core/html.js";
import { createState } from "../src/reactivity/state.js";
import { flush } from "../src/reactivity/scheduler.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

test("mount() runs the component once and inserts its DOM", { skip }, () => {
  const target = document.createElement("div");
  let runs = 0;
  mount(() => {
    runs++;
    return html`<p>hello</p>`;
  }, target);
  assert.equal(target.querySelector("p").textContent, "hello");
  assert.equal(runs, 1);
});

test("mount() updates a bound node on state change without re-running setup", { skip }, () => {
  const target = document.createElement("div");
  let setupRuns = 0;
  const n = createState(0);
  mount(() => {
    setupRuns++;
    return html`<button onclick=${() => n.set(n.get() + 1)}>${() => n.get()}</button>`;
  }, target);

  const btn = target.querySelector("button");
  assert.equal(btn.textContent, "0");

  btn.click();
  flush();
  assert.equal(btn.textContent, "1");
  assert.equal(setupRuns, 1); // component never re-executed
});

test("mount() returns an unmount that clears the target", { skip }, () => {
  const target = document.createElement("div");
  const unmount = mount(() => html`<p>x</p>`, target);
  assert.equal(target.children.length, 1);
  unmount();
  assert.equal(target.children.length, 0);
});
