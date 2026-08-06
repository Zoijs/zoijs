// Tests for DOM bindings (Tasks 1, 4, 5) + cleanup.
// Need a DOM, so they skip in plain Node; run in a browser or with jsdom.

import test from "node:test";
import assert from "node:assert/strict";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { createState } from "../src/reactivity/state.js";
import { flush } from "../src/reactivity/scheduler.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

test("text binding updates the SAME text node in place", { skip }, () => {
  const target = document.createElement("div");
  const c = createState(0);
  mount(() => html`<span>${() => c.get()}</span>`, target);
  const span = target.querySelector("span");
  const textNode = span.firstChild;

  assert.equal(span.textContent, "0");
  c.set(1);
  flush();
  assert.equal(span.textContent, "1");
  assert.equal(span.firstChild, textNode); // reused, not recreated
});

test("<textarea> sole ${} binds its value (static + reactive)", { skip }, () => {
  const target = document.createElement("div");
  const text = createState("hello");
  mount(() => html`<textarea>${() => text.get()}</textarea>`, target);
  const ta = target.querySelector("textarea");

  assert.equal(ta.value, "hello");
  text.set("world");
  flush();
  assert.equal(ta.value, "world");
  // No stray marker text leaked into the raw-text content.
  assert.equal(ta.textContent.includes("zoijs"), false);
});

test("<textarea> with a non-function value sets value once", { skip }, () => {
  const target = document.createElement("div");
  mount(() => html`<textarea>${"static content"}</textarea>`, target);
  assert.equal(target.querySelector("textarea").value, "static content");
});

test("<title> sole ${} binds its textContent", { skip }, () => {
  const target = document.createElement("div");
  const t = createState("Home");
  mount(() => html`<title>${() => t.get()}</title>`, target);
  const title = target.querySelector("title");

  assert.equal(title.textContent, "Home");
  t.set("About");
  flush();
  assert.equal(title.textContent, "About");
});

test("<textarea> content binding coexists with a dynamic attribute", { skip }, () => {
  const target = document.createElement("div");
  const rows = createState(3);
  const body = createState("draft");
  mount(() => html`<textarea rows=${() => rows.get()}>${() => body.get()}</textarea>`, target);
  const ta = target.querySelector("textarea");

  assert.equal(ta.getAttribute("rows"), "3");
  assert.equal(ta.value, "draft");
  rows.set(5);
  body.set("final");
  flush();
  assert.equal(ta.getAttribute("rows"), "5");
  assert.equal(ta.value, "final");
});

test("attribute binding: set, toggle boolean, and remove on null", { skip }, () => {
  const target = document.createElement("div");
  const disabled = createState(false);
  const cls = createState("off");
  mount(() => html`<button disabled=${() => disabled.get()} class=${() => cls.get()}>x</button>`, target);
  const btn = target.querySelector("button");

  assert.equal(btn.hasAttribute("disabled"), false);
  assert.equal(btn.getAttribute("class"), "off");

  disabled.set(true);
  cls.set("on");
  flush();
  assert.equal(btn.hasAttribute("disabled"), true);
  assert.equal(btn.getAttribute("class"), "on");

  cls.set(null);
  flush();
  assert.equal(btn.hasAttribute("class"), false); // removed
});

test("dynamic text renders as inert text (no HTML injection)", { skip }, () => {
  const target = document.createElement("div");
  mount(() => html`<p>${() => "<img src=x onerror=alert(1)>"}</p>`, target);
  assert.equal(target.querySelector("img"), null);
  assert.equal(target.querySelector("p").textContent, "<img src=x onerror=alert(1)>");
});

test("event listeners are removed on unmount", { skip }, () => {
  const target = document.createElement("div");
  let clicks = 0;
  const unmount = mount(() => html`<button onclick=${() => clicks++}>x</button>`, target);
  const btn = target.querySelector("button");

  btn.click();
  assert.equal(clicks, 1);

  unmount();
  btn.click(); // listener gone
  assert.equal(clicks, 1);
});

test("unmount disposes binding effects (no leak / no post-unmount updates)", { skip }, () => {
  const target = document.createElement("div");
  const c = createState(0);
  const unmount = mount(() => html`<span>${() => c.get()}</span>`, target);
  const span = target.querySelector("span");

  unmount();
  c.set(99);
  flush();
  // The binding effect is disposed, so the post-unmount value never reaches the
  // (now detached) node. Cleanup also removes the text node, so content is "".
  assert.notEqual(span.textContent, "99");
});

test("list binding rebuilds in place when its array changes", { skip }, () => {
  const target = document.createElement("div");
  const items = createState(["a", "b"]);
  mount(() => html`<ul>${() => items.get().map((x) => html`<li>${x}</li>`)}</ul>`, target);

  assert.equal(target.querySelectorAll("li").length, 2);
  items.set(["a", "b", "c"]);
  flush();
  assert.equal(target.querySelectorAll("li").length, 3);
  assert.equal(target.querySelectorAll("li")[2].textContent, "c");
});
