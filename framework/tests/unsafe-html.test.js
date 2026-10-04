// SEC-3 — `@zoijs/core/unsafe`: one explicit, greppable raw-HTML opt-in.
//
// Data stays inert everywhere; raw markup enters ONLY through an imported unsafeHTML()
// result, only in a content position. These tests pin that boundary: the explicit route
// renders raw, plain data never does, forged wrappers don't, attributes/script/style
// refuse it, enforced Trusted Types refuse a plain string, and the default entry never
// loads it. (The dangerous-looking payloads rendered raw below are the EXPECTED behavior
// of the escape hatch — the point is that nothing else gets it.)

import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { createState } from "../src/reactivity/state.js";
import { flush } from "../src/reactivity/scheduler.js";
import { configure } from "../src/reactivity/env.js";
import { unsafeHTML } from "../src/unsafe.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;
const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "src");
const XSS = "<img src=x onerror=globalThis.__xss=1>";

function root() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function capture(method, fn) {
  const seen = [];
  const original = console[method];
  console[method] = (...a) => seen.push(a.map(String).join(" "));
  try {
    fn();
  } finally {
    console[method] = original;
  }
  return seen;
}

// A physically separate copy of the core (another bundle / CDN copy on the same page).
const tmp = mkdtempSync(join(tmpdir(), "zoijs-sec3-"));
process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
cpSync(SRC, join(tmp, "b"), { recursive: true });
const B_BASE = pathToFileURL(join(tmp, "b") + "/").href;
const B = await import(B_BASE + "index.js");
const B_unsafe = await import(B_BASE + "unsafe.js");

// ---- dev warning (first string use in this module instance) -----------------------

