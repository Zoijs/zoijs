// SEC-9 — wider URL guards + opener protection.
//
// Any bound value that can navigate, load a resource, change the document base, or trigger a
// refresh is checked before it reaches the DOM (and, in @zoijs/ssr, the HTML):
//   - <base>: no bindings at all (compile error) — it re-resolves every relative URL;
//   - <meta http-equiv="refresh"> content: the refresh URL is parsed and must be safe;
//     a bound http-equiv is a compile error;
//   - srcset / imagesrcset: every candidate URL must be safe, or the value is refused;
//   - SVG <animate>/<set> from/to/by/values aimed at a URL attribute; bound attributeName refused;
//   - target="_blank" (bound or static) on a/area/form always carries rel noopener noreferrer,
//     merged into the app's own rel tokens, whatever the attribute order or later updates.

import test from "node:test";
import assert from "node:assert/strict";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { createState } from "../src/reactivity/state.js";
import { flush } from "../src/reactivity/scheduler.js";
import { configure } from "../src/reactivity/env.js";
import { unsafeHTML } from "../src/unsafe.js";
import { renderToString } from "../../ssr/src/index.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;
const J = "javascript:alert(1)";

function root() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}
const first = (tpl, sel) => {
  const t = root();
  mount(tpl, t);
  return t.querySelector(sel);
};
const quiet = (fn) => {
  const original = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = original;
  }
};
const relTokens = (el) => (el.getAttribute("rel") || "").split(/\s+/).filter(Boolean).sort();

// ---- <base> ----------------------------------------------------------------------------

test("<base>: static stays allowed; ANY binding is a compile error, even a safe-looking URL", { skip }, () => {
  assert.equal(first(() => html`<base href="/app/">${"x"}`, "base").getAttribute("href"), "/app/");
  const BASE = /binding "(href|target)" on <base> is not supported — write it statically/;
  assert.throws(() => html`<base href=${"/safe-looking/"}>`, BASE);
  assert.throws(() => html`<base href="/a/${"b"}/">`, BASE);
  assert.throws(() => html`<base target=${"_blank"}>`, BASE);
  const t = root();
  assert.throws(() => mount(() => html`<base href=${() => "/x/"}>`, t), BASE);
  assert.equal(t.innerHTML, "", "never reaches the DOM");
});

test("<base>: refused in production mode and under SSR too", () => {
  configure({ dev: false });
  try {
    assert.throws(() => html`<base href=${"/x/"}>`, /on <base> is not supported/);
    assert.throws(() => renderToString(() => html`<base href=${"/x/"}>`), /on <base> is not supported/);
  } finally {
    configure({ dev: true });
  }
});

// ---- meta refresh ----------------------------------------------------------------------

const REFRESH = [
  ["5", true],
  ["0;url=/safe", true],
  ["5; url=https://example.com", true],
  ["0; URL='/quoted'", true],
  ["0;URL=javascript:alert(1)", false],
  ["0; url=JaVaScRiPt:alert(1)", false],
  ["0;url=java\tscript:alert(1)", false],
  ["0;URL='javascript:alert(1)'", false],
  ["0 javascript:alert(1)", false], // no "url=" needed: the rest is the URL
  ["0;url=data:text/html,<script>alert(1)</script>", false],
  ["soon; url=/x", false], // not a refresh the browser would run → refused, not guessed
  ["", false],
];

test("meta refresh: a bound content's URL is parsed and checked (client + SSR agree)", { skip }, () => {
  quiet(() => {
    for (const [value, ok] of REFRESH) {
      for (const tpl of [() => html`<meta http-equiv="refresh" content=${value}>`, () => html`<meta content=${value} http-equiv="Refresh">`]) {
        const meta = first(tpl, "meta");
        assert.equal(meta.getAttribute("content"), ok ? value : null, `client ${JSON.stringify(value)}`);
        assert.equal(renderToString(tpl).includes("content="), ok, `ssr ${JSON.stringify(value)}`);
      }
    }
  });
});

