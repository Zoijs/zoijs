// CSP-compatible style bindings (L7, found by Zoijs Insight). A strict `style-src` CSP (no
// 'unsafe-inline' / style-src-attr) refuses setAttribute("style", …) — which every style binding
// used in core ≤ 1.9.0 — but allows the CSSOM. Bindings now write `el.style.cssText`; the result
// is the same declarations. Real-browser CSP enforcement: browser-tests/csp.spec.js.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, createState } from "../src/index.js";
import { flush } from "../src/reactivity/scheduler.js";

const host = () => document.body.appendChild(document.createElement("div"));

function styleAttributeWrites(fn) {
  const writes = [];
  const orig = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (String(name).toLowerCase() === "style") writes.push(value);
    return orig.call(this, name, value);
  };
  try {
    fn();
  } finally {
    Element.prototype.setAttribute = orig;
  }
  return writes;
}

test("no setAttribute('style') for object, string, mixed or reactive style bindings", () => {
  const el = host();
  const h = createState(10);
  const writes = styleAttributeWrites(() => {
    mount(
      () => html`<div id="o" style=${() => ({ height: `${h.get()}px` })}></div>
        <i id="s" style=${"color: red"}></i>
        <b id="m" style="width: ${"3px"}; color: blue"></b>
        <p id="up" style=${() => (h.get() > 10 ? "display: none" : "")}></p>`,
      el
    );
    h.set(20);
    flush();
  });
  assert.deepEqual(writes, []);
  assert.equal(el.querySelector("#o").style.height, "20px");
  assert.equal(el.querySelector("#s").style.color, "red");
  assert.equal(el.querySelector("#m").style.width, "3px");
  assert.equal(el.querySelector("#m").style.color, "blue");
  assert.equal(el.querySelector("#up").style.display, "none");
});

test("reactive updates replace the whole declaration list (stale properties are removed)", () => {
  const el = host();
  const s = createState({ color: "red", marginTop: "4px" });
  mount(() => html`<div style=${() => s.get()}></div>`, el);
  const div = el.querySelector("div");
  s.set({ color: "blue" });
  flush();
  assert.equal(div.style.color, "blue");
  assert.equal(div.style.marginTop, "", "a property missing from the new object is removed");
});

test("null/false remove the attribute; an empty string or object clears it", () => {
  const el = host();
  const s = createState({ color: "red" });
  mount(() => html`<div style=${() => s.get()}></div>`, el);
  const div = el.querySelector("div");
  s.set(null);
  flush();
  assert.equal(div.hasAttribute("style"), false);
  s.set({ color: "red" });
  flush();
  s.set(false);
  flush();
  assert.equal(div.hasAttribute("style"), false);
  s.set({});
  flush();
  assert.equal(div.style.length, 0);
  s.set("");
  flush();
  assert.equal(div.style.length, 0);
});

test("custom properties, unitless and unit-bearing values", () => {
  const el = host();
  mount(() => html`<div style=${{ "--gap": "4px", opacity: 0.5, zIndex: 3, width: "50%", lineHeight: 1.5 }}></div>
    <i style=${"--pad: 2px; margin-top: 1em"}></i>`, el);
  const div = el.querySelector("div");
  assert.equal(div.style.getPropertyValue("--gap"), "4px");
  assert.equal(div.style.opacity, "0.5");
  assert.equal(div.style.zIndex, "3");
  assert.equal(div.style.width, "50%");
  const i = el.querySelector("i");
  assert.equal(i.style.getPropertyValue("--pad"), "2px");
  assert.equal(i.style.marginTop, "1em");
});

test("object-form validation is unchanged: declarations can't break out or inject", () => {
  const el = host();
  mount(() => html`<div style=${{ color: "red; background: url(x)", "bad name": "1", width: "1px" }}></div>`, el);
  const div = el.querySelector("div");
  assert.equal(div.style.color, "", "a value carrying ';' is dropped, not split");
  assert.equal(div.style.background, "");
  assert.equal(div.style.width, "1px");
});

test("SVG elements use the CSSOM too", () => {
  const el = host();
  const writes = styleAttributeWrites(() => mount(() => html`<svg><rect style=${{ fill: "red" }} /></svg>`, el));
  assert.deepEqual(writes, []);
  assert.equal(el.querySelector("rect").style.fill, "red");
});
