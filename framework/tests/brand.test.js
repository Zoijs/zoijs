// SEC-1 — Symbol branding of html`…` results and each() markers.
//
// Zoijs used to recognize its own result objects by string properties
// (`__zoijsTemplate: true`, `__zoijsEach: true`). JSON can produce those, so API /
// database / storage data could impersonate a template and have its "static HTML"
// emitted as raw markup. Results are now branded with Symbol.for(...) keys, which
// no JSON (or other string-keyed data) can reproduce. These tests pin that design.
// Forged objects pushed through real render paths are in xss-corpus.test.js
// (client) and ssr/tests/forged-results.test.js (server).

import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { html } from "../src/core/html.js";
import { each } from "../src/core/each.js";
import { mount } from "../src/core/mount.js";
import { isTemplateResult, isEachMarker } from "../src/server.js";
import * as publicApi from "../src/index.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

// ---- genuine results are recognized ----------------------------------------------

test("html`…` results are recognized as template results", () => {
  const name = "Zoijs";
  assert.equal(isTemplateResult(html`<p>Hello ${name}</p>`), true);
  assert.equal(isTemplateResult(html`<p>${() => name}</p>`), true);
  assert.equal(isEachMarker(html`<p>x</p>`), false);
});

test("each() markers are recognized as list markers", () => {
  const marker = each([1], (x) => x, (x) => html`<li>${x}</li>`);
  assert.equal(isEachMarker(marker), true);
  assert.equal(isTemplateResult(marker), false);
});

test("the brands are the globally registered symbols", () => {
  const tpl = html`<p>x</p>`;
  const marker = each([], (x) => x, (x) => x);
  assert.deepEqual(Object.getOwnPropertySymbols(tpl), [Symbol.for("zoijs.template")]);
  assert.deepEqual(Object.getOwnPropertySymbols(marker), [Symbol.for("zoijs.each")]);
  // Symbol.for is a global registry: every evaluation yields the same symbol.
  assert.equal(Symbol.for("zoijs.template"), Symbol.for("zoijs.template"));
});

// ---- non-results are rejected ----------------------------------------------------

test("primitives, null and plain objects are not results", () => {
  for (const v of [null, undefined, 0, 1, "", "<p>", true, false, [], {}, () => {}, Symbol.for("zoijs.template")]) {
    assert.equal(isTemplateResult(v), false, `isTemplateResult(${String(v)})`);
    assert.equal(isEachMarker(v), false, `isEachMarker(${String(v)})`);
  }
});

test("JSON cannot forge a template result — no string key reproduces the Symbol brand", () => {
  const attacker = JSON.parse(`{
    "zoijs.template": true,
    "__zoijsTemplate": true,
    "Symbol(zoijs.template)": true,
    "@@zoijs.template": true,
    "__staticHTML": "<img src=x onerror=alert(1)>",
    "parts": [],
    "values": []
  }`);
  assert.equal(isTemplateResult(attacker), false);
  assert.equal(Object.getOwnPropertySymbols(attacker).length, 0);
});

test("JSON cannot forge an each() marker", () => {
  const attacker = JSON.parse(`{
    "zoijs.each": true,
    "__zoijsEach": true,
    "Symbol(zoijs.each)": true,
    "items": ["<img src=x onerror=alert(1)>"]
  }`);
  assert.equal(isEachMarker(attacker), false);
});

test("a hand-written object using the old string markers is not a result", () => {
  assert.equal(isTemplateResult({ __zoijsTemplate: true, __staticHTML: "<b>x</b>", parts: [], values: [] }), false);
  assert.equal(isEachMarker({ __zoijsEach: true, items: [], keyFn: (x) => x, renderFn: (x) => x }), false);
});

test("forged nested inside other data is still plain data", () => {
  const data = JSON.parse('{"user":{"bio":{"__zoijsTemplate":true,"__staticHTML":"<img>"}},"list":[{"__zoijsEach":true}]}');
  assert.equal(isTemplateResult(data.user.bio), false);
  assert.equal(isEachMarker(data.list[0]), false);
});

// ---- serialization never carries identity ------------------------------------------

