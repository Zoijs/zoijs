// Hydration recovery — what hydrate() does when the server HTML doesn't match the client,
// has no markers, or contains state the user already changed. (jsdom set up here, as in
// parity.test.js; node --test runs each file in its own process.)
//
// Contract under test:
//   - A template boundary is adopted only if its static skeleton matches exactly; a boundary
//     that doesn't is rendered on the client in place, and only that boundary.
//   - Text in a dynamic slot is corrected in place (same node); dynamic attributes always take
//     the client's value. Nothing throws for a recoverable mismatch.
//   - Every recovery is counted in unmount.hydration and, in dev, explained in a console warning.
//   - Matching form controls keep their DOM identity, value, focus and selection.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const k of ["Node", "NodeFilter", "Element", "HTMLElement", "Text", "Comment", "DocumentFragment", "Event", "CustomEvent"]) {
  if (dom.window[k]) globalThis[k] = dom.window[k];
}

const { html, each, createState, onCleanup, configure } = await import("@zoijs/core");
const { renderToString, hydrate } = await import("../src/index.js");

const tick = () => new Promise((r) => setTimeout(r, 0));

// Server-render `server`, then hydrate `client` over it; returns what a test needs.
function run(server, client = server, { tamper } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  host.innerHTML = renderToString(server, { hydratable: true });
  if (tamper) tamper(host);
  const warnings = [];
  const warn = console.warn;
  console.warn = (...a) => warnings.push(a.join(" "));
  let unmount;
  try {
    unmount = hydrate(client, host);
  } finally {
    console.warn = warn;
  }
  return { host, unmount, warnings };
}
const comments = (host) => {
  const w = document.createTreeWalker(host, NodeFilter.SHOW_COMMENT);
  const out = [];
  while (w.nextNode()) out.push(w.currentNode.data);
  return out;
};
const markerAttrs = (host) => host.querySelectorAll("[data-zoijs-bind], [data-zoijs-h]").length;
const click = (el) => el.dispatchEvent(new window.Event("click", { bubbles: true }));

// ---- matching HTML ------------------------------------------------------------

test("matching HTML: every node is adopted, no warning, status 'hydrated'", () => {
  const App = () => html`<main><h1 class=${"t"}>Hi ${() => "Ada"}</h1><p>${html`<b>${"x"}</b>`}</p></main>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(App, { hydratable: true });
  const h1 = host.querySelector("h1");
  const b = host.querySelector("b");
  const text = b.firstChild.nextSibling; // after the nested slot's start marker
  const warn = console.warn;
  const warnings = [];
  console.warn = (...a) => warnings.push(a.join(" "));
  const unmount = hydrate(App, host);
  console.warn = warn;
  assert.equal(host.querySelector("h1"), h1);
  assert.equal(host.querySelector("b"), b, "nested template element adopted");
  assert.equal(host.querySelector("b").firstChild, text, "nested text node adopted");
  assert.deepEqual(warnings, []);
  assert.deepEqual(unmount.hydration, { status: "hydrated", mismatches: 0 });
  // The DOM ends up as a fresh mount builds it: only anchors, no start/item markers or attributes.
  assert.ok(comments(host).every((c) => c === "zoijs"), comments(host).join());
  assert.equal(markerAttrs(host), 0);
});

// ---- mismatch classes ------------------------------------------------------------

test("missing element: that boundary is rendered on the client, nothing throws", () => {
  const server = () => html`<section><h2>T</h2><p>${"a"}</p></section>`;
  const client = () => html`<section><h2>T</h2><p>${"a"}</p></section>`;
  const { host, unmount, warnings } = run(server, client, { tamper: (h) => h.querySelector("h2").remove() });
  assert.equal(host.innerHTML, "<section><h2>T</h2><p>a<!--zoijs--></p></section>");
  assert.equal(unmount.hydration.status, "client-rendered");
  assert.match(warnings[0], /missing node|different/);
});

test("extra element: rendered on the client, the stray node is gone", () => {
  const App = () => html`<section><p>${"a"}</p></section>`;
  const { host, unmount, warnings } = run(App, App, { tamper: (h) => h.querySelector("section").append(document.createElement("aside")) });
  assert.equal(host.querySelectorAll("aside").length, 0);
  assert.equal(host.innerHTML, "<section><p>a<!--zoijs--></p></section>");
  assert.equal(unmount.hydration.mismatches, 1);
  assert.match(warnings[0], /extra node/);
});

test("changed static text: rendered on the client", () => {
  const server = () => html`<p>Hello ${"x"}</p>`;
  const client = () => html`<p>Goodbye ${"x"}</p>`;
  const { host, unmount, warnings } = run(server, client);
  assert.equal(host.innerHTML, "<p>Goodbye x<!--zoijs--></p>");
  assert.equal(unmount.hydration.status, "client-rendered");
  assert.match(warnings[0], /different text/);
});

test("changed dynamic text: corrected IN PLACE (same node), warned, rest adopted", () => {
  const server = () => html`<p><b>keep</b>${() => "SERVER-VALUE"}</p>`;
  const client = () => html`<p><b>keep</b>${() => "CLIENT-VALUE"}</p>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(server, { hydratable: true });
  const b = host.querySelector("b");
  const textNode = b.nextSibling.nextSibling; // after the start marker
  const warn = console.warn;
  const warnings = [];
  console.warn = (...a) => warnings.push(a.join(" "));
  const unmount = hydrate(client, host);
  console.warn = warn;
  assert.equal(host.querySelector("p").textContent, "keepCLIENT-VALUE");
  assert.equal(host.querySelector("b"), b);
  assert.equal(b.nextSibling, textNode, "the server's text node was kept and updated");
  assert.deepEqual(unmount.hydration, { status: "recovered", mismatches: 1 });
  assert.match(warnings[0], /different text in <p>/);
  assert.ok(!/VALUE/.test(warnings[0]), "values are never printed");
});

