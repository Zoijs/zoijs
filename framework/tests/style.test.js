// style binding — the safe object form and the risky-string dev warning.
// Object-form style applies through a string built from an object (never string
// concatenation), so a value can't break out of the attribute or inject extra
// declarations. A string style is still allowed (legit uses exist) but a risky
// token earns a one-time dev warning steering you to the object form.

import test from "node:test";
import assert from "node:assert/strict";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { createState } from "../src/reactivity/state.js";
import { configure } from "../src/reactivity/env.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;
const tick = () => new Promise((r) => setTimeout(r));

function render(component) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  mount(component, target);
  return target;
}

test("object style: applied per property; camelCase hyphenated", { skip }, () => {
  const el = render(() => html`<div style=${{ color: "red", backgroundColor: "blue" }}>x</div>`).querySelector("div");
  assert.equal(el.style.color, "red");
  assert.equal(el.style.backgroundColor, "blue");
});

test("object style: custom properties and numeric/zero values", { skip }, () => {
  const el = render(() => html`<div style=${{ "--gap": "4px", opacity: 0, zIndex: 5 }}>x</div>`).querySelector("div");
  assert.equal(el.style.getPropertyValue("--gap"), "4px");
  assert.equal(el.style.opacity, "0"); // 0 must not be dropped
  assert.equal(el.style.zIndex, "5");
});

test("object style: null/false/undefined properties are skipped", { skip }, () => {
  const el = render(() => html`<div style=${{ color: "red", margin: null, padding: false }}>x</div>`).querySelector("div");
  assert.equal(el.style.color, "red");
  assert.equal(el.style.margin, "");
  assert.equal(el.style.padding, "");
});

test("object style: a value cannot inject extra declarations", { skip }, () => {
  // A ";"-laden value would, via naive concatenation, add a second declaration.
  const el = render(() => html`<div style=${{ width: "10px; position: fixed; top: 0", color: "red" }}>x</div>`)
    .querySelector("div");
  assert.equal(el.style.position, "", "must not have injected position:fixed");
  assert.equal(el.style.top, "");
  assert.equal(el.style.width, "", "the poisoned declaration is dropped whole");
  assert.equal(el.style.color, "red", "clean declarations still apply");
});

test("object style: reactive updates replace the previous declarations", { skip }, async () => {
  const s = createState({ color: "red" });
  const el = render(() => html`<div style=${() => s.get()}>x</div>`).querySelector("div");
  assert.equal(el.style.color, "red");
  s.set({ background: "green" });
  await tick();
  assert.equal(el.style.background, "green");
  assert.equal(el.style.color, "", "the old property is gone, not merged");
});

test("string style: still applied verbatim (unchanged behavior)", { skip }, () => {
  const el = render(() => html`<div style=${() => "width: 50%"}>x</div>`).querySelector("div");
  assert.equal(el.style.width, "50%");
});

test("string style: a risky token warns once in dev, never blocks", { skip }, async () => {
  configure({ dev: true });
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const s = createState("background: url(https://example.com/pixel.png)");
    const el = render(() => html`<div style=${() => s.get()}>x</div>`).querySelector("div");
    assert.match(el.getAttribute("style"), /url\(/, "still applied — not blocked");
    s.set("background: url(https://example.com/other.png)"); // second risky update
    await tick();
    const styleWarnings = warnings.filter((w) => /style/i.test(w));
    assert.equal(styleWarnings.length, 1, "deduped: warns once per element, not per update");
    assert.match(styleWarnings[0], /object form/i);
  } finally {
    console.warn = original;
  }
});

test("string style: a clean value does not warn", { skip }, () => {
  configure({ dev: true });
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    render(() => html`<div style=${() => "color: red; font-weight: bold"}>x</div>`);
    assert.equal(warnings.filter((w) => /style/i.test(w)).length, 0);
  } finally {
    console.warn = original;
  }
});