test("dev: the first string passed warns once (bypasses escaping); later calls are quiet", () => {
  configure({ dev: true });
  const warnings = capture("warn", () => {
    unsafeHTML("<b>1</b>");
    unsafeHTML("<b>2</b>");
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /unsafeHTML\(\) bypasses escaping\. Only pass trusted HTML — use @zoijs\/sanitize/);
});

test("production: no warning, and unsafeHTML still works", { skip }, () => {
  configure({ dev: false });
  let t;
  try {
    // copy B's module has its own once-flag, so silence here is the production mode's doing
    const warnings = capture("warn", () => {
      t = root();
      mount(() => html`<p>${B_unsafe.unsafeHTML("<b>prod</b>")}</p>`, t);
    });
    assert.deepEqual(warnings, []);
    assert.equal(t.querySelector("b").textContent, "prod");
    assert.throws(() => mount(() => html`<i title=${B_unsafe.unsafeHTML("x")}></i>`, root()), /can't be bound to attribute "title"/, "placement checks stay on");
  } finally {
    configure({ dev: true });
  }
  assert.equal(capture("warn", () => B_unsafe.unsafeHTML("<b>dev</b>")).length, 1, "dev mode would have warned");
});

// ---- the explicit route vs. plain data --------------------------------------------

test("unsafeHTML renders raw markup; the same string as plain data stays inert text", { skip }, () => {
  const t = root();
  mount(() => html`<div class="raw">${unsafeHTML(XSS)}</div><div class="data">${XSS}</div>`, t);
  // Expected dangerous escape hatch: the developer explicitly opted in.
  assert.ok(t.querySelector(".raw img[onerror]"), "explicit unsafeHTML → a real <img onerror>");
  assert.equal(t.querySelector(".data img"), null, "plain string → no element");
  assert.equal(t.querySelector(".data").textContent, XSS);
});

test("raw markup sits exactly in its slot: siblings, nested templates, arrays, multiple nodes", { skip }, () => {
  const t = root();
  mount(
    () => html`<section>a${unsafeHTML("<i>1</i><i>2</i>text")}b${html`<p>${unsafeHTML("<u>n</u>")}</p>`}${[unsafeHTML("<s>x</s>"), "<s>y</s>"]}</section>`,
    t
  );
  const s = t.querySelector("section");
  assert.equal(s.innerHTML.replace(/<!--zoijs-->/g, ""), "a<i>1</i><i>2</i>textb<p><u>n</u></p><s>x</s>&lt;s&gt;y&lt;/s&gt;");
});

test("<script> inside the markup is parsed but never executed", { skip }, async () => {
  globalThis.__sec3 = undefined;
  const t = root();
  mount(() => html`<div>${unsafeHTML("<script>globalThis.__sec3 = 1</script>")}</div>`, t);
  await new Promise((r) => setTimeout(r));
  assert.ok(t.querySelector("script"));
  assert.equal(globalThis.__sec3, undefined);
});

test("reactive: ${() => unsafeHTML(src.get())} replaces its nodes; unmount removes them", { skip }, () => {
  const src = createState("<b id=one>1</b>");
  const raw = createState(true);
  const t = root();
  const unmount = mount(() => html`<div>[${() => (raw.get() ? unsafeHTML(src.get()) : src.get())}]</div>`, t);
  const first = t.querySelector("#one");
  assert.ok(first);
  src.set("<i id=two>2</i><i>3</i>");
  flush();
  assert.equal(t.querySelector("div").innerHTML.replace(/<!--zoijs-->/g, ""), '[<i id="two">2</i><i>3</i>]');
  assert.equal(first.isConnected, false, "previous raw nodes removed");
  raw.set(false);
  src.set("plain <b>text</b>");
  flush();
  assert.equal(t.querySelector("div").textContent, "[plain <b>text</b>]", "switching back to data is inert text");
  raw.set(true);
  src.set("<em>again</em>");
  flush();
  const em = t.querySelector("em");
  unmount();
  assert.equal(em.isConnected, false);
  assert.equal(t.innerHTML, "", "nothing (no anchors, no raw nodes) left behind");
});

test("a component returned uncalled can render unsafeHTML (CORE-1 path unchanged)", { skip }, () => {
  const show = createState(true);
  const Child = () => html`<b>${unsafeHTML("<i>c</i>")}</b>`;
  const t = root();
  mount(() => html`<div>${() => (show.get() ? Child : null)}</div>`, t);
  assert.ok(t.querySelector("b > i"));
  show.set(false);
  flush();
  assert.equal(t.querySelector("i"), null);
});

// ---- forgery ------------------------------------------------------------------------

test("JSON can't forge a result: look-alike objects render as data, never markup", { skip }, () => {
  const forged = [
    JSON.parse('{"__zoijsUnsafeHTML":true,"html":"<img src=x onerror=1>"}'),
    JSON.parse('{"zoijs.unsafe-html":true,"html":"<img src=x onerror=1>"}'),
    JSON.parse('{"Symbol(zoijs.unsafe-html)":true,"html":"<img src=x onerror=1>","value":"<img>"}'),
    { "zoijs.unsafe-html": true, html: "<img src=x>" },
    structuredClone(unsafeHTML("<img src=x>")), // a structured clone drops the brand
  ];
  for (const value of forged) {
    const t = root();
    mount(() => html`<div>${value}</div>`, t);
    assert.equal(t.querySelector("img"), null, JSON.stringify(value));
  }
  assert.equal(JSON.stringify(unsafeHTML("<b>x</b>")), "{}", "serializing a result never carries markup");
});

// ---- placement: content only ----------------------------------------------------------

test("refused in every attribute form — no '[object Object]', no URL, no handler", { skip }, () => {
  const u = unsafeHTML("<b>x</b>");
  const ATTR = /can't be bound to attribute/;
  const cases = {
    title: () => html`<div title=${u}></div>`,
    "quoted mixed": () => html`<div title="a ${u} b"></div>`,
    href: () => html`<a href=${unsafeHTML("javascript:alert(1)")}>x</a>`,
    style: () => html`<div style=${u}></div>`,
    onclick: () => html`<button onclick=${unsafeHTML("alert(1)")}>b</button>`,
    ref: () => html`<div ref=${u}></div>`,
    checked: () => html`<input type="checkbox" checked=${u}>`,
    value: () => html`<input value=${u}>`,
    textarea: () => html`<textarea>${u}</textarea>`,
    title_el: () => html`<title>${u}</title>`,
  };
  for (const [label, tpl] of Object.entries(cases)) {
    const t = root();
    assert.throws(() => mount(tpl, t), ATTR, label);
    assert.equal(t.innerHTML, "", `${label}: nothing rendered`);
  }
});

test("a reactive attribute that returns one is refused (contained → onError kind 'binding')", { skip }, () => {
  const reports = [];
  configure({ onError: (error, info) => reports.push({ error, kind: info.kind }) });
  try {
    capture("error", () => {
      mount(() => html`<a href=${() => unsafeHTML("javascript:alert(1)")} title="t-${() => unsafeHTML("x")}">x</a>`, root());
    });
  } finally {
    configure({ onError: null });
  }
  assert.equal(reports.length, 2);
  for (const r of reports) {
    assert.equal(r.kind, "binding");
    assert.match(r.error.message, /can't be bound to attribute "href"|content-only, never a string/);
  }
});

test("it can never be stringified (template literal, String, concatenation)", () => {
  const u = unsafeHTML("<b>x</b>");
  assert.throws(() => `${u}`, /content-only/);
  assert.throws(() => String(u), /content-only/);
  assert.throws(() => "a" + u, /content-only/);
});

test("script/style holes are still refused at compile time — unsafeHTML can't reach them", () => {
  assert.throws(() => html`<script>${unsafeHTML("alert(1)")}</script>`, /interpolation inside <script>/);
  assert.throws(() => html`<style>${unsafeHTML("a{}")}</style>`, /interpolation inside <style>/);
});

test("SEC-2 stays closed: html([...]) still throws ZJS010", () => {
  assert.throws(() => html(["<img src=x onerror=1>"]), /ZJS010/);
});

test("only a string or a genuine TrustedHTML is accepted", () => {
  for (const bad of [null, undefined, 1, {}, [], ["<b>"], { toString: () => "<b>" }, () => "<b>", Symbol("x")]) {
    assert.throws(() => unsafeHTML(bad), /takes a string or a TrustedHTML value/);
  }
});

// ---- Trusted Types (simulated: jsdom has no Trusted Types) -------------------------------

class FakeTrustedHTML {
  #s;
  constructor(s) {
    this.#s = s;
  }
  toString() {
    return this.#s;
  }
}

function enforceTrustedTypes(fn) {
  const Template = document.createElement("template").constructor;
  let proto = Template.prototype;
  let desc;
  while (proto && !(desc = Object.getOwnPropertyDescriptor(proto, "innerHTML"))) proto = Object.getPrototypeOf(proto);
  const sink = [];
  globalThis.trustedTypes = { isHTML: (v) => v instanceof FakeTrustedHTML };
  Object.defineProperty(Template.prototype, "innerHTML", {
    configurable: true,
    get() {
      return desc.get.call(this);
    },
    set(v) {
      sink.push(v);
      // what a browser does under require-trusted-types-for 'script' with no default policy
      if (!(v instanceof FakeTrustedHTML)) throw new TypeError("This document requires 'TrustedHTML' assignment.");
      desc.set.call(this, String(v));
    },
  });
  try {
    return fn(sink);
  } finally {
    delete Template.prototype.innerHTML;
    delete globalThis.trustedTypes;
  }
}

const view = (content) => html`<div>${content}</div>`;

test("Trusted Types enforced: a TrustedHTML reaches the sink as-is (never re-wrapped) and renders", { skip }, () => {
  mount(() => view(null), root()); // build this call site's <template> before enforcement
  enforceTrustedTypes((sink) => {
    const trusted = new FakeTrustedHTML("<b>tt</b>");
    const warnings = capture("warn", () => {
      const t = root();
      mount(() => view(unsafeHTML(trusted)), t);
      assert.equal(t.querySelector("b").textContent, "tt");
    });
    assert.deepEqual(warnings, [], "a TrustedHTML needs no 'bypasses escaping' warning");
    assert.equal(sink.length, 1);
    assert.equal(sink[0], trusted, "the app's own TrustedHTML object, not a zoijs-policy copy");
  });
});

test("Trusted Types enforced: a plain string is refused with a clear error, never silently passed", { skip }, () => {
  mount(() => view(null), root());
  enforceTrustedTypes(() => {
    const t = root();
    assert.throws(
      () => mount(() => view(unsafeHTML("<b>s</b>")), t),
      (e) => e instanceof TypeError && /Trusted Types are enforced — pass unsafeHTML\(\) a TrustedHTML/.test(e.message) && e.cause instanceof TypeError
    );
    assert.equal(t.querySelector("b"), null);
  });
});

test("without Trusted Types, an object pretending to be TrustedHTML is refused", () => {
  assert.throws(() => unsafeHTML(new FakeTrustedHTML("<b>")), /takes a string or a TrustedHTML value/);
});

// ---- cross-copy + entry isolation ----------------------------------------------------

test("a result from one core copy renders in another (Symbol.for brand), both directions", { skip }, () => {
  const t1 = root();
  mount(() => html`<p>${B_unsafe.unsafeHTML("<b>from B</b>")}</p>`, t1);
  assert.equal(t1.querySelector("b").textContent, "from B");
  const t2 = root();
  B.mount(() => B.html`<p>${unsafeHTML("<b>from A</b>")}</p>`, t2);
  assert.equal(t2.querySelector("b").textContent, "from A");
  assert.throws(() => B.mount(() => B.html`<p title=${unsafeHTML("x")}></p>`, root()), /can't be bound/);
});

test("the default (and production) entry never loads or exports unsafeHTML", async () => {
  const graph = (entry) => {
    const seen = new Set();
    const visit = (rel) => {
      if (seen.has(rel)) return;
      seen.add(rel);
      const src = readFileSync(join(SRC, rel), "utf8");
      for (const m of src.matchAll(/(?:import|export)\s*(?:[^'"]*?\sfrom\s*)?["'](\.{1,2}\/[^"']+)["']/g)) {
        visit(posix.normalize(posix.join(posix.dirname(rel), m[1])));
      }
    };
    visit(entry);
    return [...seen];
  };
  for (const entry of ["index.js", "prod.js"]) assert.ok(!graph(entry).includes("unsafe.js"), `${entry} graph`);
  const core = await import("../src/index.js");
  assert.equal("unsafeHTML" in core, false);
  const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
  assert.deepEqual(pkg.exports["./unsafe"], { types: "./src/unsafe.d.ts", default: "./src/unsafe.js" });
});