test("changed static attribute: rendered on the client; the warning names the attribute only", () => {
  const server = () => html`<a class="old" href=${"/x"}>${"go"}</a>`;
  const client = () => html`<a class="new" href=${"/x"}>${"go"}</a>`;
  const { host, warnings } = run(server, client);
  assert.equal(host.querySelector("a").className, "new");
  assert.match(warnings[0], /different "class"/);
});

test("changed dynamic attribute: the element is adopted and takes the client's value", () => {
  const server = () => html`<p title=${"server"}>${"x"}</p>`;
  const client = () => html`<p title=${"client"}>${"x"}</p>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(server, { hydratable: true });
  const p = host.querySelector("p");
  const unmount = hydrate(client, host);
  assert.equal(host.querySelector("p"), p);
  assert.equal(p.title, "client");
  assert.equal(unmount.hydration.status, "hydrated"); // client-authoritative by design, not a mismatch
});

test("nested mismatch: only the inner boundary is re-rendered; the outer keeps its nodes", () => {
  const Inner = (tag) => (tag === "b" ? html`<b>${"in"}</b>` : html`<i>${"in"}</i>`);
  const server = () => html`<article><h1>${"T"}</h1><div>${Inner("b")}</div></article>`;
  const client = () => html`<article><h1>${"T"}</h1><div>${Inner("i")}</div></article>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(server, { hydratable: true });
  const h1 = host.querySelector("h1");
  const div = host.querySelector("div");
  const warn = console.warn;
  console.warn = () => {};
  const unmount = hydrate(client, host);
  console.warn = warn;
  assert.equal(host.querySelector("h1"), h1);
  assert.equal(host.querySelector("div"), div);
  assert.equal(host.querySelector("b"), null);
  assert.equal(host.querySelector("i").textContent, "in");
  assert.deepEqual(unmount.hydration, { status: "recovered", mismatches: 1 });
});

