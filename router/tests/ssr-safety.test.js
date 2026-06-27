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