test("meta refresh: mixed values and entity-obfuscated static schemes are checked decoded", { skip }, () => {
  quiet(() => {
    assert.equal(first(() => html`<meta http-equiv="refresh" content="0;url=/next/${"page"}">`, "meta").getAttribute("content"), "0;url=/next/page");
    assert.equal(first(() => html`<meta http-equiv="refresh" content="0;url=java&#115;cript:${"alert(1)"}">`, "meta").hasAttribute("content"), false);
    assert.equal(renderToString(() => html`<meta http-equiv="refresh" content="0;url=java&#115;cript:${"alert(1)"}">`), '<meta http-equiv="refresh">');
  });
});

test("meta: a bound http-equiv is a compile error; other metas' content is not a URL context", { skip }, () => {
  assert.throws(() => html`<meta http-equiv=${"refresh"} content="0;url=/x">`, /binding "http-equiv" on <meta> is not supported/);
  assert.equal(first(() => html`<meta name="description" content=${"0;url=" + J}>`, "meta").getAttribute("content"), "0;url=" + J);
});

test("meta refresh: reactive safe → unsafe → safe never shows the unsafe value", { skip }, () => {
  const v = createState("0;url=/a");
  const meta = first(() => html`<meta http-equiv="refresh" content=${() => v.get()}>`, "meta");
  quiet(() => {
    v.set("0;url=" + J);
    flush();
    assert.notEqual(meta.getAttribute("content"), "0;url=" + J);
    v.set("0;url=/b");
    flush();
  });
  assert.equal(meta.getAttribute("content"), "0;url=/b");
});

// ---- srcset -----------------------------------------------------------------------------

const SRCSET = [
  ["/a.png 1x", true],
  ["/a.png 1x, /b.png 2x", true],
  ["a.png, b.png 2x", true],
  ["https://cdn.example.com/a.webp 480w, /b.webp 1200w", true],
  ["  /a.png   480w ,\n /b.png 1200w  ", true],
  ["data:image/png;base64,AAAA 1x, /b.png 2x", true], // the data: URL's comma stays inside it
  ["javascript:alert(1) 1x, /b.png 2x", false],
  ["/a.png 1x, JAVASCRIPT:alert(1) 2x", false],
  ["/a.png 1x,\u0001javascript:alert(1) 2x", false],
  ["/a.png 1x, java\u0000script:alert(1) 2x", false],
  ["data:text/html,<script>alert(1)</script> 1x", false],
  ["/a.png 1x,,, ,javascript:alert(1)", false],
];

test("srcset: every candidate URL is checked; one bad candidate refuses the whole value", { skip }, () => {
  quiet(() => {
    for (const [value, ok] of SRCSET) {
      for (const [tag, tpl] of [
        ["img", () => html`<img srcset=${value}>`],
        ["source", () => html`<picture><source srcset=${value}></picture>`],
        ["link", () => html`<link rel="preload" as="image" imagesrcset=${value}>`],
      ]) {
        const attr = tag === "link" ? "imagesrcset" : "srcset";
        assert.equal(first(tpl, tag).getAttribute(attr), ok ? value : null, `client ${tag} ${JSON.stringify(value)}`);
        assert.equal(renderToString(tpl).includes(attr + "="), ok, `ssr ${tag} ${JSON.stringify(value)}`);
      }
    }
  });
});

test("srcset: reactive safe → unsafe → safe never leaves the unsafe value in the DOM", { skip }, () => {
  const v = createState("/a.png 1x");
  const img = first(() => html`<img srcset=${() => v.get()}>`, "img");
  quiet(() => {
    v.set("/a.png 1x, " + J + " 2x");
    flush();
    assert.equal(img.getAttribute("srcset"), "/a.png 1x");
  });
  v.set("/b.png 2x");
  flush();
  assert.equal(img.getAttribute("srcset"), "/b.png 2x");
});

// ---- SVG animate / set ---------------------------------------------------------------------