test("multiple boundaries: a mismatch in one leaves the others adopted", () => {
  const A = (t) => html`<span class="a">${t}</span>`;
  const server = () => html`<div>${A("1")}${html`<em>${"2"}</em>`}${A("3")}</div>`;
  const client = () => html`<div>${A("1")}${html`<strong>${"2"}</strong>`}${A("3")}</div>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(server, { hydratable: true });
  const [s1, s3] = host.querySelectorAll("span");
  const warn = console.warn;
  console.warn = () => {};
  const unmount = hydrate(client, host);
  console.warn = warn;
  const spans = host.querySelectorAll("span");
  assert.equal(spans[0], s1);
  assert.equal(spans[1], s3);
  assert.equal(host.querySelector("em"), null);
  assert.equal(host.querySelector("div").textContent, "123");
  assert.equal(unmount.hydration.mismatches, 1);
});

test("recovery binds once: no duplicate listeners, reactive updates work, cleanup runs", async () => {
  const count = createState(0);
  let clicks = 0;
  let cleanups = 0;
  const Child = (tag) => {
    onCleanup(() => cleanups++);
    return tag === "server"
      ? html`<button onclick=${() => clicks++}>${() => count.get()}</button>`
      : html`<button class="c" onclick=${() => clicks++}>${() => count.get()}</button>`;
  };
  const server = () => html`<div>${Child("server")}</div>`;
  const client = () => html`<div>${Child("client")}</div>`;
  const { host, unmount } = run(server, client);
  assert.equal(host.querySelectorAll("button").length, 1, "no duplicate DOM");
  click(host.querySelector("button"));
  assert.equal(clicks, 1, "exactly one handler");
  count.set(5);
  await tick();
  assert.equal(host.querySelector("button").textContent, "5", "reactive after recovery");
  unmount();
  assert.equal(cleanups, 1, "client component's cleanup ran on unmount");
  assert.equal(host.innerHTML, "");
});

test("adopted content keeps updating and cleans up", async () => {
  const name = createState("Ada");
  const show = createState(true);
  let cleanups = 0;
  const App = () => {
    onCleanup(() => cleanups++);
    return html`<p>${() => (show.get() ? html`<span>${() => name.get()}</span>` : "none")}</p>`;
  };
  const { host, unmount } = run(App);
  const span = host.querySelector("span");
  name.set("Grace");
  await tick();
  assert.equal(host.querySelector("span"), span);
  assert.equal(span.textContent, "Grace");
  show.set(false);
  await tick();
  assert.equal(host.querySelector("p").textContent, "none");
  show.set(true);
  await tick();
  assert.equal(host.querySelector("span").textContent, "Grace");
  unmount();
  assert.equal(cleanups, 1);
});

// ---- markers --------------------------------------------------------------------

test("missing markers (non-hydratable HTML): never silently static — rendered on the client", async () => {
  const n = createState(1);
  const App = () => html`<p><button onclick=${() => n.set(n.peek() + 1)}>${() => n.get()}</button></p>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(App); // no { hydratable: true }
  const warn = console.warn;
  const warnings = [];
  console.warn = (...a) => warnings.push(a.join(" "));
  const unmount = hydrate(App, host);
  console.warn = warn;
  assert.equal(unmount.hydration.status, "client-rendered");
  assert.match(warnings[0], /missing hydration marker.*hydratable: true/);
  click(host.querySelector("button"));
  await tick();
  assert.equal(host.querySelector("button").textContent, "2", "the page is interactive");
  assert.equal(host.querySelectorAll("button").length, 1);
});

test("incomplete markers (one element marker stripped): that boundary is rendered on the client", () => {
  const App = () => html`<form><input value=${"a"}/><button onclick=${() => {}}>${"Go"}</button></form>`;
  const { host, unmount, warnings } = run(App, App, { tamper: (h) => h.querySelector("button").removeAttribute("data-zoijs-bind") });
  assert.equal(host.querySelectorAll("button").length, 1);
  assert.equal(unmount.hydration.status, "client-rendered");
  assert.match(warnings[0], /missing hydration marker/);
});

test("malformed markers (start without its end): rendered on the client, no throw", () => {
  const App = () => html`<p>${"a"}<b>${"b"}</b></p>`;
  const { host, unmount } = run(App, App, { tamper: (h) => h.querySelector("b").lastChild.remove() });
  assert.equal(host.innerHTML, "<p>a<!--zoijs--><b>b<!--zoijs--></b></p>");
  assert.equal(unmount.hydration.status, "client-rendered");
});

