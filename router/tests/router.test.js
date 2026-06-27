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

// ---- base path -------------------------------------------------------------

const baseRoutes = {
  "/": () => html`<h1>Home</h1>`,
  "/tasks": () => html`<h1>Tasks</h1>`,
  "/tasks/:id": (p) => html`<h1>Task ${p.id}</h1>`,
  "*": () => html`<h1>NF</h1>`,
};

function setupBase(base, startAppPath = "/") {
  const clean = String(base).replace(/\/$/, "");
  window.history.replaceState({}, "", clean + startAppPath);
  const router = createRouter(baseRoutes, { base });
  const target = document.createElement("div");
  const App = () => html`<nav>${router.link("/", "Home")}${router.link("/tasks", "Tasks")}</nav>
    <main>${router.view()}</main>`;
  const unmount = mount(App, target);
  return {
    router,
    target,
    links: () => target.querySelectorAll("nav a"),
    text: () => target.querySelector("main").textContent.trim(),
    teardown: () => {
      unmount();
      router.destroy();
    },
  };
}

test("base: renders the initial route under a sub-path", { skip }, () => {
  const app = setupBase("/app", "/");
  assert.equal(app.text(), "Home");
  assert.equal(app.router.path(), "/"); // app-level path, not "/app"
  app.teardown();
});

test("base: link href includes the base", { skip }, () => {
  const app = setupBase("/app", "/");
  const [home, tasks] = app.links();
  assert.equal(home.getAttribute("href"), "/app/");
  assert.equal(tasks.getAttribute("href"), "/app/tasks");
  app.teardown();
});

test("base: programmatic navigation prepends the base", { skip }, async () => {
  const app = setupBase("/app", "/");
  app.router.go("/tasks");
  await tick();
  assert.equal(window.location.pathname, "/app/tasks");
  assert.equal(app.router.path(), "/tasks");
  assert.equal(app.text(), "Tasks");
  app.teardown();
});

test("base: link click navigates under the base", { skip }, async () => {
  const app = setupBase("/app", "/");
  app.links()[1].click(); // Tasks
  await tick();
  assert.equal(window.location.pathname, "/app/tasks");
  assert.equal(app.text(), "Tasks");
  app.teardown();
});

test("base: dynamic params work under the base", { skip }, async () => {
  const app = setupBase("/app", "/");
  app.router.go("/tasks/42");
  await tick();
  assert.equal(window.location.pathname, "/app/tasks/42");
  assert.equal(app.text(), "Task 42");
  app.teardown();
});

test("base: query strings work and path() stays base-free", { skip }, async () => {
  const app = setupBase("/app", "/");
  app.router.go("/tasks?filter=active");
  await tick();
  assert.equal(window.location.pathname, "/app/tasks");
  assert.equal(app.router.path(), "/tasks");
  assert.deepEqual(app.router.query(), { filter: "active" });
  app.teardown();
});

test("base: unknown path under the base hits the * route", { skip }, async () => {
  const app = setupBase("/app", "/");
  app.router.go("/nope");
  await tick();
  assert.equal(window.location.pathname, "/app/nope");
  assert.equal(app.text(), "NF");
  app.teardown();
});

test("base: a trailing slash in base is normalized", { skip }, () => {
  const app = setupBase("/app/", "/"); // note the trailing slash
  assert.equal(app.text(), "Home");
  assert.equal(app.links()[1].getAttribute("href"), "/app/tasks"); // no double slash
  app.teardown();
});

test("base: deep link directly to a sub-path route renders it", { skip }, () => {
  const app = setupBase("/app", "/tasks"); // initial URL is /app/tasks
  assert.equal(app.text(), "Tasks");
  assert.equal(app.router.path(), "/tasks");
  app.teardown();
});

test("no base: link href is unchanged (backward compatible)", { skip }, () => {
  const app = setup(routes);
  const [home, about] = app.target.querySelectorAll("nav a");
  assert.equal(home.getAttribute("href"), "/");
  assert.equal(about.getAttribute("href"), "/about");
  app.teardown();
});

// ---- interceptLinks --------------------------------------------------------
// The interceptor listens on `window`, so the app must be CONNECTED to the
// document for a click to bubble up. `content` is raw markup with plain <a>s —
// exactly what rendered Markdown produces.

function setupIntercept(content, options = { interceptLinks: true }) {
  window.history.replaceState({}, "", "/");
  const router = createRouter(routes, options);
  const target = document.createElement("div");
  document.body.appendChild(target); // connect → window receives bubbled clicks
  const App = () => html`<main>${router.view()}</main><div id="content">${content}</div>`;
  const unmount = mount(App, target);
  return {
    router,
    a: (sel) => target.querySelector("#content " + sel),
    teardown: () => {
      unmount();
      router.destroy();
      target.remove();
    },
  };
}

const clickA = (a, init = {}) =>
  a.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));

test("interceptLinks: a plain internal <a> navigates client-side", { skip }, async () => {
  const app = setupIntercept(html`<a href="/about">About</a>`);
  clickA(app.a("a"));
  await tick();
  assert.equal(app.router.path(), "/about"); // routed, no reload
  app.teardown();
});

test("interceptLinks: off by default (a plain <a> is left alone)", { skip }, async () => {
  const app = setupIntercept(html`<a href="/about">About</a>`, {}); // no option
  clickA(app.a("a"));
  await tick();
  assert.equal(app.router.path(), "/"); // not intercepted → router didn't navigate
  app.teardown();
});

test("interceptLinks: bows out for modifier, external, hash, target, download, data-native", { skip }, async () => {
  const app = setupIntercept(html`
    <a id="ext" href="https://example.com/x">external</a>
    <a id="hash" href="#section">hash</a>
    <a id="blank" href="/about" target="_blank">new tab</a>
    <a id="dl" href="/about" download>download</a>
    <a id="native" href="/about" data-native>native</a>
    <a id="mod" href="/about">modifier</a>
  `);
  clickA(app.a("#ext"));
  clickA(app.a("#hash"));
  clickA(app.a("#blank"));
  clickA(app.a("#dl"));
  clickA(app.a("#native"));
  clickA(app.a("#mod"), { metaKey: true });
  await tick();
  assert.equal(app.router.path(), "/"); // none of these were intercepted
  app.teardown();
});

test("interceptLinks: respects base (in-base routed, out-of-base ignored)", { skip }, async () => {
  window.history.replaceState({}, "", "/app/");
  const router = createRouter(baseRoutes, { base: "/app", interceptLinks: true });
  const target = document.createElement("div");
  document.body.appendChild(target);
  const App = () => html`<main>${router.view()}</main>
    <div id="c"><a id="in" href="/app/tasks">tasks</a><a id="out" href="/other">out</a></div>`;
  const unmount = mount(App, target);

  clickA(target.querySelector("#c #out")); // outside base → left for a full navigation
  await tick();
  assert.equal(router.path(), "/"); // unchanged

  clickA(target.querySelector("#c #in")); // inside base → routed client-side, base-free
  await tick();
  assert.equal(router.path(), "/tasks");
  assert.equal(window.location.pathname, "/app/tasks");

  unmount();
  router.destroy();
  target.remove();
});
