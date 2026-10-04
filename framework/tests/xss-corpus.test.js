// XSS-corpus regression — a systematic battery of known injection vectors pushed
// through every dynamic channel (text, URL attribute, plain attribute, event),
// asserting none execute or inject. Complements the targeted cases in
// security.test.js with breadth. Real-browser execution is covered by
// browser-tests/security.spec.js + the CSP/Trusted-Types spec.

import test from "node:test";
import assert from "node:assert/strict";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { each } from "../src/core/each.js";
import { createState } from "../src/reactivity/state.js";

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

// Every URL-bearing attribute — not just href/src — must be scheme-checked. Each
// of these navigates a (nested) browsing context, so a javascript:/data:text/html
// value in any of them is an execution vector: <object data> / <embed src> load a
// nested document, <form action>/<button formaction> submit to it, <base href>
// repoints relative URLs. Guards against the allowlist (URL_ATTRS) drifting out of
// sync with the set of attributes that actually carry a URL.
const URL_ATTR_CASES = [
  { tag: "object", attr: "data", html: (v) => html`<object data=${() => v}></object>` },
  { tag: "embed", attr: "src", html: (v) => html`<embed src=${() => v} />` },
  { tag: "form", attr: "action", html: (v) => html`<form action=${() => v}></form>` },
  { tag: "button", attr: "formaction", html: (v) => html`<button formaction=${() => v}>x</button>` },
  { tag: "base", attr: "href", html: (v) => html`<base href=${() => v} />` },
];