test("HTML from an older @zoijs/ssr (outer markers only) still hydrates; nested parts re-render", () => {
  const App = () => html`<div><h1>T</h1>${html`<p>${"x"}</p>`}</div>`;
  const strip = (h) => {
    const w = document.createTreeWalker(h, NodeFilter.SHOW_COMMENT);
    const nested = [];
    while (w.nextNode()) if (w.currentNode.data === "zoijs:(" || w.currentNode.data === "zoijs:)") nested.push(w.currentNode);
    for (const c of nested) c.remove();
  };
  const host = document.createElement("div");
  host.innerHTML = renderToString(App, { hydratable: true });
  strip(host);
  const h1 = host.querySelector("h1");
  const warn = console.warn;
  console.warn = () => {};
  const unmount = hydrate(App, host);
  console.warn = warn;
  assert.equal(host.querySelector("h1"), h1, "outer template adopted");
  assert.equal(host.querySelector("p").textContent, "x");
  assert.equal(unmount.hydration.status, "recovered");
});

test("production mode: recovers the same way, prints nothing", () => {
  configure({ dev: false });
  try {
    const server = () => html`<p>${"a"}</p>`;
    const client = () => html`<div>${"a"}</div>`;
    const { host, unmount, warnings } = run(server, client);
    assert.equal(host.innerHTML, "<div>a<!--zoijs--></div>");
    assert.equal(unmount.hydration.status, "client-rendered");
    assert.deepEqual(warnings, []);
  } finally {
    configure({ dev: true });
  }
});

// ---- lists ----------------------------------------------------------------------

test("each(): items are adopted in place and the list stays keyed", async () => {
  const items = createState([{ id: 1, t: "a" }, { id: 2, t: "b" }, { id: 3, t: "c" }]);
  const App = () => html`<ul>${each(() => items.get(), (x) => x.id, (x) => html`<li>${() => x.t}</li>`)}</ul>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(App, { hydratable: true });
  const [a, b, c] = host.querySelectorAll("li");
  const unmount = hydrate(App, host);
  assert.equal(unmount.hydration.status, "hydrated");
  assert.deepEqual([...host.querySelectorAll("li")], [a, b, c]);
  items.set([{ id: 3, t: "c!" }, { id: 1, t: "a" }]);
  await tick();
  const lis = [...host.querySelectorAll("li")];
  assert.deepEqual(lis, [c, a], "moved, not re-created; the removed item is gone");
  assert.equal(c.textContent, "c!");
  assert.ok(comments(host).every((x) => x === "zoijs"));
});

test("each(): a different item count re-renders just the list", () => {
  const server = () => html`<h1>T</h1><ul>${each(() => [1, 2], (x) => x, (x) => html`<li>${x}</li>`)}</ul>`;
  const client = () => html`<h1>T</h1><ul>${each(() => [1, 2, 3], (x) => x, (x) => html`<li>${x}</li>`)}</ul>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(server, { hydratable: true });
  const h1 = host.querySelector("h1");
  const warn = console.warn;
  console.warn = () => {};
  const unmount = hydrate(client, host);
  console.warn = warn;
  assert.equal(host.querySelector("h1"), h1);
  assert.equal(host.querySelector("ul").textContent, "123");
  assert.equal(unmount.hydration.status, "recovered");
});

test("each(): stray content BETWEEN items re-renders the list, no throw", () => {
  const App = () => html`<ul>${each(() => [1, 2], (x) => x, (x) => html`<li>${x}</li>`)}</ul>`;
  // The <li>'s next sibling is its item's end marker: insert after it, outside any item.
  const { host, unmount, warnings } = run(App, App, { tamper: (h) => h.querySelector("li").nextSibling.after(document.createElement("hr")) });
  assert.equal(host.querySelector("hr"), null);
  assert.equal(host.querySelector("ul").textContent, "12");
  assert.equal(unmount.hydration.status, "recovered");
  assert.match(warnings[0], /different list items in <ul>/);
});

