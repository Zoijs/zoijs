// SEC-2 — html() compiles markup only from tagged-template literals.
//
// Calling html() directly with an array used to compile that array as markup —
// a hidden innerHTML that also passed the Trusted Types policy. html() now
// requires the exact shape the engine passes a tag (a frozen array with an own,
// non-enumerable, frozen `raw` array), checked once per call site before parsing.
// Arrays built from data or by ordinary runtime code are rejected.
//
// LIMITATION (pinned below): JavaScript has no way to tell a tagged-template
// object from one deliberately rebuilt with Object.defineProperty + Object.freeze
// (`Array.isTemplateObject` is an unshipped proposal). That requires explicit,
// purpose-written code — the same authority as writing `el.innerHTML` — and is
// caught statically by the `zoijs/no-html-call` lint rule.

import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { html } from "../src/core/html.js";
import { each } from "../src/core/each.js";
import { mount } from "../src/core/mount.js";
import { createState } from "../src/reactivity/state.js";
import { isTemplateResult } from "../src/server.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;
const tick = () => new Promise((r) => setTimeout(r));
const XSS = "<img src=x onerror=globalThis.__xss=1>";
const REJECT = /ZJS010: use html as a tagged template/;

// ---- what the engine actually passes ---------------------------------------------

test("a real tagged-template strings object: frozen array, own non-enumerable frozen raw", () => {
  const tag = (s) => s;
  const s = tag`a${1}b`;
  const raw = Object.getOwnPropertyDescriptor(s, "raw");
  assert.equal(Array.isArray(s), true);
  assert.equal(Object.isFrozen(s), true);
  assert.equal(raw.enumerable, false);
  assert.equal(raw.writable, false);
  assert.equal(Array.isArray(raw.value), true);
  assert.equal(Object.isFrozen(raw.value), true);
  assert.equal(tag`x` === tag`x`, false, "each call SITE has its own object");
  const site = () => tag`same`;
  assert.equal(site(), site(), "…reused every time that site runs (the cache key)");
});

// ---- rejected inputs --------------------------------------------------------------

const imitations = {
  "plain array": () => [XSS],
  "array with assigned raw": () => { const a = [XSS]; a.raw = [XSS]; return a; },
  "frozen array, no raw": () => Object.freeze([XSS]),
  "frozen array with assigned (enumerable) raw": () => { const a = [XSS]; a.raw = Object.freeze([XSS]); return Object.freeze(a); },
  "frozen array, non-enumerable but UNfrozen raw": () => Object.freeze(Object.defineProperty([XSS], "raw", { value: [XSS] })),
  "frozen array, raw inherited from prototype": () => Object.freeze(Object.setPrototypeOf([XSS], Object.assign(Object.create(Array.prototype), { raw: Object.freeze([XSS]) }))),
  "frozen array-like object (not an array)": () => Object.freeze(Object.defineProperty({ 0: XSS, length: 1 }, "raw", { value: Object.freeze([XSS]) })),
  "JSON.parse array": () => JSON.parse(JSON.stringify([XSS])),
  "JSON.parse object with raw": () => JSON.parse(JSON.stringify({ 0: XSS, length: 1, raw: [XSS] })),
  "String#split": () => `${XSS}|x`.split("|"),
  "structuredClone of a real template": () => structuredClone((() => { const t = (s) => s; return t`<b>`; })()),
  "a plain string": () => XSS,
  "undefined": () => undefined,
  "null": () => null,
};

test("html() rejects every imitation before any parsing", () => {
  for (const [name, make] of Object.entries(imitations)) {
    assert.throws(() => html(make()), REJECT, name);
  }
});

test("html.call / html.apply / Reflect.apply with an array are rejected", () => {
  assert.throws(() => html.call(null, [XSS]), REJECT);
  assert.throws(() => html.apply(null, [[XSS]]), REJECT);
  assert.throws(() => Reflect.apply(html, null, [[XSS]]), REJECT);
});

test("a Proxy over a genuine template cannot substitute different markup", () => {
  const real = ((s) => s)`<p>safe</p>`;
  const lying = new Proxy(real, { get: (t, k) => (k === "0" ? XSS : Reflect.get(t, k)) });
  // The genuine object's frozen, non-configurable entries bind the proxy: the
  // engine refuses to let `get` report a different value (Proxy invariant).
  assert.throws(() => html(lying), TypeError);
});

test("a rejected call reaches no DOM: it throws synchronously from html()", { skip }, () => {
  globalThis.__xss = undefined;
  const root = document.createElement("div");
  document.body.appendChild(root);
  assert.throws(() => mount(() => html([XSS]), root), REJECT);
  assert.equal(root.querySelector("img"), null);
  assert.equal(document.querySelector("img[onerror]"), null);
  assert.equal(globalThis.__xss, undefined);
  root.remove();
});

// ---- legitimate templates are unchanged -------------------------------------------

test("tagged templates still work: static, values, reactive, nested, each, uncalled component", { skip }, async () => {
  const name = "Zoijs";
  const count = createState(1);
  const show = createState(true);
  const Child = () => html`<em>child ${() => count.get()}</em>`;
  const root = document.createElement("div");
  const unmount = mount(() => html`
    <div class="a">Hello</div>
    <div class="b">${name}</div>
    <section class="c">${() => count.get()}</section>
    <p class="d">${html`<b>${html`<i>deep</i>`}</b>`}</p>
    <ul>${each([1, 2], (x) => x, (x) => html`<li>${x}</li>`)}</ul>
    <div class="e">${() => (show.get() ? Child : null)}</div>`, root);
  count.set(2);
  await tick();
  const q = (s) => root.querySelector(s).textContent;
  assert.deepEqual([q(".a"), q(".b"), q(".c"), q(".d"), q("ul"), q(".e")], ["Hello", "Zoijs", "2", "deep", "12", "child 2"]);
  unmount();
});

test("the check runs on a cache miss only; repeated call sites reuse the compiled template", () => {
  const site = (v) => html`<p>${v}</p>`;
  const a = site(1);
  const b = site(2);
  assert.equal(a.parts, b.parts, "same compiled parts — second call was a cache hit");
  assert.equal(isTemplateResult(a) && isTemplateResult(b), true);
});

test("templates from another copy of the core still work, and that copy rejects arrays too", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "zoijs-sec2-"));
  try {
    cpSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src"), dir, { recursive: true });
    return import(pathToFileURL(join(dir, "index.js")).href).then((B) => {
      assert.throws(() => B.html([XSS]), REJECT);
      const root = document.createElement("div");
      mount(() => B.html`<p>${"from B"}</p>`, root);
      assert.equal(root.textContent, "from B");
    });
  } finally {
    setTimeout(() => rmSync(dir, { recursive: true, force: true }));
  }
});

// ---- documented limitation -------------------------------------------------------------

test("LIMITATION (documented): a deliberately rebuilt template object is indistinguishable", () => {
  // Only purpose-written code can do this (data cannot); it is equivalent to writing
  // el.innerHTML directly and is flagged statically by zoijs/no-html-call.
  const forged = Object.freeze(
    Object.defineProperty(["<b>forged</b>"], "raw", { value: Object.freeze(["<b>forged</b>"]) })
  );
  assert.equal(isTemplateResult(html(forged)), true);
});
