// Tests for html() — the template compiler.

import test from "node:test";
import assert from "node:assert/strict";
import { html } from "../src/core/html.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

test("html() keeps values separate and classifies a text slot as a child part", { skip }, () => {
  const result = html`<p>${"hi"}</p>`;
  assert.ok(result.template);
  assert.deepEqual(result.values, ["hi"]);
  assert.equal(result.parts.length, 1);
  assert.equal(result.parts[0].type, "child");
});

test("html() classifies an event slot as an element attribute part", { skip }, () => {
  const handler = () => {};
  const result = html`<button onclick=${handler}>go</button>`;
  assert.equal(result.parts.length, 1);
  assert.equal(result.parts[0].type, "element");
  const attr = result.parts[0].attrs[0];
  assert.equal(attr.name, "onclick");
  assert.equal(attr.event, true);
});