test("each(): stray content INSIDE one item re-renders only that item", () => {
  const App = () => html`<ul>${each(() => [1, 2], (x) => x, (x) => html`<li>${x}</li>`)}</ul>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(App, { hydratable: true });
  const second = host.querySelectorAll("li")[1];
  host.querySelector("li").after(document.createElement("hr"));
  const warn = console.warn;
  const warnings = [];
  console.warn = (...a) => warnings.push(a.join(" "));
  const unmount = hydrate(App, host);
  console.warn = warn;
  assert.equal(host.querySelector("hr"), null);
  assert.equal(host.querySelectorAll("li")[1], second, "the other item was adopted");
  assert.equal(unmount.hydration.mismatches, 1);
  assert.match(warnings[0], /extra node in <ul>/);
});

test("arrays: a different entry count re-renders the slot", () => {
  const server = () => html`<p>${["a", "b"]}</p>`;
  const client = () => html`<p>${["a", "b", "c"]}</p>`;
  const { host, unmount } = run(server, client);
  assert.equal(host.querySelector("p").textContent, "abc");
  assert.equal(unmount.hydration.status, "recovered");
});

test("arrays in a slot are adopted entry by entry", () => {
  const App = () => html`<p>${[html`<b>${"1"}</b>`, "two", html`<i>${"3"}</i>`]}</p>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(App, { hydratable: true });
  const b = host.querySelector("b");
  const unmount = hydrate(App, host);
  assert.equal(host.querySelector("b"), b);
  assert.equal(host.querySelector("p").textContent, "1two3");
  assert.equal(unmount.hydration.status, "hydrated");
});

// ---- form state and focus -------------------------------------------------------

test("form controls inside dynamic content keep identity, value, checked state, focus and selection", async () => {
  const show = createState(true);
  let inputs = 0;
  const Form = () => html`
    <form>
      <input id="name" value=${"server"} oninput=${() => inputs++}/>
      <textarea id="bio">${"hello"}</textarea>
      <input id="agree" type="checkbox" checked=${false}/>
      <select id="size"><option value="s">S</option><option value="m">M</option></select>
    </form>`;
  const App = () => html`<main>${() => (show.get() ? Form() : null)}</main>`;
  const host = document.createElement("div");
  document.body.append(host);
  host.innerHTML = renderToString(App, { hydratable: true });
  const name = host.querySelector("#name");
  const bio = host.querySelector("#bio");
  const agree = host.querySelector("#agree");
  const size = host.querySelector("#size");
  // The user interacts before the app's JavaScript arrives.
  name.value = "typed by user";
  bio.value = "edited bio";
  agree.checked = true;
  size.value = "m";
  name.focus();
  name.setSelectionRange(2, 5);

  const unmount = hydrate(App, host);
  assert.equal(unmount.hydration.status, "hydrated");
  assert.equal(host.querySelector("#name"), name, "same <input>");
  assert.equal(host.querySelector("#bio"), bio, "same <textarea>");
  assert.equal(name.value, "typed by user");
  assert.equal(bio.value, "edited bio");
  assert.equal(agree.checked, true);
  assert.equal(size.value, "m");
  assert.equal(document.activeElement, name, "focus kept");
  assert.deepEqual([name.selectionStart, name.selectionEnd], [2, 5], "selection kept");
  name.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(inputs, 1, "handler attached after hydration, once");
  unmount();
  host.remove();
});

test("untouched controls get the client's bound value; later updates always write", async () => {
  const v = createState("client");
  const App = () => html`<p><input value=${() => v.get()}/></p>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(() => html`<p><input value=${"client"}/></p>`, { hydratable: true });
  hydrate(App, host);
  const input = host.querySelector("input");
  assert.equal(input.value, "client");
  v.set("next");
  await tick();
  assert.equal(input.value, "next");
});

test("an edited control's first value is kept, then reactive writes resume", async () => {
  const v = createState("server");
  const App = () => html`<p><input value=${() => v.get()}/></p>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(App, { hydratable: true });
  const input = host.querySelector("input");
  input.value = "user";
  hydrate(App, host);
  assert.equal(input.value, "user");
  v.set("from app");
  await tick();
  assert.equal(input.value, "from app");
});
