// SSR-safety: under @zoijs/ssr's renderToString there is no `window`/`document`.
// createRouter() reads the URL at creation and view() mounts into a DOM outlet —
// both must degrade gracefully on the server instead of throwing. view() returns
// the matched route's template (serializable), and navigation becomes a no-op.
// (The jsdom setup installs the globals; each test removes them for its duration.)

import test from "node:test";
import assert from "node:assert/strict";
import { html } from "@zoijs/core";
import { isTemplateResult } from "@zoijs/core/server";
import { createRouter } from "../src/index.js";

function withoutBrowser(fn) {
  const savedWin = globalThis.window;
  const savedDoc = globalThis.document;
  globalThis.window = undefined;
  globalThis.document = undefined;
  try {
    return fn();
  } finally {
    globalThis.window = savedWin;
    globalThis.document = savedDoc;
  }
}

const routes = {
  "/": () => html`<h1>Home</h1>`,
  "/about": () => html`<h1>About</h1>`,
  "*": () => html`<h1>Not Found</h1>`,
};

test("createRouter + view() + link() work without window/document (SSR), never throw", () => {
  withoutBrowser(() => {
    let router, view, link;
    assert.doesNotThrow(() => {
      router = createRouter(routes, { interceptLinks: true });
    });
    assert.doesNotThrow(() => {
      view = router.view();
    });
    assert.ok(isTemplateResult(view), "view() returns the matched route's template, not a DOM node");

    assert.doesNotThrow(() => {
      link = router.link("/about", "About");
    });
    assert.ok(isTemplateResult(link), "link() returns a plain template");

    assert.equal(router.path(), "/", "server path defaults to the app root");
    assert.deepEqual(router.query(), {}, "server query defaults to empty");

    assert.doesNotThrow(() => router.go("/about"), "go() is a no-op server-side");
    assert.doesNotThrow(() => router.destroy(), "destroy() is safe with no listeners attached");
  });
});

// ---- routed SSR: { location } + match() -------------------------------------

const paramRoutes = {
  "/": () => html`<h1>Home</h1>`,
  "/about": () => html`<h1>About</h1>`,
  "/users/:id": (params) => html`<h1>User ${params.id}</h1>`,
  "*": () => html`<h1>Not Found</h1>`,
};

test("{ location } makes routed SSR render the request's route (not just '/')", () => {
  withoutBrowser(() => {
    const router = createRouter(paramRoutes, { location: "/about?ref=email" });
    assert.equal(router.path(), "/about", "path reflects the server location");
    assert.deepEqual(router.query(), { ref: "email" }, "query is parsed from location");
    assert.ok(isTemplateResult(router.view()), "view() renders the matched route");
    // default with no location is still "/"
    assert.equal(createRouter(paramRoutes).path(), "/");
  });
});

test("match() resolves a path to { component, params } without rendering", () => {
  withoutBrowser(() => {
    const router = createRouter(paramRoutes, { location: "/users/42" });
    // current location
    const cur = router.match();
    assert.deepEqual(cur.params, { id: "42" }, "params for the current request");
    assert.equal(typeof cur.component, "function");
    // an explicit path (with query, which is ignored for matching)
    assert.deepEqual(router.match("/users/7?tab=posts").params, { id: "7" });
    // a static route → empty params
    assert.deepEqual(router.match("/about").params, {});
    // unmatched → the "*" component, empty params
    assert.deepEqual(router.match("/nope/nope/nope").params, {});
    assert.equal(router.match("/nope/nope/nope").component, paramRoutes["*"]);
  });
});

test("{ location } + match() honor a base path", () => {
  withoutBrowser(() => {
    const router = createRouter(paramRoutes, { base: "/app", location: "/app/users/9" });
    assert.equal(router.path(), "/users/9", "base is stripped from the server path");
    assert.deepEqual(router.match().params, { id: "9" });
    assert.deepEqual(router.match("/app/about").params, {}, "base stripped for explicit paths too");
  });
});
