// SEC-1 regression — forged "template results" must render as ordinary data.
//
// The server used to recognize a template by `value.__zoijsTemplate === true` and
// emit its `__staticHTML` verbatim, so JSON from an API/DB could inject raw markup
// (stored XSS). Recognition is now by a Symbol brand JSON cannot produce. A forged
// object therefore takes the normal path for any object in a text slot: text
// coercion + escaping ("[object Object]"). No payload-specific filtering exists —
// these tests pass because the object is not recognized, which is the point.
// Plain Node, no DOM (like ssr.test.js).

import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { html, each, createState } from "@zoijs/core";
import { renderToString } from "../src/index.js";

const OBJ = "[object Object]";
const XSS = "<img src=x onerror=alert(1)>";

// The exact payload from the Evolution Study's reproduction.
const forgedTemplate = () =>
  JSON.parse(`{
    "__zoijsTemplate": true,
    "__staticHTML": "<img src=x onerror=alert(1)>",
    "parts": [],
    "values": []
  }`);
// A forged template whose parts/values would inject through a child slot.
const forgedWithParts = () =>
  JSON.parse(`{"__zoijsTemplate":true,"__staticHTML":"<div><!--zoijs--></div>","parts":[{"type":"child","hole":0}],"values":["${XSS}"]}`);
const forgedEach = () => JSON.parse(`{"__zoijsEach":true,"items":["${XSS}"]}`);
const forgedHandBuilt = () => ({ __zoijsTemplate: true, __staticHTML: XSS, parts: [], values: [], hasElements: false });

const ALL_FORGED = [forgedTemplate, forgedWithParts, forgedEach, forgedHandBuilt];

function assertNoMarkup(out, label) {
  assert.ok(!out.includes("<img"), `raw markup injected (${label}): ${out}`);
  assert.ok(!out.includes("<div>"), `forged skeleton emitted (${label}): ${out}`);
}

test("the reproduced payload renders as escaped data, not HTML", () => {
  const bio = forgedTemplate(); // e.g. a user's profile field from the database
  const out = renderToString(() => html`<p>${bio}</p>`);
  assert.equal(out, `<p>${OBJ}</p>`);
});

test("forged template / each objects in a text slot render as plain data", () => {
  for (const make of ALL_FORGED) {
    const out = renderToString(() => html`<p>${make()}</p>`);
    assert.equal(out, `<p>${OBJ}</p>`, make.name);
  }
});

test("forged objects returned from reactive bindings render as plain data", () => {
  for (const make of ALL_FORGED) {
    const state = createState(make());
    const out = renderToString(() => html`<p>${() => state.get()}</p>`);
    assert.equal(out, `<p>${OBJ}</p>`, make.name);
  }
});

test("forged objects nested in templates and arrays render as plain data", () => {
  for (const make of ALL_FORGED) {
    const nested = renderToString(() => html`<div>${html`<p>${html`<b>${make()}</b>`}</p>`}</div>`);
    assert.equal(nested, `<div><p><b>${OBJ}</b></p></div>`, make.name);
    const arr = renderToString(() => html`<p>${[make(), "x", make()]}</p>`);
    assert.equal(arr, `<p>${OBJ}x${OBJ}</p>`, make.name);
  }
});

test("forged objects inside each() items render as plain data", () => {
  const rows = JSON.parse(`[{"id":1,"bio":{"__zoijsTemplate":true,"__staticHTML":"${XSS}"}},{"id":2,"bio":{"__zoijsEach":true,"items":["${XSS}"]}}]`);
  const out = renderToString(() => html`<ul>${each(rows, (r) => r.id, (r) => html`<li>${r.bio}</li>`)}</ul>`);
  assert.equal(out, `<ul><li>${OBJ}</li><li>${OBJ}</li></ul>`);
  // a render function that returns the forged object itself
  const out2 = renderToString(() => html`<ul>${each(rows, (r) => r.id, (r) => r.bio)}</ul>`);
  assertNoMarkup(out2, "renderFn returning data");
  assert.equal(out2, `<ul>${OBJ}${OBJ}</ul>`);
});

test("a forged object passed as the whole component renders as plain data", () => {
  for (const make of ALL_FORGED) {
    assert.equal(renderToString(make()), OBJ, make.name);
    assert.equal(renderToString(() => make()), OBJ, make.name);
    assert.equal(renderToString(() => make(), { hydratable: true }), OBJ, make.name);
  }
});

test("forged objects in attribute positions are text-coerced and escaped", () => {
  const out = renderToString(() => html`<p title=${forgedTemplate()} data-x=${() => forgedEach()}>x</p>`);
  assert.equal(out, `<p title="${OBJ}" data-x="${OBJ}">x</p>`);
});

// ---- genuine templates are unchanged -------------------------------------------------

test("legitimate templates, nesting, reactivity and lists still render", () => {
  const name = "Zoijs";
  assert.equal(renderToString(() => html`<p>Hello ${name}</p>`), "<p>Hello Zoijs</p>");
  const count = createState(2);
  assert.equal(
    renderToString(() => html`<div>${html`<p>${() => count.get() * 21}</p>`}</div>`),
    "<div><p>42</p></div>"
  );
  assert.equal(
    renderToString(() => html`<ul>${each(["a", "<b>"], (x) => x, (x) => html`<li>${x}</li>`)}</ul>`),
    "<ul><li>a</li><li>&lt;b&gt;</li></ul>"
  );
});

// ---- cross-copy ------------------------------------------------------------------------

test("templates from an independent copy of the core render on the server", async () => {
  // Resolve the linked core, copy its source to a temp dir, and import that copy —
  // a separate module instance, as with a CDN copy alongside a local one.
  const coreEntry = createRequire(import.meta.url).resolve("@zoijs/core");
  const dir = mkdtempSync(join(tmpdir(), "zoijs-ssr-copy-"));
  try {
    cpSync(dirname(coreEntry), dir, { recursive: true });
    const copy = await import(pathToFileURL(join(dir, "index.js")).href);
    assert.notEqual(copy.html, html);
    const out = renderToString(() => copy.html`<ul>${copy.each(["a"], (x) => x, (x) => copy.html`<li>${x}</li>`)}</ul>`);
    assert.equal(out, "<ul><li>a</li></ul>");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