test("SVG <set>/<animate> values aimed at a URL attribute are checked; others are not", { skip }, () => {
  quiet(() => {
    const set = (v) => first(() => html`<svg><a><set attributeName="href" to=${v}></set></a></svg>`, "set");
    assert.equal(set(J).hasAttribute("to"), false);
    assert.equal(set("/safe").getAttribute("to"), "/safe");
    const xl = first(() => html`<svg><a><animate attributeName="xlink:href" from=${"/a"} to=${J}></animate></a></svg>`, "animate");
    assert.equal(xl.getAttribute("from"), "/a");
    assert.equal(xl.hasAttribute("to"), false);
    const values = (v) => first(() => html`<svg><a><animate attributeName="href" values=${v}></animate></a></svg>`, "animate").getAttribute("values");
    assert.equal(values("/a;/b"), "/a;/b");
    assert.equal(values("/a;" + J), null, "one unsafe value in the list refuses it");
    const fill = first(() => html`<svg><rect><animate attributeName="fill" from=${"red"} to=${"javascript-looking:value"}></animate></rect></svg>`, "animate");
    assert.equal(fill.getAttribute("to"), "javascript-looking:value", "non-URL animation values are left alone");
    assert.equal(renderToString(() => html`<svg><a><set attributeName="href" to=${J}></set></a></svg>`), '<svg><a><set attributeName="href"></set></a></svg>');
  });
});

test("SVG: a bound attributeName on <animate>/<set> is a compile error", () => {
  assert.throws(() => html`<svg><set attributeName=${"href"} to="/x"></set></svg>`, /binding "attributeName" on <set>/);
  assert.throws(() => html`<svg><animate attributeName=${"href"}></animate></svg>`, /binding "attributeName" on <animate>/);
});

// ---- target="_blank" opener protection ------------------------------------------------------

test("target=_blank gets noopener noreferrer — bound target, static target, fully static", { skip }, () => {
  assert.deepEqual(relTokens(first(() => html`<a href="/x" target=${"_blank"} rel="external">x</a>`, "a")), ["external", "noopener", "noreferrer"]);
  assert.deepEqual(relTokens(first(() => html`<a target="_blank" href=${"/x"}>x</a>`, "a")), ["noopener", "noreferrer"]);
  assert.deepEqual(relTokens(first(() => html`<a target="_blank" href="/x">${"x"}</a>`, "a")), ["noopener", "noreferrer"]);
  assert.deepEqual(relTokens(first(() => html`<area target=" _BLANK " href="/x">`, "area")), ["noopener", "noreferrer"]);
  assert.deepEqual(relTokens(first(() => html`<form target="_blank" action=${"/go"}></form>`, "form")), ["noopener", "noreferrer"]);
  assert.equal(first(() => html`<a target="_blank" href="/x">x</a>`, "a").getAttribute("target"), "_blank", "target itself is kept");
});

test("existing rel tokens are kept and never duplicated (any case)", { skip }, () => {
  assert.equal(first(() => html`<a target="_blank" rel="external sponsored">x</a>`, "a").getAttribute("rel"), "external sponsored noopener noreferrer");
  assert.equal(first(() => html`<a target="_blank" rel="noopener">x</a>`, "a").getAttribute("rel"), "noopener noreferrer");
  assert.equal(first(() => html`<a target="_blank" rel="NoReferrer NOOPENER">x</a>`, "a").getAttribute("rel"), "NoReferrer NOOPENER");
  assert.equal(first(() => html`<a target="_self" rel=${"external"}>x</a>`, "a").getAttribute("rel"), "external", "not _blank → untouched");
  assert.equal(first(() => html`<a rel=${"external"}>x</a>`, "a").getAttribute("rel"), "external", "no target → untouched");
});

test("attribute order doesn't matter: all permutations give the same rel", { skip }, () => {
  const t = "_blank";
  const r = "external";
  const variants = [
    () => html`<a target=${t} rel=${r}>x</a>`,
    () => html`<a rel=${r} target=${t}>x</a>`,
    () => html`<a target="_blank" rel=${r}>x</a>`,
    () => html`<a rel=${r} target="_blank">x</a>`,
    () => html`<a rel="external" target=${t}>x</a>`,
    () => html`<a target=${t} rel="external">x</a>`,
  ];
  for (const v of variants) {
    assert.deepEqual(relTokens(first(v, "a")), ["external", "noopener", "noreferrer"]);
    assert.match(renderToString(v), /rel="external noopener noreferrer"/);
  }
});