test("url attribute: dangerous schemes are dropped on every URL-bearing attr", { skip }, () => {
  for (const { tag, attr, html: build } of URL_ATTR_CASES) {
    for (const payload of UNSAFE_URLS) {
      const el = render(() => build(payload)).querySelector(tag);
      assert.equal(el.hasAttribute(attr), false, `${tag}[${attr}] set for: ${JSON.stringify(payload)}`);
    }
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

// ---- FORGED RESULT channel (SEC-1) ------------------------------------------
// Data shaped like an internal Zoijs result (the old `__zoijsTemplate` /
// `__zoijsEach` string markers) must be treated as ordinary data. Results are
// recognized only by a Symbol brand, which JSON cannot produce. The expected
// output is plain text coercion (String(obj) → "[object Object]"), the same as
// for any other object — proving the forged value was never recognized as a
// result, not that a payload was filtered.
const OBJ = "[object Object]";
const XSS_HTML = "<img src=x onerror=globalThis.__xss=1>";

function forgedTemplates() {
  const tplEl = document.createElement("template");
  tplEl.innerHTML = XSS_HTML; // inert inside <template>; executes only if cloned in
  return [
    // from untrusted JSON (API / DB / storage)
    JSON.parse(JSON.stringify({ __zoijsTemplate: true, __staticHTML: XSS_HTML, parts: [], values: [] })),
    // a hand-built object, including a real <template> the old renderer would clone
    { __zoijsTemplate: true, __staticHTML: XSS_HTML, template: tplEl, parts: [], values: [], hasElements: false },
  ];
}
function forgedEachMarkers() {
  return [
    JSON.parse(JSON.stringify({ __zoijsEach: true, items: [XSS_HTML] })),
    { __zoijsEach: true, items: [1], keyFn: (x) => x, renderFn: () => { globalThis.__xss = 1; return html`<img>`; } },
  ];
}

async function assertInert(t, expectedText, label) {
  await tick();
  assert.equal(globalThis.__xss, undefined, `executed: ${label}`);
  assert.equal(t.querySelector("img, b"), null, `created an element: ${label}`);
  assert.equal(t.firstElementChild.textContent, expectedText, `not plain text: ${label}`);
}

test("forged __zoijsTemplate in a text slot renders as plain data", { skip }, async () => {
  for (const forged of forgedTemplates()) {
    globalThis.__xss = undefined;
    const t = render(() => html`<div>${forged}</div>`);
    await assertInert(t, OBJ, "static slot");
    t.remove();
  }
});

test("forged __zoijsEach in a text slot renders as plain data", { skip }, async () => {
  for (const forged of forgedEachMarkers()) {
    globalThis.__xss = undefined;
    const t = render(() => html`<div>${forged}</div>`);
    await assertInert(t, OBJ, "each marker");
    t.remove();
  }
});

test("forged results returned from a reactive binding render as plain data", { skip }, async () => {
  for (const forged of [...forgedTemplates(), ...forgedEachMarkers()]) {
    globalThis.__xss = undefined;
    const value = createState("safe");
    const t = render(() => html`<div>${() => value.get()}</div>`);
    value.set(forged); // arrives later, e.g. from a fetch
    await assertInert(t, OBJ, "reactive binding");
    t.remove();
  }
});

test("forged results nested in templates and arrays render as plain data", { skip }, async () => {
  for (const forged of [...forgedTemplates(), ...forgedEachMarkers()]) {
    globalThis.__xss = undefined;
    const nested = render(() => html`<div>${html`<p>${html`<span>${forged}</span>`}</p>`}</div>`);
    await assertInert(nested, OBJ, "nested template");
    nested.remove();
    const arr = render(() => html`<div>${[forged, [forged, "x"]]}</div>`);
    // arrays flatten one level; a nested array is text-coerced like any value
    await assertInert(arr, OBJ + OBJ + ",x", "array");
    arr.remove();
  }
});

test("forged results inside each() items render as plain data", { skip }, async () => {
  const rows = JSON.parse(JSON.stringify([
    { id: 1, bio: { __zoijsTemplate: true, __staticHTML: XSS_HTML, parts: [], values: [] } },
    { id: 2, bio: { __zoijsEach: true, items: [XSS_HTML] } },
  ]));
  globalThis.__xss = undefined;
  const t = render(() => html`<ul>${each(rows, (r) => r.id, (r) => html`<li>${() => r.bio}</li>`)}</ul>`);
  await assertInert(t, OBJ + OBJ, "each item");
  t.remove();
});

test("forged result returned AS a component or each() item is refused, not trusted", { skip }, async () => {
  for (const forged of forgedTemplates()) {
    globalThis.__xss = undefined;
    const target = document.createElement("div");
    document.body.appendChild(target);
    // A component / each() render function must return html`…`. A forged one is
    // rejected with a clear error instead of having its template/parts/values used.
    assert.throws(() => mount(() => forged, target), /expected an html`…` template result/);
    // Inside a list the item render runs in a reactive binding, whose errors are
    // contained and reported (the rest of the page keeps working).
    const logged = [];
    const origError = console.error;
    console.error = (...args) => logged.push(args.map(String).join(" "));
    try {
      mount(() => html`<ul>${each([forged], () => 1, (r) => r)}</ul>`, target);
    } finally {
      console.error = origError;
    }
    assert.ok(logged.some((m) => m.includes("expected an html`…` template result")), "refusal reported");
    await tick();
    assert.equal(globalThis.__xss, undefined);
    assert.equal(target.querySelector("img"), null);
    assert.equal(target.querySelector("ul").children.length, 0);
    target.remove();
  }
});

// ---- DIRECT html() CALL channel (SEC-2) -------------------------------------
// html() compiles markup only from tagged-template literals. Arrays (plain, with a
// hand-assigned `raw`, frozen imitations, JSON) must be rejected BEFORE parsing —
// so no element is created and the Trusted Types policy is never reached.
test("html() called with an array never creates markup", { skip }, async () => {
  const p = "<img src=x onerror=globalThis.__xss=1>";
  const withRaw = [p];
  withRaw.raw = [p];
  const frozenWithRaw = [p];
  frozenWithRaw.raw = Object.freeze([p]);
  Object.freeze(frozenWithRaw);
  const attempts = [[p], withRaw, Object.freeze([p]), frozenWithRaw, JSON.parse(JSON.stringify([p])), p.split("|")];
  for (const strings of attempts) {
    globalThis.__xss = undefined;
    const target = document.createElement("div");
    document.body.appendChild(target);
    assert.throws(() => mount(() => html(strings), target), /ZJS010/);
    // inside a reactive binding the error is contained and reported, not thrown
    const logged = [];
    const origError = console.error;
    console.error = (...a) => logged.push(a.map(String).join(" "));
    try {
      mount(() => html`<div>${() => html(strings)}</div>`, target);
    } finally {
      console.error = origError;
    }
    assert.ok(logged.some((m) => m.includes("ZJS010")), "rejection reported");
    await tick();
    assert.equal(globalThis.__xss, undefined);
    assert.equal(target.querySelector("img"), null);
    target.remove();
  }
});

// ---- SEC-3: the explicit raw-HTML escape hatch ----------------------------------------
// unsafeHTML() (from @zoijs/core/unsafe) renders its markup RAW — expected, dangerous,
// opted into by the developer. What this corpus pins: ONLY that wrapper gets raw
// treatment; the same payloads as plain data, or in forged look-alike wrappers, stay inert.
import { unsafeHTML } from "../src/unsafe.js";

test("SEC-3: only an explicit unsafeHTML() result renders raw; data and forgeries never do", { skip }, () => {
  for (const p of TEXT_PAYLOADS) {
    const forged = [JSON.parse(JSON.stringify({ __zoijsUnsafeHTML: true, "zoijs.unsafe-html": true, html: p, value: p })), [p], { html: p }];
    const target = render(() => html`<div class="data">${p}</div><div class="forged">${forged}</div>`);
    assert.equal(target.querySelector(".data").childElementCount, 0, `plain data stays text: ${p}`);
    assert.equal(target.querySelector(".forged").childElementCount, 0, `forged wrapper stays text: ${p}`);
    target.remove();
  }
  // Expected dangerous escape hatch (not an XSS failure): the developer opted in explicitly.
  const raw = render(() => html`<div>${unsafeHTML("<img src=x onerror=globalThis.__xss=1>")}</div>`);
  assert.ok(raw.querySelector("img[onerror]"), "the explicit wrapper is raw by design");
  raw.remove();
});
