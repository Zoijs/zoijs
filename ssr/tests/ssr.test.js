// Server-side tests for renderToString — these run in PLAIN NODE with no DOM and
// no dependencies, which is the whole point: a component renders to a string on a
// server. (No --import setup here.)

import test from "node:test";
import assert from "node:assert/strict";
import { html, each, createState, computed } from "@zoijs/core";
import { renderToString } from "../src/index.js";

test("runs with no DOM present", () => {
  assert.equal(typeof document, "undefined"); // proves we're DOM-free
});

test("renders text from a function binding", () => {
  const count = createState(41);
  const out = renderToString(() => html`<p>${() => count.get() + 1}</p>`);
  assert.equal(out, "<p>42</p>");
});

test("renders static and dynamic attributes", () => {
  const out = renderToString(() => html`<a class="link" href=${"/about"} title=${() => "Go"}>x</a>`);
  assert.equal(out, '<a class="link" href="/about" title="Go">x</a>');
});

test("escapes text content", () => {
  const out = renderToString(() => html`<p>${() => "<script>alert(1)</script> & <b>"}</p>`);
  assert.equal(out, "<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;</p>");
  assert.ok(!out.includes("<script>"));
});

test("escapes attribute values (no breakout)", () => {
  const out = renderToString(() => html`<div title=${'a" onmouseover="x'}>x</div>`);
  assert.equal(out, '<div title="a&quot; onmouseover=&quot;x">x</div>');
});

test("drops event handlers and refs", () => {
  const out = renderToString(() => html`<button onclick=${() => {}} ref=${(el) => el}>Go</button>`);
  assert.equal(out, "<button>Go</button>");
});

test("URL attributes: safe kept, dangerous schemes dropped", () => {
  assert.equal(renderToString(() => html`<a href=${"https://ok.com"}>x</a>`), '<a href="https://ok.com">x</a>');
  assert.equal(renderToString(() => html`<a href=${"/rel"}>x</a>`), '<a href="/rel">x</a>');
  assert.equal(renderToString(() => html`<a href=${"javascript:alert(1)"}>x</a>`), "<a>x</a>");
  assert.equal(renderToString(() => html`<a href=${"java\tscript:alert(1)"}>x</a>`), "<a>x</a>"); // control-char bypass
});

test("data: URLs — raster image allowed, text/html rejected", () => {
  assert.match(renderToString(() => html`<img src=${"data:image/png;base64,AAAA"} />`), /src="data:image\/png/);
  assert.equal(renderToString(() => html`<img src=${"data:text/html,<script>"} />`), "<img/>");
});

test("unsafe attribute names are refused", () => {
  // srcdoc is a raw-HTML sink; onload is an event-handler name.
  assert.equal(renderToString(() => html`<iframe srcdoc=${"<script>"}></iframe>`), "<iframe></iframe>");
});

test("boolean attributes: true → bare, false/null → omitted", () => {
  assert.equal(renderToString(() => html`<input disabled=${true} />`), '<input disabled=""/>');
  assert.equal(renderToString(() => html`<input disabled=${false} />`), "<input/>");
  assert.equal(renderToString(() => html`<input disabled=${null} />`), "<input/>");
});

test("value and checked serialize to markup form", () => {
  assert.equal(renderToString(() => html`<input value=${"hi"} checked=${true} />`), '<input value="hi" checked/>');
  assert.equal(renderToString(() => html`<input value=${0} checked=${false} />`), '<input value="0"/>');
});

test("nested templates compose", () => {
  const Item = (t) => html`<li>${() => t}</li>`;
  const out = renderToString(() => html`<ul>${Item("a")}${Item("b")}</ul>`);
  assert.equal(out, "<ul><li>a</li><li>b</li></ul>");
});

test("each() lists render in order", () => {
  const todos = createState([{ id: 1, t: "one" }, { id: 2, t: "two" }]);
  const out = renderToString(
    () => html`<ul>${each(() => todos.get(), (x) => x.id, (x) => html`<li>${() => x.t}</li>`)}</ul>`
  );
  assert.equal(out, "<ul><li>one</li><li>two</li></ul>");
});

test("conditionals: falsy renders nothing", () => {
  const show = createState(false);
  const out = renderToString(() => html`<div>${() => show.get() && html`<span>hi</span>`}</div>`);
  assert.equal(out, "<div></div>");
});

test("computed values render", () => {
  const n = createState(3);
  const doubled = computed(() => n.get() * 2);
  assert.equal(renderToString(() => html`<b>${() => doubled.get()}</b>`), "<b>6</b>");
});

test("arrays of values concatenate", () => {
  const out = renderToString(() => html`<p>${() => ["a", "b", "c"]}</p>`);
  assert.equal(out, "<p>abc</p>");
});

test("a raw DOM node throws a clear error", () => {
  assert.throws(() => renderToString(() => html`<p>${() => ({ nodeType: 1 })}</p>`), /raw DOM node/);
});

test("accepts a result directly, not just a function", () => {
  assert.equal(renderToString(html`<p>hi</p>`), "<p>hi</p>");
});
