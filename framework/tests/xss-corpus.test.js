// XSS-corpus regression — a systematic battery of known injection vectors pushed
// through every dynamic channel (text, URL attribute, plain attribute, event),
// asserting none execute or inject. Complements the targeted cases in
// security.test.js with breadth. Real-browser execution is covered by
// browser-tests/security.spec.js + the CSP/Trusted-Types spec.

import test from "node:test";
import assert from "node:assert/strict";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;
const tick = () => new Promise((r) => setTimeout(r));

function render(component) {
  const target = document.createElement("div");
  document.body.appendChild(target); // attached, so any onerror/onload could fire
  mount(component, target);
  return target;
}

// ---- TEXT channel -----------------------------------------------------------
// A value in a text slot must render as inert text — never as markup or script.
const TEXT_PAYLOADS = [
  "<script>globalThis.__xss=1</script>",
  "<img src=x onerror=globalThis.__xss=1>",
  "<svg/onload=globalThis.__xss=1>",
  "<svg><script>globalThis.__xss=1</script></svg>",
  "<iframe src=javascript:globalThis.__xss=1></iframe>",
  "<body onload=globalThis.__xss=1>",
  "<details open ontoggle=globalThis.__xss=1>",
  "<input autofocus onfocus=globalThis.__xss=1>",
  "<style>@import 'x'</style>",
  "<math><mtext></mtext></math>",
  '"><script>globalThis.__xss=1</script>',
  "'><img src=x onerror=globalThis.__xss=1>",
  "<scr<script>ipt>globalThis.__xss=1</scr</script>ipt>",
  "<<script>globalThis.__xss=1</script>",
  "<img src=`x` onerror=globalThis.__xss=1>",
  "javascript:globalThis.__xss=1",
];

test("text slot: a corpus of injection vectors all render inert", { skip }, async () => {
  for (const payload of TEXT_PAYLOADS) {
    globalThis.__xss = undefined;
    const t = render(() => html`<div>${() => payload}</div>`);
    await tick();
    assert.equal(globalThis.__xss, undefined, `executed: ${payload}`);
    assert.equal(
      t.querySelector("script, img, iframe, svg, style, input, details, math, body"),
      null,
      `created an element: ${payload}`
    );
    // rendered verbatim as text — proof it went through a Text node, not innerHTML
    assert.equal(t.querySelector("div").textContent, payload, `not inert text: ${payload}`);
    t.remove();
  }
});

// ---- URL channel ------------------------------------------------------------
// Dangerous schemes must never reach a URL-bearing attribute.
const UNSAFE_URLS = [
  "javascript:globalThis.__xss=1",
  "JaVaScRiPt:globalThis.__xss=1",
  "  javascript:globalThis.__xss=1",
  "java\tscript:globalThis.__xss=1",
  "java\nscript:globalThis.__xss=1",
  "javascript:globalThis.__xss=1",
  "vbscript:msgbox(1)",
  "data:text/html,<script>globalThis.__xss=1</script>",
  "data:image/svg+xml,<svg onload=globalThis.__xss=1>",
  "data:application/javascript,globalThis.__xss=1",
];

test("url attribute: dangerous schemes are never set on href/src", { skip }, () => {
  for (const payload of UNSAFE_URLS) {
    const a = render(() => html`<a href=${() => payload}>x</a>`).querySelector("a");
    assert.equal(a.hasAttribute("href"), false, `href set for: ${JSON.stringify(payload)}`);
    const img = render(() => html`<img src=${() => payload} />`).querySelector("img");
    assert.equal(img.hasAttribute("src"), false, `src set for: ${JSON.stringify(payload)}`);
  }
});

// Legitimate URLs must still pass — guard against over-blocking (false positives).
const SAFE_URLS = [
  "https://example.com",
  "http://example.com/a?b=1&c=2",
  "/relative/path",
  "#fragment",
  "page.html",
  "mailto:a@b.c",
  "tel:+1234567890",
  "data:image/png;base64,iVBORw0KGgo=",
];

test("url attribute: legitimate URLs are preserved (no false positives)", { skip }, () => {
  for (const url of SAFE_URLS) {
    const a = render(() => html`<a href=${() => url}>x</a>`).querySelector("a");
    assert.equal(a.getAttribute("href"), url, `safe URL dropped: ${url}`);
  }
});

// ---- EVENT channel ----------------------------------------------------------
// A string where a handler is expected must never be wired up or evaluated.
const HANDLER_STRINGS = ["globalThis.__xss=1", "alert(1)", "javascript:globalThis.__xss=1"];

test("event attribute: string handlers are ignored, never executed", { skip }, () => {
  for (const s of HANDLER_STRINGS) {
    globalThis.__xss = undefined;
    const btn = render(() => html`<button onclick=${s}>x</button>`).querySelector("button");
    btn.click();
    assert.equal(globalThis.__xss, undefined, `string handler executed: ${s}`);
  }
});

// ---- ATTRIBUTE-VALUE channel -----------------------------------------------
// A payload in an ordinary attribute can't break out of the attribute or inject
// a handler — it is set verbatim via setAttribute.
test("plain attribute: a value cannot break out or inject a handler", { skip }, async () => {
  globalThis.__xss = undefined;
  const payload = '"><img src=x onerror=globalThis.__xss=1>';
  const t = render(() => html`<div title=${() => payload}>x</div>`);
  await tick();
  assert.equal(t.querySelector("img"), null);
  assert.equal(globalThis.__xss, undefined);
  assert.equal(t.querySelector("div").getAttribute("title"), payload); // verbatim, inert
});
