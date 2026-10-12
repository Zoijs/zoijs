// class=${…} bindings and classes added by other code (found while reviewing Zoijs Insight). A
// binding used to rewrite the whole attribute on every update, wiping classes that a library
// (Bootstrap's JS, an animation helper) or the app added with classList. After the first write a
// binding now changes only the tokens it set itself.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, createState } from "../src/index.js";
import { flush } from "../src/reactivity/scheduler.js";

const host = () => document.body.appendChild(document.createElement("div"));

test("classes added by other code survive binding updates", () => {
  const el = host();
  const on = createState(false);
  mount(() => html`<div class=${() => (on.get() ? "btn active" : "btn")}></div>`, el);
  const d = el.firstElementChild;
  assert.equal(d.className, "btn");
  d.classList.add("show", "fade");
  on.set(true);
  flush();
  assert.deepEqual([...d.classList].sort(), ["active", "btn", "fade", "show"]);
  on.set(false);
  flush();
  assert.deepEqual([...d.classList].sort(), ["btn", "fade", "show"]);
});

test("the binding's own tokens are added and removed; mixed static text counts as its own", () => {
  const el = host();
  const tone = createState("primary");
  mount(() => html`<p class="badge badge-${() => tone.get()}"></p>`, el);
  const p = el.firstElementChild;
  assert.equal(p.className, "badge badge-primary");
  tone.set("danger");
  flush();
  assert.deepEqual([...p.classList].sort(), ["badge", "badge-danger"]);
});

test("null/false remove only the binding's tokens; the attribute goes when nothing is left", () => {
  const el = host();
  const c = createState("a b");
  mount(() => html`<i class=${() => c.get()}></i><b class=${() => c.get()}></b>`, el);
  const [i, b] = el.querySelectorAll("i, b");
  i.classList.add("ext");
  c.set(null);
  flush();
  assert.equal(i.className, "ext");
  assert.equal(b.hasAttribute("class"), false);
  c.set("a");
  flush();
  assert.deepEqual([...i.classList].sort(), ["a", "ext"]);
  c.set(false);
  flush();
  assert.equal(b.hasAttribute("class"), false);
});

test("the first write sets the attribute as before (static/server class text is replaced)", () => {
  const el = host();
  mount(() => html`<div class=${"x  y"}></div>`, el);
  assert.equal(el.firstElementChild.getAttribute("class"), "x  y");
});

test("SVG elements", () => {
  const el = host();
  const on = createState(false);
  mount(() => html`<svg><rect class=${() => (on.get() ? "bar on" : "bar")} /></svg>`, el);
  const r = el.querySelector("rect");
  r.classList.add("hover");
  on.set(true);
  flush();
  assert.deepEqual([...r.classList].sort(), ["bar", "hover", "on"]);
});
