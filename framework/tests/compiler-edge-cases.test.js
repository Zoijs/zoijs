// CORE-4 — template-compiler edge cases: compile correctly or fail at compile time.
//
//   1. `attr=${x}/>`  — the "/" self-closes the tag; it was appended to the value.
//   2. `.prop=` / `?attr=` / `@event=` (and other non-HTML names) on a binding compiled,
//      then threw InvalidCharacterError at render (or, for @event, CALLED the handler as
//      a reactive getter). Now rejected while compiling html`…`, in every mode.
//      ⚠ These sigils are reserved: if they are ever implemented (CSS-3), update the
//      "reserved sigils" tests below on purpose.
//   3. Arrays / plain objects on ordinary attributes stringify silently → dev warning.
//   4. Character references in the static text of a mixed attribute value were set
//      literally ("Tom &amp;amp; Ann") → decoded as the HTML parser decodes them.

import test from "node:test";
import assert from "node:assert/strict";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { createState } from "../src/reactivity/state.js";
import { flush } from "../src/reactivity/scheduler.js";
import { configure } from "../src/reactivity/env.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

function mountInto(component) {
  const target = document.createElement("div");
  mount(component, target);
  return target;
}

function captureWarnings(fn) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return warnings;
}

// ---- 1. self-closing tags after an unquoted binding ---------------------------------

test("an unquoted binding before `/>` keeps its exact value (all whitespace/quote variants)", { skip }, () => {
  const url = "/x.png";
  const cases = {
    "src=${url}/>": () => html`<img src=${url}/>`,
    "src=${url} />": () => html`<img src=${url} />`,
    "src=${url}>": () => html`<img src=${url}>`,
    'src="${url}"/>': () => html`<img src="${url}"/>`,
    "src='${url}'/>": () => html`<img src='${url}'/>`,
    "src=${url}\\n/>": () => html`<img src=${url}
/>`,
    "src=${url}\\t/>": () => html`<img src=${url}	/>`,
  };
  for (const [label, tpl] of Object.entries(cases)) {
    const img = mountInto(tpl).querySelector("img");
    assert.equal(img.getAttribute("src"), "/x.png", label);
  }
});

test("input value before `/>` is exact, with or without a space", { skip }, () => {
  assert.equal(mountInto(() => html`<input value=${"v"}/>`).querySelector("input").value, "v");
  assert.equal(mountInto(() => html`<input value=${"v"} />`).querySelector("input").value, "v");
});

test("slashes that belong to the value are kept", { skip }, () => {
  const a = (tpl) => mountInto(tpl).querySelector("a").getAttribute("href");
  assert.equal(a(() => html`<a href=/foo/bar>x</a>`), "/foo/bar", "static unquoted");
  assert.equal(a(() => html`<a href=${"/foo/bar"}>x</a>`), "/foo/bar");
  assert.equal(a(() => html`<a href=${"/foo/bar"}/>x</a>`), "/foo/bar");
  assert.equal(a(() => html`<a href=${"/a"}/${"b"}>x</a>`), "/a/b", "a slash between two holes is value text");
  assert.equal(a(() => html`<a href=/p/${"x"}/q>x</a>`), "/p/x/q", "mixed unquoted value with slashes");
  assert.equal(a(() => html`<a href=/p/${"x"}/>x</a>`), "/p/x", "mixed value: only the self-closing / is dropped");
});

test("a handler before `/>` is a single-value event binding (it used to throw)", { skip }, () => {
  let clicks = 0;
  const t = mountInto(() => html`<input onclick=${() => clicks++}/>`);
  t.querySelector("input").click();
  assert.equal(clicks, 1);
});

// ---- 2. reserved / non-HTML binding names (CSS-3 reserved sigils) ---------------------

const RESERVED = /Zoijs template: unsupported bound attribute/;

test("reserved sigils: .prop, ?attr and @event are refused at compile time with the supported form", () => {
  assert.throws(() => html`<input .value=${"x"}>`, (e) => RESERVED.test(e.message) && /use value=\$\{…\} or a ref/.test(e.message));
  assert.throws(() => html`<button ?disabled=${true}>b</button>`, (e) => RESERVED.test(e.message) && /use disabled=\$\{…\} \(false\/null removes it\)/.test(e.message));
  assert.throws(() => html`<button @click=${() => {}}>b</button>`, (e) => RESERVED.test(e.message) && /use onclick=\$\{…\}/.test(e.message));
  assert.throws(() => html`<input .value="${"x"}">`, RESERVED, "quoted form too");
  assert.throws(() => html`<a ?hidden="a-${"x"}">b</a>`, RESERVED, "mixed form too");
});

test("other framework-style names that setAttribute can't take are refused too", () => {
  for (const tpl of [() => html`<i [x]=${1}></i>`, () => html`<i (click)=${1}></i>`, () => html`<i *if=${1}></i>`, () => html`<i #ref=${1}></i>`]) {
    assert.throws(tpl, /unsupported bound attribute/);
  }
});