test("reactive target _self → _blank → _self → _blank keeps rel exact (no stale or duplicate tokens)", { skip }, () => {
  const target = createState("_self");
  const a = first(() => html`<a href="/x" target=${() => target.get()} rel="external">x</a>`, "a");
  const seen = [];
  for (const next of ["_blank", "_self", "_blank"]) {
    seen.push(a.getAttribute("rel"));
    target.set(next);
    flush();
  }
  seen.push(a.getAttribute("rel"));
  assert.deepEqual(seen, ["external", "external noopener noreferrer", "external", "external noopener noreferrer"]);
});

test("reactive rel while target stays _blank: updates can't remove noopener", { skip }, () => {
  const rel = createState("external");
  const a = first(() => html`<a target="_blank" rel=${() => rel.get()}>x</a>`, "a");
  rel.set("nofollow");
  flush();
  assert.equal(a.getAttribute("rel"), "nofollow noopener noreferrer");
  rel.set(null);
  flush();
  assert.equal(a.getAttribute("rel"), "noopener noreferrer");
  rel.set("noopener");
  flush();
  assert.equal(a.getAttribute("rel"), "noopener noreferrer");
});

test("a valueless or duplicate rel/target beside a managed target is a compile error", () => {
  assert.throws(() => html`<a target="_blank" rel>x</a>`, /needs a single valued "rel"/);
  assert.throws(() => html`<a target=${"_blank"} rel="a" rel="b">x</a>`, /needs a single valued "rel"/);
});

test("opener protection and URL guards are production-active", { skip }, () => {
  configure({ dev: false });
  try {
    assert.deepEqual(relTokens(first(() => html`<a target=${"_blank"}>x</a>`, "a")), ["noopener", "noreferrer"]);
    assert.equal(first(() => html`<img srcset=${J + " 1x"}>`, "img").hasAttribute("srcset"), false);
    assert.equal(first(() => html`<meta http-equiv="refresh" content=${"0;url=" + J}>`, "meta").hasAttribute("content"), false);
  } finally {
    configure({ dev: true });
  }
});

test("dev warning names the attribute, not the (possibly sensitive) value", { skip }, () => {
  configure({ dev: true });
  const warnings = [];
  const original = console.warn;
  console.warn = (...a) => warnings.push(a.join(" "));
  try {
    first(() => html`<img srcset=${"javascript:secret-token 1x"}>`, "img");
  } finally {
    console.warn = original;
  }
  assert.deepEqual(warnings, ['Zoijs: refusing unsafe URL in "srcset"']);
});

test("SSR output is already protected; hydration keeps it", { skip }, () => {
  const App = () => html`<a href=${"/x"} target="_blank" rel="external">x</a>`;
  const server = renderToString(App, { hydratable: true });
  assert.match(server, /rel="external noopener noreferrer"/);
  const t = root();
  t.innerHTML = server;
  const a = t.querySelector("a");
  mount(App, t, { hydrate: true });
  assert.equal(t.querySelector("a"), a, "same element adopted");
  assert.equal(a.getAttribute("rel"), "external noopener noreferrer");
});

test("unsafeHTML stays the explicit escape hatch: its markup is not rewritten", { skip }, () => {
  const a = first(() => html`<div>${unsafeHTML('<a target="_blank" href="/x">raw</a>')}</div>`, "a");
  assert.equal(a.hasAttribute("rel"), false, "trusted raw markup is inserted as written");
});

// Release prep (CodeQL): trailing-comma trimming used /,+$/, which is quadratic on long comma runs
// — a 40k-character bound srcset blocked for ~0.8 s (client and SSR). It is now a linear loop.
test("srcset: long comma runs are checked in linear time, with the same decisions", async () => {
  const { isSafeSrcset } = await import("../src/utils/security.js");
  assert.equal(isSafeSrcset("a.png,,, b.png 2x,"), true);
  assert.equal(isSafeSrcset("a.png,,,"), true);
  assert.equal(isSafeSrcset("javascript:alert(1),,,"), false);
  assert.equal(isSafeSrcset("ok.png 1x, javascript:x,,"), false);
  const hostile = "x" + ",".repeat(400_000) + "y,";
  const t = performance.now();
  assert.equal(isSafeSrcset(hostile), true);
  assert.ok(performance.now() - t < 1000, `took ${Math.round(performance.now() - t)} ms`);
});