// JSON.stringify reads the lazy `template` getter, which builds a DOM <template>.
test("a template result serialized to JSON and parsed back loses its identity", { skip }, () => {
  const template = html`<p>Hello</p>`;
  const json = JSON.stringify(template);
  assert.ok(!json.includes("zoijs.template"), "the brand is not serialized");
  const restored = JSON.parse(json);
  assert.equal(isTemplateResult(restored), false);
});

test("an each() marker serialized to JSON and parsed back loses its identity", () => {
  const restored = JSON.parse(JSON.stringify(each([1, 2], (x) => x, (x) => html`<li>${x}</li>`)));
  assert.equal(isEachMarker(restored), false);
});

test("object spread of a GENUINE result keeps the brand (code copying a result, not data)", { skip }, () => {
  // Own enumerable Symbol keys are copied by spread / Object.assign. That is a
  // copy made by application code from a real html`…` result — it is not a way
  // for data to obtain the brand, which only html()/each() ever attach.
  assert.equal(isTemplateResult({ ...html`<p>x</p>` }), true);
  assert.equal(isEachMarker(Object.assign({}, each([], (x) => x, (x) => x))), true);
});

// ---- the brand stays private --------------------------------------------------------

test("the brand is not a string field and is not exposed by the public API", () => {
  const tpl = html`<p>x</p>`;
  assert.ok(!Object.keys(tpl).some((k) => /zoijs|brand/i.test(k)), "no string brand field");
  assert.deepEqual(
    Object.keys(publicApi).sort(),
    ["boundary", "computed", "configure", "createState", "each", "effect", "html", "mount", "onCleanup"],
    "public surface unchanged — no brand symbol or branding helper exported"
  );
});

// ---- render boundary ----------------------------------------------------------------

test("mount() refuses a forged template instead of trusting its fields", { skip }, () => {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const tplEl = document.createElement("template");
  tplEl.innerHTML = "<img src=x onerror=globalThis.__xss=1>"; // inert inside <template>
  const forged = { __zoijsTemplate: true, template: tplEl, parts: [], values: [] };
  assert.throws(() => mount(() => forged, target), /expected an html`…` template result/);
  assert.throws(() => mount(forged, target), /expected an html`…` template result/);
  assert.equal(target.querySelector("img"), null);
  target.remove();
});

// ---- cross-copy interoperability ------------------------------------------------------
// Two independently evaluated copies of the core (a CDN copy + a local copy, say)
// must still recognize each other's results, because both brand with Symbol.for.
// This covers result branding only, not a shared reactive runtime (CORE-2).

async function loadIndependentCopy() {
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const dir = mkdtempSync(join(tmpdir(), "zoijs-copy-"));
  cpSync(src, dir, { recursive: true });
  const base = pathToFileURL(dir + "/").href;
  const copy = {
    html: (await import(base + "core/html.js")).html,
    each: (await import(base + "core/each.js")).each,
    brand: await import(base + "core/brand.js"),
  };
  return { copy, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("a result created by one copy of the core is recognized by another", async () => {
  const { copy, cleanup } = await loadIndependentCopy();
  try {
    assert.notEqual(copy.html, html, "really a separate module instance");
    assert.equal(copy.brand.TEMPLATE, Symbol.for("zoijs.template"));
    assert.equal(isTemplateResult(copy.html`<p>x</p>`), true);
    assert.equal(isEachMarker(copy.each([], (x) => x, (x) => x)), true);
    assert.equal(copy.brand.isTemplateResult(html`<p>x</p>`), true);
  } finally {
    cleanup();
  }
});

test("this copy's renderer renders another copy's templates and lists", { skip }, async () => {
  const { copy, cleanup } = await loadIndependentCopy();
  try {
    const target = document.createElement("div");
    mount(
      () => copy.html`<ul>${copy.each(["a", "b"], (x) => x, (x) => copy.html`<li>${x}</li>`)}</ul>`,
      target
    );
    assert.deepEqual([...target.querySelectorAll("ul > li")].map((li) => li.textContent), ["a", "b"]);
  } finally {
    cleanup();
  }
});