test("plain names still bind: data-*, aria-*, xlink:, _x, :x, non-ASCII", { skip }, () => {
  const el = mountInto(() => html`<i data-a=${1} aria-label=${"l"} _x=${2} :y=${3} é=${4}></i>`).querySelector("i");
  assert.equal(el.getAttribute("data-a"), "1");
  assert.equal(el.getAttribute(":y"), "3");
  assert.equal(el.getAttribute("é"), "4");
});

test("static (unbound) attributes with these prefixes are plain HTML and stay allowed", { skip }, () => {
  const el = mountInto(() => html`<button @click="go" x-on:click="go">${"b"}</button>`).querySelector("button");
  assert.equal(el.getAttribute("@click"), "go");
});

test("the error is thrown by html`…` itself: before mount, the <template>, or any DOM write", { skip }, () => {
  const created = [];
  const original = document.createElement;
  document.createElement = function (tag, ...rest) {
    created.push(tag);
    return original.call(this, tag, ...rest);
  };
  const host = document.createElement("div");
  created.length = 0;
  try {
    assert.throws(() => mount(() => html`<input .value=${"x"}>`, host), RESERVED);
  } finally {
    document.createElement = original;
  }
  assert.deepEqual(created.filter((t) => t === "template"), [], "no <template> (and no Trusted Types call) was created");
  assert.equal(host.innerHTML, "", "nothing was inserted");
});

test("an invalid template is never cached as valid: every call fails, a valid one compiles once", () => {
  const bad = () => html`<input ?checked=${true}>`;
  assert.throws(bad, RESERVED);
  assert.throws(bad, RESERVED, "second call from the same call site throws again");
  const good = () => html`<input checked=${true}>`;
  assert.equal(good().parts, good().parts, "valid call site compiled once (same cached parts)");
});

test("compile errors are not dev-only: production mode rejects them too", () => {
  configure({ dev: false });
  try {
    assert.throws(() => html`<button @click=${() => {}}>b</button>`, RESERVED);
    assert.throws(() => html`<div title="&hellip;${1}"></div>`, /unsupported character reference/);
  } finally {
    configure({ dev: true });
  }
});

test("CORE-3: a compile error inside a binding is contained and reported as kind 'binding'; at top level it escapes", { skip }, () => {
  const reports = [];
  configure({ onError: (error, info) => reports.push({ error, kind: info.kind }) });
  const originalError = console.error;
  console.error = () => {};
  try {
    const t = mountInto(() => html`<p>${() => html`<input .value=${"x"}>`}</p>`);
    assert.equal(t.querySelector("input"), null);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].kind, "binding");
    assert.match(reports[0].error.message, RESERVED);
    assert.throws(() => html`<input .value=${"y"}>`, RESERVED);
    assert.equal(reports.length, 1, "a top-level compile error is not routed to onError");
  } finally {
    console.error = originalError;
    configure({ onError: null });
  }
});

// ---- 3. arrays / plain objects on ordinary attributes ------------------------------------

test("dev: an object or array on an ordinary attribute warns once, and renders exactly as before", { skip }, () => {
  configure({ dev: true });
  let t;
  const warnings = captureWarnings(() => {
    t = mountInto(() => html`<div data-o=${{ a: 1 }}></div><div data-a=${["a", "b"]}></div><div title="x-${{}}"></div>`);
  });
  const [o, a, m] = t.querySelectorAll("div");
  assert.equal(o.getAttribute("data-o"), "[object Object]");
  assert.equal(a.getAttribute("data-a"), "a,b");
  assert.equal(m.getAttribute("title"), "x-[object Object]");
  assert.equal(warnings.length, 3, warnings.join("\n"));
  assert.match(warnings[0], /attribute "data-o" got an object\/array, stringified as "\[object Object\]"/);
  assert.match(warnings[1], /"data-a".*"a,b"/);
});

test("dev: a reactive attribute warns once per element, not on every update", { skip }, () => {
  configure({ dev: true });
  const v = createState(["a"]);
  const warnings = captureWarnings(() => {
    const t = mountInto(() => html`<i data-x=${() => v.get()}></i>`);
    v.set(["a", "b"]);
    flush();
    assert.equal(t.querySelector("i").getAttribute("data-x"), "a,b");
  });
  assert.equal(warnings.length, 1);
});

test("no warning for documented structured values or meaningful toStrings", { skip }, () => {
  configure({ dev: true });
  const warnings = captureWarnings(() => {
    mountInto(() => html`<div style=${{ color: "red" }} ref=${() => {}} onclick=${() => {}}></div>`);
    mountInto(() => html`<a href=${new URL("https://example.com/a")} data-d=${new Date(0)} data-s=${"s"} data-n=${1}>x</a>`);
  });
  assert.deepEqual(warnings, []);
});

