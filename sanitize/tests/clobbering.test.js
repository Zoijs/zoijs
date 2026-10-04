// SEC-8 — sanitized content can't clobber page-level names.
//
// Browsers expose elements by `id` (and `<a>`/`<img>`/`<form>` by `name`) as named
// properties on `window`/`document`/forms. So untrusted `<a id="__DATA__">` could
// shadow `window.__DATA__` (the pattern @zoijs/ssr's serialize() docs use). sanitize()
// now removes `name` and namespaces every `id` (default "user-content-"), rewriting the
// same-document references to them so anchors and ARIA/table relationships still work.

import test from "node:test";
import assert from "node:assert/strict";
import { sanitize } from "../src/index.js";

const skip = typeof document === "undefined" ? "needs a DOM (jsdom)" : false;
const out = (html, opts) => sanitize(html, opts).map((n) => n.outerHTML ?? n.textContent).join("");
const mountSanitized = (html, opts) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  host.append(...sanitize(html, opts));
  return host;
};

// ---- the reproduced exploit + real global effect ---------------------------------------

test("the study's payload no longer claims __DATA__ or config", { skip }, () => {
  assert.equal(out('<a id="__DATA__" name="config">x</a>'), '<a id="user-content-__DATA__">x</a>');
});

test("mounted sanitized content does not clobber window globals (and the probe can detect it)", { skip }, () => {
  // Control: an UNsanitized element with an id does become window.<id> in this DOM.
  const raw = document.createElement("a");
  raw.id = "__CONTROL__";
  document.body.appendChild(raw);
  assert.equal(window.__CONTROL__, raw, "the environment exposes named properties");
  raw.remove();

  const host = mountSanitized('<a id="__DATA__" name="config">x</a><p id="config">p</p><span id="location">l</span><b id="name">n</b>');
  assert.equal(window.__DATA__, undefined, "window.__DATA__ untouched");
  assert.equal(window.config, undefined, "window.config untouched");
  assert.equal(typeof window.location.href, "string", "window.location is still the Location object");
  assert.equal(typeof window.name, "string", "window.name is still the string");
  assert.ok(document.getElementById("user-content-__DATA__"), "the content is still reachable under its namespaced id");
  host.remove();
});

test("global-looking ids are prefixed like any other (no denylist)", { skip }, () => {
  for (const id of ["__DATA__", "config", "location", "name", "document", "constructor", "user-content-x"]) {
    assert.equal(out(`<div id="${id}"></div>`), `<div id="user-content-${id}"></div>`, id);
  }
});

// ---- name: always removed ------------------------------------------------------------------

test("name is removed everywhere, and form controls never survive", { skip }, () => {
  assert.equal(out('<a name="config" href="/x">x</a>'), '<a href="/x">x</a>');
  assert.equal(out('<img name="location" src="/a.png" alt="">'), '<img src="/a.png" alt="">');
  assert.equal(out('<form name="location"><input name="action"></form><p name="x">ok</p>'), "<p>ok</p>");
  const host = mountSanitized('<a name="config">x</a>');
  assert.equal(host.querySelector("[name]"), null);
  assert.equal(window.config, undefined);
  host.remove();
});

// ---- references are rewritten to match --------------------------------------------------------

test("fragment links follow their target, in either order", { skip }, () => {
  assert.equal(out('<a href="#s">go</a><h2 id="s">S</h2>'), '<a href="#user-content-s">go</a><h2 id="user-content-s">S</h2>');
  assert.equal(out('<h2 id="s">S</h2><a href="#s">back</a>'), '<h2 id="user-content-s">S</h2><a href="#user-content-s">back</a>');
  const host = mountSanitized('<a href="#chapter">go</a><section><div><h2 id="chapter">C</h2></div></section>');
  const target = host.querySelector(host.querySelector("a").getAttribute("href"));
  assert.equal(target?.textContent, "C", "the rewritten link still resolves to its heading");
  host.remove();
});

test("non-fragment and unsafe URLs keep the existing URL rules", { skip }, () => {
  assert.equal(out('<a href="#">top</a>'), '<a href="#">top</a>', "a bare # is not an id reference");
  assert.equal(out('<a href="/page#s">x</a>'), '<a href="/page#s">x</a>', "another document's fragment is left alone");
  assert.equal(out('<a href="https://example.com/#s">x</a>'), '<a href="https://example.com/#s">x</a>');
  assert.equal(out('<a href="javascript:alert(1)#s">x</a>'), "<a>x</a>", "still removed by isSafeUrl");
  assert.equal(out('<a href="data:text/html,<b>#s">x</a>'), "<a>x</a>");
  assert.equal(out('<a href=" #s ">x</a>'), '<a href="#user-content-s">x</a>');
});

