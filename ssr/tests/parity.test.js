// Parity tests — the same component renders on the server (renderToString) and on
// the client (mount), and the client takes over server-delivered HTML and is
// interactive. This file needs a DOM, so it sets up jsdom itself (node --test runs
// each file in its own process, so the DOM-free ssr.test.js is unaffected).

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const k of ["Node", "NodeFilter", "Element", "HTMLElement", "Text", "Comment", "DocumentFragment", "Event", "CustomEvent"]) {
  if (dom.window[k]) globalThis[k] = dom.window[k];
}

const { html, mount, each, createState } = await import("@zoijs/core");
const { renderToString, hydrate } = await import("../src/index.js");

const tick = () => new Promise((r) => setTimeout(r, 0));

// The SAME component is used for both server and client — no SSR-specific variant.
const App = () => {
  const items = ["a", "b", "c"];
  return html`
    <main>
      <h1 class=${"title"}>Hi ${() => "there"}</h1>
      <ul>${each(() => items, (x) => x, (x) => html`<li>${() => x}</li>`)}</ul>
    </main>
  `;
};

test("server string and client mount agree on structure and text", () => {
  const server = renderToString(App);
  const serverDoc = new JSDOM(`<div id="r">${server}</div>`).window.document;

  const host = document.createElement("div");
  mount(App, host);

  // Same list length, same heading class, same visible text.
  assert.equal(serverDoc.querySelectorAll("li").length, 3);
  assert.equal(host.querySelectorAll("li").length, 3);
  assert.equal(serverDoc.querySelector("h1").getAttribute("class"), "title");
  assert.equal(host.querySelector("h1").getAttribute("class"), "title");
  assert.equal(
    serverDoc.getElementById("r").textContent.replace(/\s+/g, " ").trim(),
    host.textContent.replace(/\s+/g, " ").trim()
  );
});

test("client mounts over server HTML and becomes interactive", async () => {
  const Counter = () => {
    const c = createState(0);
    return html`<button onclick=${() => c.set(c.get() + 1)}>${() => c.get()}</button>`;
  };

  // 1) Server render is the first paint.
  const server = renderToString(Counter);
  assert.equal(server, "<button>0</button>");

  const host = document.createElement("div");
  host.innerHTML = server; // server-delivered markup, no JS yet
  assert.equal(host.querySelector("button").textContent, "0");

  // 2) Client takes over (mount). The app is now live.
  mount(Counter, host);
  host.querySelector("button").dispatchEvent(new window.Event("click"));
  await tick();
  assert.equal(host.querySelector("button").textContent, "1");
});

test("removing @zoijs/ssr leaves a working client app (mount is core)", () => {
  // mount() comes from @zoijs/core, not ssr — proving the client path is independent.
  const host = document.createElement("div");
  const unmount = mount(App, host);
  assert.equal(host.querySelectorAll("li").length, 3);
  unmount();
  assert.equal(host.querySelectorAll("li").length, 0);
});

// ---- in-place hydration (full SSR) -----------------------------------------

const Counter = () => {
  const c = createState(0);
  return html`<main><h1>Count</h1><button onclick=${() => c.set(c.get() + 1)}>${() => c.get()}</button></main>`;
};

test("hydrate ADOPTS the server elements in place (same node identity, no re-create)", async () => {
  const host = document.createElement("div");
  host.innerHTML = renderToString(Counter, { hydratable: true }); // server payload

  // Capture the exact server nodes before hydrating.
  const serverMain = host.querySelector("main");
  const serverH1 = host.querySelector("h1");
  const serverButton = host.querySelector("button");
  assert.equal(serverButton.textContent, "0"); // server rendered the value

  hydrate(Counter, host);

  // The SAME nodes are still in the document — adopted, not re-created.
  assert.equal(host.querySelector("main"), serverMain);
  assert.equal(host.querySelector("h1"), serverH1);
  assert.equal(host.querySelector("button"), serverButton);

  // No duplicated content, and the event is now live.
  assert.equal(host.querySelectorAll("button").length, 1);
  assert.equal(serverButton.textContent, "0");
  serverButton.dispatchEvent(new window.Event("click"));
  await tick();
  assert.equal(serverButton.textContent, "1"); // reactivity attached to the SAME node
});

test("hydrate does not duplicate static text around a slot", () => {
  const Hi = () => html`<p>Hello, ${() => "Ada"}!</p>`;
  const host = document.createElement("div");
  host.innerHTML = renderToString(Hi, { hydratable: true });
  hydrate(Hi, host);
  assert.equal(host.querySelector("p").textContent, "Hello, Ada!"); // not "Hello, Ada!Ada"
});

test("hydrate adopts a list container and stays interactive", async () => {
  const List = () => {
    const items = createState(["a", "b"]);
    return html`<div>
      <ul>${each(() => items.get(), (x) => x, (x) => html`<li>${() => x}</li>`)}</ul>
      <button onclick=${() => items.set([...items.get(), "c"])}>add</button>
    </div>`;
  };
  const host = document.createElement("div");
  host.innerHTML = renderToString(List, { hydratable: true });
  const serverUl = host.querySelector("ul");
  assert.equal(host.querySelectorAll("li").length, 2); // server rendered 2 items

  hydrate(List, host);
  assert.equal(host.querySelector("ul"), serverUl); // the <ul> element was adopted
  assert.equal(host.querySelectorAll("li").length, 2); // no duplication

  host.querySelector("button").dispatchEvent(new window.Event("click"));
  await tick();
  assert.equal(host.querySelectorAll("li").length, 3); // list is live
});

test("hydrate removes the slot start markers (DOM matches a fresh mount)", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToString(Counter, { hydratable: true });
  hydrate(Counter, host);
  // Start markers are consumed; only the binding anchors remain (as in a fresh mount).
  const comments = [];
  const walk = document.createTreeWalker(host, 128 /* SHOW_COMMENT */);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) comments.push(n.data);
  assert.ok(!comments.includes("zoijs:["), "no leftover slot-start markers");
});
