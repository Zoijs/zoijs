// Parser/renderer hardening tests — the cases the old heuristic parser missed.

import test from "node:test";
import assert from "node:assert/strict";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { each } from "../src/core/each.js";
import { createState } from "../src/reactivity/state.js";
import { flush } from "../src/reactivity/scheduler.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

function mountInto(component) {
  const target = document.createElement("div");
  mount(component, target);
  return target;
}

test("multiple dynamic attributes on one element", { skip }, () => {
  const t = mountInto(() => html`<a href=${"/x"} title=${"hi"} id=${"link"}>go</a>`);
  const a = t.querySelector("a");
  assert.equal(a.getAttribute("href"), "/x");
  assert.equal(a.getAttribute("title"), "hi");
  assert.equal(a.getAttribute("id"), "link");
});

test("quoted dynamic attribute (whole value)", { skip }, () => {
  const t = mountInto(() => html`<div class="${"box"}">x</div>`);
  assert.equal(t.querySelector("div").getAttribute("class"), "box");
});

test("quoted attribute with static text + holes (multi-part)", { skip }, () => {
  const t = mountInto(() => html`<div class="a ${"b"} c ${"d"}">x</div>`);
  assert.equal(t.querySelector("div").getAttribute("class"), "a b c d");
});

test("unquoted dynamic attribute", { skip }, () => {
  const t = mountInto(() => html`<div data-x=${"42"}>x</div>`);
  assert.equal(t.querySelector("div").getAttribute("data-x"), "42");
});

test("reactive attribute updates in place", { skip }, () => {
  const cls = createState("off");
  const t = mountInto(() => html`<div class=${() => cls.get()}>x</div>`);
  assert.equal(t.querySelector("div").className, "off");
  cls.set("on");
  flush();
  assert.equal(t.querySelector("div").className, "on");
});

test("boolean attribute toggles and removes", { skip }, () => {
  const on = createState(false);
  const t = mountInto(() => html`<button disabled=${() => on.get()}>x</button>`);
  const btn = t.querySelector("button");
  assert.equal(btn.hasAttribute("disabled"), false);
  on.set(true); flush();
  assert.equal(btn.hasAttribute("disabled"), true);
});

test("URL attribute rejects javascript: scheme", { skip }, () => {
  const t = mountInto(() => html`<a href=${"javascript:alert(1)"}>x</a>`);
  assert.equal(t.querySelector("a").hasAttribute("href"), false);
});

test("aria-* and data-* attributes bind", { skip }, () => {
  const t = mountInto(() => html`<div aria-label=${"hello"} data-id=${"7"}>x</div>`);
  assert.equal(t.querySelector("div").getAttribute("aria-label"), "hello");
  assert.equal(t.querySelector("div").getAttribute("data-id"), "7");
});

test("event binding via addEventListener", { skip }, () => {
  let clicks = 0;
  const t = mountInto(() => html`<button onclick=${() => clicks++}>x</button>`);
  t.querySelector("button").click();
  assert.equal(clicks, 1);
});

test("literal < and > in text are not treated as tags", { skip }, () => {
  const t = mountInto(() => html`<p>${"a"} < ${"b"} > c</p>`);
  assert.equal(t.querySelector("p").textContent, "a < b > c");
});

test("a > inside an attribute value does not end the tag", { skip }, () => {
  const t = mountInto(() => html`<div title="a > b" class=${"c"}>x</div>`);
  const div = t.querySelector("div");
  assert.equal(div.getAttribute("title"), "a > b");
  assert.equal(div.getAttribute("class"), "c");
});

test("SVG element with dynamic attributes", { skip }, () => {
  const r = createState(5);
  const t = mountInto(() => html`<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r=${() => r.get()} fill=${"red"}></circle></svg>`);
  const circle = t.querySelector("circle");
  assert.equal(circle.getAttribute("r"), "5");
  assert.equal(circle.getAttribute("fill"), "red");
  assert.equal(circle.namespaceURI, "http://www.w3.org/2000/svg");
  r.set(8); flush();
  assert.equal(circle.getAttribute("r"), "8");
});

test("nested templates render", { skip }, () => {
  const t = mountInto(() => html`<div>${html`<span>inner</span>`}</div>`);
  assert.equal(t.querySelector("div span").textContent, "inner");
});

test("each() inside html()", { skip }, () => {
  const items = createState([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
  const t = mountInto(() => html`<ul>${each(() => items.get(), (x) => x.id, (x) => html`<li>${() => x.name}</li>`)}</ul>`);
  assert.deepEqual([...t.querySelectorAll("li")].map((li) => li.textContent), ["a", "b"]);
});

test("html() with sibling binding after each() (marker collision regression)", { skip }, () => {
  // <li> items carry their own child marker; the sibling <p> must bind to <p>.
  const s = createState([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
  const t = mountInto(
    () => html`<div><ul>${each(() => s.get(), (x) => x.id, (x) => html`<li>${() => x.name}</li>`)}</ul><p>${() => s.get().length}</p></div>`
  );
  assert.equal(t.querySelector("p").textContent, "2");
  s.set([{ id: 1, name: "a" }]); flush();
  assert.equal(t.querySelector("p").textContent, "1");
});

test("element with both a dynamic attribute and child holes", { skip }, () => {
  const cls = createState("x");
  const t = mountInto(() => html`<div class=${() => cls.get()}><span>${"a"}</span>${"b"}</div>`);
  assert.equal(t.querySelector("div").className, "x");
  assert.equal(t.querySelector("span").textContent, "a");
  assert.equal(t.querySelector("div").textContent, "ab");
});

// ---- unsupported patterns: clear errors, never silent corruption -------------

test("dynamic tag name throws a clear error", () => {
  assert.throws(() => html`<${"div"}>x</div>`, /tag name/i);
});

test("dynamic/spread attribute name throws a clear error", () => {
  assert.throws(() => html`<div ${"hidden"}>x</div>`, /attribute name|spread/i);
});

test("interpolation inside <textarea> throws a clear error", () => {
  assert.throws(() => html`<textarea>${"x"}</textarea>`, /textarea/i);
});

test("interpolation inside a comment throws a clear error", () => {
  assert.throws(() => html`<!-- ${"x"} -->`, /comment/i);
});

test("multi-part event handler throws a clear error", () => {
  assert.throws(() => html`<button onclick="a ${() => {}}">x</button>`, /event handler/i);
});