test("headers and ARIA id references are rewritten token by token", { skip }, () => {
  assert.equal(
    out('<table><tr><th id="h1">A</th><th id="h2">B</th></tr><tr><td headers="h1  h2">x</td></tr></table>'),
    '<table><tbody><tr><th id="user-content-h1">A</th><th id="user-content-h2">B</th></tr><tr><td headers="user-content-h1 user-content-h2">x</td></tr></tbody></table>'
  );
  for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "aria-details", "aria-errormessage", "aria-flowto"]) {
    assert.equal(out(`<div ${attr}="t help"></div>`), `<div ${attr}="user-content-t user-content-help"></div>`, attr);
  }
  assert.equal(out('<div aria-activedescendant="opt"></div>'), '<div aria-activedescendant="user-content-opt"></div>');
  assert.equal(out('<div aria-label="Close" data-target="x"></div>'), '<div aria-label="Close" data-target="x"></div>', "non-reference attributes untouched");

  const host = mountSanitized('<p id="hint">Use 8+ characters</p><div role="note" aria-describedby="hint">pw</div>');
  const describedBy = host.querySelector("[aria-describedby]").getAttribute("aria-describedby");
  assert.equal(document.getElementById(describedBy)?.textContent, "Use 8+ characters", "accessibility relationship intact");
  host.remove();
});

test("deeply nested ids and references are all rewritten", { skip }, () => {
  const html = '<section><article><div><ul><li><a href="#deep">x</a></li></ul><p><span id="deep">d</span></p></div></article></section>';
  const host = mountSanitized(html);
  assert.equal(host.querySelector("a").getAttribute("href"), "#user-content-deep");
  assert.ok(host.querySelector("#user-content-deep"));
  host.remove();
});

// ---- options -----------------------------------------------------------------------------------

test("a custom prefix applies to ids and every reference", { skip }, () => {
  assert.equal(
    out('<a href="#s" aria-controls="s">x</a><h2 id="s">S</h2>', { idPrefix: "cms-" }),
    '<a href="#cms-s" aria-controls="cms-s">x</a><h2 id="cms-s">S</h2>'
  );
});

test('idPrefix: "" keeps ids and references as written — but name is still removed', { skip }, () => {
  assert.equal(
    out('<a href="#s" name="config">x</a><h2 id="s" aria-describedby="d">S</h2>', { idPrefix: "" }),
    '<a href="#s">x</a><h2 id="s" aria-describedby="d">S</h2>'
  );
});

test("option validation: omitted/undefined → default; non-strings → TypeError", { skip }, () => {
  assert.equal(out('<i id="a"></i>'), '<i id="user-content-a"></i>');
  assert.equal(out('<i id="a"></i>', {}), '<i id="user-content-a"></i>');
  assert.equal(out('<i id="a"></i>', { idPrefix: undefined }), '<i id="user-content-a"></i>');
  for (const bad of [null, 123, {}, ["x"], true]) {
    assert.throws(() => sanitize("<i></i>", { idPrefix: bad }), TypeError, String(bad));
  }
  for (const badOptions of [null, "cms-", 1]) {
    assert.throws(() => sanitize("<i></i>", badOptions), TypeError, String(badOptions));
  }
});

// ---- edge-case ids --------------------------------------------------------------------------------

test("empty/blank ids are removed; other ids are kept verbatim behind the prefix", { skip }, () => {
  assert.equal(out('<i id=""></i><b id="  "></b>'), "<i></i><b></b>");
  assert.equal(out('<i id="a b"></i>'), '<i id="user-content-a b"></i>');
  assert.equal(out('<i id="#foo"></i>'), '<i id="user-content-#foo"></i>');
  assert.equal(out('<i id="café-ü"></i>'), '<i id="user-content-café-ü"></i>');
  assert.equal(out('<i id="x"></i><b id="x"></b>'), '<i id="user-content-x"></i><b id="user-content-x"></b>', "duplicates stay duplicates (namespaced)");
});

// ---- mixed malicious payload -------------------------------------------------------------------

test("a mixed payload: ids namespaced, names gone, unsafe URLs/handlers/scripts still stripped", { skip }, () => {
  const html =
    '<a id="__DATA__" name="config" href="#__DATA__" onclick="steal()">a</a>' +
    '<img id="location" src="javascript:alert(1)" onerror="x()" alt="">' +
    '<a href="javascript:alert(1)" target="_blank">b</a><script>evil()</script>';
  assert.equal(
    out(html),
    '<a id="user-content-__DATA__" href="#user-content-__DATA__">a</a>' +
      '<img id="user-content-location" alt="">' +
      '<a target="_blank" rel="noopener noreferrer">b</a>'
  );
});