test("production: the same values render identically and nothing is logged", { skip }, () => {
  configure({ dev: false });
  let t;
  try {
    const warnings = captureWarnings(() => {
      t = mountInto(() => html`<div data-o=${{ a: 1 }} data-a=${["a", "b"]}></div>`);
    });
    assert.deepEqual(warnings, []);
  } finally {
    configure({ dev: true });
  }
  assert.equal(t.querySelector("div").getAttribute("data-o"), "[object Object]");
  assert.equal(t.querySelector("div").getAttribute("data-a"), "a,b");
});

// ---- 4. character references in mixed attribute values -----------------------------------

// Oracle: the browser's own HTML parser. A static attribute value `f + " X"` must decode
// exactly like a mixed value whose hole is " X". (Built with Function so each case is a
// genuine tagged-template call site — only in tests.)
const mixed = (frag) => new Function("html", `return html\`<div title="${frag}\${" X"}"></div>\`;`)(html);
const parsed = (frag) => {
  const d = document.createElement("div");
  d.innerHTML = `<div title="${frag} X"></div>`;
  return d.firstChild.getAttribute("title");
};

test("mixed values decode character references exactly like the HTML parser", { skip }, () => {
  const fragments = [
    "Tom &amp;", "&#38;", "&#x26;", "&#X26;", "&lt;&gt;&quot;&apos;", "&nbsp;", "&eacute;t&eacute;",
    "&copy 2024", "&copy2024", "&copy=", "?a=1&b=", "&amp=", "&ampx", "R&D", "Tom&Jerry", "&",
    "&#", "&#x", "&#;", "&AMP;", "&COPY", "&#128512;", "&#38", "&#x26z", "a&lt;b&gt;c",
  ];
  for (const frag of fragments) {
    const got = mountInto(() => mixed(frag)).querySelector("div").getAttribute("title");
    assert.equal(got, parsed(frag), JSON.stringify(frag));
  }
});

// jsdom's parser decodes "&notin X" to "¬in X"; the spec (the legacy match "not" is followed
// by an alphanumeric inside an attribute) and Chromium 152 (checked) keep it literal.
test("a legacy name followed by letters stays literal (spec + Chromium; jsdom differs)", { skip }, () => {
  assert.equal(mountInto(() => html`<div title="&notin ${"X"}"></div>`).querySelector("div").getAttribute("title"), "&notin X");
});

test("decoding covers every static fragment, every quoting style, multiple holes", { skip }, () => {
  const title = (tpl) => mountInto(tpl).querySelector("div").getAttribute("title");
  assert.equal(title(() => html`<div title="Tom &amp; ${"Ann"}"></div>`), "Tom & Ann");
  assert.equal(title(() => html`<div title='&#38;${"a"}&#x26;'></div>`), "&a&");
  assert.equal(title(() => html`<div title=&lt;${"a"}&gt;></div>`), "<a>", "unquoted");
  assert.equal(title(() => html`<div title="&lt;${"a"}&amp;${"b"}&gt;"></div>`), "<a&b>", "multiple holes");
  assert.equal(title(() => html`<div title="${"&amp;"}"></div>`), "&amp;", "dynamic values are data: never decoded");
  assert.equal(title(() => html`<div title="a${"&amp;"}b"></div>`), "a&amp;b");
});

test("references the compiler can't decode exactly are refused, not guessed", () => {
  for (const tpl of [
    () => html`<div title="&hellip;${1}"></div>`, // a real entity outside the supported table
    () => html`<div title="&#0;${1}"></div>`,
    () => html`<div title="&#x110000;${1}"></div>`,
    () => html`<div title="&#xD800;${1}"></div>`,
    () => html`<div title="&#128;${1}"></div>`, // C1: HTML remaps it (windows-1252)
    () => html`<div title="&constructor;${1}"></div>`,
  ]) {
    assert.throws(tpl, /unsupported character reference/);
  }
});

test("URL checks run on the decoded value", { skip }, () => {
  configure({ dev: false });
  try {
    const a = mountInto(() => html`<a href="java&#115;cript:${"alert(1)"}">x</a>`).querySelector("a");
    assert.equal(a.hasAttribute("href"), false, "an encoded javascript: URL is still blocked");
  } finally {
    configure({ dev: true });
  }
});

test("entire-value, static and pre-existing protections are unchanged", { skip }, () => {
  const el = mountInto(() => html`<i a=${"x"} b="${"y"}" c="abc &amp; d" d="${"p"}-${"q"}"></i>`).querySelector("i");
  assert.deepEqual([el.getAttribute("a"), el.getAttribute("b"), el.getAttribute("c"), el.getAttribute("d")], ["x", "y", "abc & d", "p-q"]);
  assert.throws(() => html`<i ${"x"}></i>`, /dynamic attribute names/);
  assert.throws(() => html`<script>${"x"}</script>`, /interpolation inside <script>/);
  assert.throws(() => html(["<p>", "</p>"], 1), /ZJS010/);
});
