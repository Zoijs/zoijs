// path() / query() reactivity (L4, found by Zoijs Insight). In router ≤ 0.6.0 both read ONE cell
// that was replaced on every navigation, so code depending only on the path re-ran on query- or
// hash-only navigation (in Insight that re-ran focus management on every filter click). Path and
// query are now separate, value-gated cells.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, effect } from "@zoijs/core";
import { createRouter } from "../src/index.js";

const tick = () => new Promise((resolve) => setTimeout(resolve));
const until = async (cond) => {
  for (let i = 0; i < 100 && !cond(); i++) await tick(); // condition wait for jsdom's async history traversal
  assert.ok(cond(), "condition not reached");
};

function setup(start = "/a") {
  window.history.replaceState({}, "", start);
  let mounts = 0;
  const Page = (name) => () => {
    mounts++;
    return html`<h1>${name}</h1>`;
  };
  const router = createRouter({ "/a": Page("A"), "/b": Page("B"), "*": Page("404") });
  const runs = { path: 0, query: 0 };
  const seen = { path: [], query: [] };
  const target = document.createElement("div");
  const unmount = mount(() => {
    effect(() => (seen.path.push(router.path()), runs.path++));
    effect(() => (seen.query.push(router.query()), runs.query++));
    return html`<main>${router.view()}</main>`;
  }, target);
  return {
    router,
    runs,
    seen,
    mounts: () => mounts,
    heading: () => target.querySelector("h1"),
    teardown: () => (unmount(), router.destroy()),
  };
}

test("query-only navigation wakes query() readers only; the page stays mounted", async () => {
  const app = setup();
  const h1 = app.heading();
  app.router.go("/a?x=1");
  await tick();
  assert.deepEqual(app.runs, { path: 1, query: 2 });
  assert.deepEqual(app.seen.query[1], { x: "1" });
  assert.equal(app.heading(), h1, "same page component, same DOM");
  assert.equal(app.mounts(), 1);
  app.teardown();
});

test("hash-only navigation wakes neither; an equal query keeps the same object", async () => {
  const app = setup("/a?x=1");
  const q = app.router.query();
  app.router.go("/a?x=1#section");
  await tick();
  assert.deepEqual(app.runs, { path: 1, query: 1 });
  window.history.replaceState({}, "", "/a?x=1&y=2");
  window.history.replaceState({}, "", "/a?x=1"); // same query again, then a popstate
  window.dispatchEvent(new PopStateEvent("popstate"));
  await tick();
  assert.equal(app.router.query(), q);
  assert.equal(app.runs.query, 1);
  app.teardown();
});

test("path-only and combined navigation", async () => {
  const app = setup();
  app.router.go("/b");
  await tick();
  assert.deepEqual(app.runs, { path: 2, query: 1 }, "an empty query stays equal");
  app.router.go("/a?page=2");
  await tick();
  assert.deepEqual(app.runs, { path: 3, query: 2 });
  assert.deepEqual(app.seen.path, ["/a", "/b", "/a"]);
  assert.equal(app.heading().textContent, "A");
  app.teardown();
});

test("an effect reading both runs once per navigation (batched)", async () => {
  window.history.replaceState({}, "", "/a");
  const router = createRouter({ "/a": () => html`<p></p>`, "/b": () => html`<p></p>` });
  let runs = 0;
  const unmount = mount(() => {
    effect(() => (router.path(), router.query(), runs++));
    return html`${router.view()}`;
  }, document.createElement("div"));
  router.go("/b?z=1");
  await tick();
  assert.equal(runs, 2);
  unmount();
});

test("Back / Forward update path and query, with the same wake-up rules", async () => {
  const app = setup();
  app.router.go("/a?x=1");
  await tick();
  app.router.go("/b");
  await tick();
  assert.deepEqual(app.runs, { path: 2, query: 3 });
  window.history.back(); // → /a?x=1
  await until(() => app.router.path() === "/a");
  await tick();
  assert.deepEqual(app.router.query(), { x: "1" });
  assert.deepEqual(app.runs, { path: 3, query: 4 });
  window.history.back(); // → /a (query-only change)
  await until(() => !("x" in app.router.query()));
  await tick();
  assert.deepEqual(app.runs, { path: 3, query: 5 });
  window.history.forward(); // → /a?x=1
  await until(() => app.router.query().x === "1");
  await tick();
  assert.equal(app.runs.path, 3);
  app.teardown();
});

test("direct URL: the initial values come from the address bar", () => {
  const app = setup("/b?tab=2");
  assert.equal(app.router.path(), "/b");
  assert.deepEqual(app.router.query(), { tab: "2" });
  assert.equal(app.heading().textContent, "B");
  app.teardown();
});
