// Tests for @zoijs/router. Run with jsdom (see setup-dom.js), which gives us a
// working History API. Navigations update reactive state that flushes on a
// microtask, so the helpers below `await tick()` before asserting the DOM.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, onCleanup } from "@zoijs/core";
import { createRouter } from "../src/index.js";

const skip = typeof window === "undefined" ? "needs a DOM (jsdom)" : false;

// Let queued reactive effects flush.
const tick = () => new Promise((resolve) => setTimeout(resolve));

// Fresh app at "/" for each test; returns the rendered <main> and a teardown.
function setup(routes) {
  window.history.replaceState({}, "", "/");
  const router = createRouter(routes);
  const target = document.createElement("div");
  const App = () => html`<nav>${router.link("/", "Home")}${router.link("/about", "About")}</nav>
    <main>${router.view()}</main>`;
  const unmount = mount(App, target);
  const main = target.querySelector("main");
  return {
    router,
    target,
    main,
    text: () => main.textContent.trim(),
    teardown: () => {
      unmount();
      router.destroy();
    },
  };
}

const routes = {
  "/": () => html`<h1>Home</h1>`,
  "/about": () => html`<h1>About</h1>`,
  "/users/new": () => html`<h1>New user</h1>`,
  "/users/:id": (params) => html`<h1>User ${params.id}</h1>`,
  "*": () => html`<h1>Not Found</h1>`,
};

test("renders the initial route", { skip }, () => {
  const app = setup(routes);
  assert.equal(app.text(), "Home");
  assert.equal(app.router.path(), "/");
  app.teardown();
});

test("link navigation swaps the view", { skip }, async () => {
  const app = setup(routes);
  app.target.querySelectorAll("nav a")[1].click(); // "About"
  await tick();
  assert.equal(app.text(), "About");
  assert.equal(app.router.path(), "/about");
  app.teardown();
});

test("programmatic navigation with go()", { skip }, async () => {
  const app = setup(routes);
  app.router.go("/about");
  await tick();
  assert.equal(app.text(), "About");
  app.teardown();
});

test("dynamic params are passed to the component", { skip }, async () => {
  const app = setup(routes);
  app.router.go("/users/42");
  await tick();
  assert.equal(app.text(), "User 42");
  app.teardown();
});

test("static routes win over param routes", { skip }, async () => {
  const app = setup(routes);
  app.router.go("/users/new");
  await tick();
  assert.equal(app.text(), "New user"); // not "User new"
  app.teardown();
});

test("unknown paths render the * route", { skip }, async () => {
  const app = setup(routes);
  app.router.go("/nope/nowhere");
  await tick();
  assert.equal(app.text(), "Not Found");
  app.teardown();
});

test("query() exposes the query string", { skip }, async () => {
  const app = setup(routes);
  app.router.go("/about?q=hello&page=2");
  await tick();
  assert.deepEqual(app.router.query(), { q: "hello", page: "2" });
  assert.equal(app.text(), "About");
  app.teardown();
});

test("responds to popstate (back / forward buttons)", { skip }, async () => {
  const app = setup(routes);
  app.router.go("/about");
  await tick();
  assert.equal(app.text(), "About");

  // The browser fires "popstate" on back/forward after changing the URL. Emulate
  // a "back" to "/" the same way: move the URL, then dispatch popstate.
  window.history.pushState({}, "", "/");
  window.dispatchEvent(new window.PopStateEvent("popstate"));
  await tick();
  assert.equal(app.text(), "Home");
  app.teardown();
});

test("cleans up the old page when the route changes", { skip }, async () => {
  let cleaned = 0;
  const local = {
    "/": () => html`<h1>Home</h1>`,
    "/live": () => {
      onCleanup(() => cleaned++);
      return html`<h1>Live</h1>`;
    },
    "*": () => html`<h1>NF</h1>`,
  };
  const app = setup(local);
  app.router.go("/live");
  await tick();
  assert.equal(app.text(), "Live");
  assert.equal(cleaned, 0);

  app.router.go("/"); // navigate away → the /live page's onCleanup must fire
  await tick();
  assert.equal(app.text(), "Home");
  assert.equal(cleaned, 1);
  app.teardown();
});

test("link sets aria-current on the active route", { skip }, async () => {
  const app = setup(routes);
  const [home, about] = app.target.querySelectorAll("nav a");
  assert.equal(home.getAttribute("aria-current"), "page");
  assert.equal(about.getAttribute("aria-current"), null);

  app.router.go("/about");
  await tick();
  assert.equal(home.getAttribute("aria-current"), null);
  assert.equal(about.getAttribute("aria-current"), "page");
  app.teardown();
});

test("destroy() removes the popstate listener", { skip }, async () => {
  const app = setup(routes);
  app.teardown(); // unmount + destroy
  // After destroy the popstate listener is gone, so this navigation is ignored:
  // the router's location state is NOT updated (and nothing throws).
  window.history.pushState({}, "", "/about");
  window.dispatchEvent(new window.PopStateEvent("popstate"));
  await tick();
  assert.equal(app.router.path(), "/"); // stale on purpose — proves no sync ran
});
