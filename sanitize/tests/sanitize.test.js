// Unit tests for @zoijs/sanitize — the allowlist, the URL/attribute guards, and an
// XSS corpus. Real-browser execution (where a surviving handler would actually fire)
// is covered by browser-tests/sanitize.spec.js.

import test from "node:test";
import assert from "node:assert/strict";
import { sanitize } from "../src/index.js";

// Serialize the returned nodes back to a comparable HTML string.
function out(dirty) {
  const wrap = document.createElement("div");
  for (const n of sanitize(dirty)) wrap.appendChild(n);
  return wrap.innerHTML;
}
// True if the sanitized output contains an element matching `sel`.
function has(dirty, sel) {
  const wrap = document.createElement("div");
  for (const n of sanitize(dirty)) wrap.appendChild(n);
  return !!wrap.querySelector(sel);
}

test("nullish / empty input → empty array", () => {
  assert.deepEqual(sanitize(null), []);
  assert.deepEqual(sanitize(undefined), []);
  assert.deepEqual(sanitize(""), []);
});

test("safe formatting is preserved", () => {
  assert.equal(out("<p>Hello <strong>world</strong> &amp; <em>friends</em></p>"),
    "<p>Hello <strong>world</strong> &amp; <em>friends</em></p>");
  assert.equal(out("<ul><li>a</li><li>b</li></ul>"), "<ul><li>a</li><li>b</li></ul>");
});

test("plain text is kept verbatim (inert)", () => {
  assert.equal(out("just text, no tags"), "just text, no tags");
});

// ---- dangerous elements dropped --------------------------------------------

test("script/style/iframe/object/embed are removed entirely", () => {
  assert.equal(has("<script>window.__xss=1</script><p>ok</p>", "script"), false);
  assert.equal(has("<style>body{}</style><p>ok</p>", "style"), false);
  assert.equal(has("<iframe src='javascript:1'></iframe>", "iframe"), false);
  assert.equal(has("<object data='javascript:1'></object>", "object"), false);
  assert.equal(has("<embed src='x'>", "embed"), false);
  // the surrounding safe content survives
  assert.match(out("<script>x</script><p>ok</p>"), /<p>ok<\/p>/);
});

test("foreign content (svg/math) is removed — the main mutation-XSS class", () => {
  assert.equal(has("<svg><script>window.__xss=1</script></svg>", "svg, script"), false);
  assert.equal(has("<math><mtext></mtext></math>", "math"), false);
});

test("unknown / interactive elements are dropped", () => {
  assert.equal(has("<form><input value='x'></form>", "form, input"), false);
  assert.equal(has("<custom-el>x</custom-el>", "custom-el"), false);
  assert.equal(has("<template><p>x</p></template>", "template"), false);
});

// ---- dangerous attributes stripped -----------------------------------------

test("event handlers are stripped", () => {
  assert.equal(out('<p onclick="window.__xss=1">hi</p>'), "<p>hi</p>");
  assert.equal(out('<img src="ok.png" onerror="window.__xss=1">'), '<img src="ok.png">');
});

test("style attribute is dropped (CSS injection surface)", () => {
  assert.equal(out('<p style="background:url(https://evil/)">hi</p>'), "<p>hi</p>");
});

test("srcdoc and unknown attributes are stripped", () => {
  assert.equal(out('<div srcdoc="<script>">x</div>'), "<div>x</div>");
  assert.equal(out('<p foo="bar" data-ok="1" aria-label="hi" class="c">x</p>'),
    '<p data-ok="1" aria-label="hi" class="c">x</p>');
});

// ---- URL scheme checks ------------------------------------------------------

test("dangerous URL schemes are dropped on href/src/cite", () => {
  assert.equal(out('<a href="javascript:window.__xss=1">x</a>'), "<a>x</a>");
  assert.equal(out('<a href="  javascript:1">x</a>'), "<a>x</a>");
  assert.equal(out('<a href="java\tscript:1">x</a>'), "<a>x</a>");
  assert.equal(out('<img src="data:text/html,<script>">'), "<img>");
  assert.equal(out('<blockquote cite="javascript:1">q</blockquote>'), "<blockquote>q</blockquote>");
});

test("safe URLs are preserved", () => {
  assert.equal(out('<a href="https://example.com/a?b=1">x</a>'), '<a href="https://example.com/a?b=1">x</a>');
  assert.equal(out('<a href="/relative">x</a>'), '<a href="/relative">x</a>');
  assert.equal(out('<a href="mailto:a@b.c">x</a>'), '<a href="mailto:a@b.c">x</a>');
  assert.match(out('<img src="data:image/png;base64,AAAA">'), /src="data:image\/png/);
});

test("target=_blank links are hardened with rel=noopener noreferrer", () => {
  const html = out('<a href="https://x.com" target="_blank">x</a>');
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="[^"]*noopener[^"]*"/);
  assert.match(html, /rel="[^"]*noreferrer[^"]*"/);
});

test("existing rel tokens are preserved when hardening", () => {
  const html = out('<a href="https://x.com" target="_blank" rel="nofollow">x</a>');
  assert.match(html, /nofollow/);
  assert.match(html, /noopener/);
});

// ---- comments and misc ------------------------------------------------------

test("comments are removed", () => {
  assert.equal(out("<p>a</p><!-- comment --><p>b</p>"), "<p>a</p><p>b</p>");
});

// ---- XSS corpus -------------------------------------------------------------

const CORPUS = [
  "<script>window.__xss=1</script>",
  "<img src=x onerror=window.__xss=1>",
  "<svg/onload=window.__xss=1>",
  "<svg><script>window.__xss=1</script></svg>",
  "<iframe src=javascript:window.__xss=1></iframe>",
  "<body onload=window.__xss=1>",
  "<details open ontoggle=window.__xss=1>",
  "<input autofocus onfocus=window.__xss=1>",
  "<a href=javascript:window.__xss=1>x</a>",
  '<img src=`x` onerror=window.__xss=1>',
  "<object data=data:text/html,<script>window.__xss=1</script>></object>",
  "<form action=javascript:1><button>go</button></form>",
  "<style>@import 'evil.css'</style>",
  "<base href=javascript:1>",
];

test("XSS corpus: no handler attribute, script, or dangerous scheme survives", () => {
  for (const payload of CORPUS) {
    const wrap = document.createElement("div");
    for (const n of sanitize(payload)) wrap.appendChild(n);
    // no script/svg/iframe/object/form/style/base elements
    assert.equal(
      wrap.querySelector("script, svg, iframe, object, embed, form, input, style, base, math"),
      null,
      `dangerous element survived: ${payload}`
    );
    // no on* attribute anywhere
    for (const el of wrap.querySelectorAll("*")) {
      for (const attr of el.attributes) {
        assert.equal(attr.name.toLowerCase().startsWith("on"), false, `on* survived: ${payload} → ${attr.name}`);
      }
    }
    // no javascript:/data:text/html URL survived
    assert.doesNotMatch(wrap.innerHTML, /javascript:|data:text\/html/i, `dangerous URL survived: ${payload}`);
  }
});
