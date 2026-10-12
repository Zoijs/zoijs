// go(path, { replace: true }) (L5, found by Zoijs Insight). Router ≤ 0.6.0 could only push, so
// URL state that changes often (search-as-you-type, filters, stepping through records) filled
// the history — apps worked around it with history.replaceState + a synthetic popstate.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount } from "@zoijs/core";
import { createRouter } from "../src/index.js";

const tick = () => new Promise((resolve) => setTimeout(resolve));
const until = async (cond) => {
  for (let i = 0; i < 100 && !cond(); i++) await tick(); // condition wait for jsdom's async history traversal
  assert.ok(cond(), "condition not reached");
};

function setup(start = "/list") {
  window.history.replaceState({ mine: 1 }, "", start);
  const router = createRouter({
    "/list": () => html`<h1>List</h1>`,
    "/item/:id": (p) => html`<h1>Item ${p.id}</h1>`,
    "/login": () => html`<h1>Login</h1><p id="form">form</p>`,
  });
  const target = document.body.appendChild(document.createElement("div"));
  const unmount = mount(() => html`<main>${router.view()}</main>`, target);
  return { router, text: () => target.querySelector("h1").textContent, teardown: () => (unmount(), router.destroy(), target.remove()) };
}

test("default go() still pushes; replace doesn't add an entry", () => {
  const app = setup();
  const n = window.history.length;
  app.router.go("/list?q=a", { replace: true });
  assert.equal(window.history.length, n);
  assert.equal(window.location.search, "?q=a");
  assert.deepEqual(app.router.query(), { q: "a" });
  app.router.go("/list?q=ab", { replace: true });
  assert.equal(window.history.length, n);
  app.router.go("/item/1");
  assert.equal(window.history.length, n + 1);
  app.router.go("/item/2", {});
  assert.equal(window.history.length, n + 2, "{} and { replace: false } push");
  app.teardown();
});

test("replace keeps the entry's history state (its saved scroll) and renders the new route", async () => {
  const app = setup();
  app.router.go("/login", { replace: true }); // a redirect
  await tick();
  assert.equal(app.text(), "Login");
  assert.equal(window.history.state.mine, 1);
  app.teardown();
});

test("Back skips replaced states", async () => {
  const app = setup();
  app.router.go("/item/1"); // push
  app.router.go("/item/1?tab=a", { replace: true });
  app.router.go("/item/1?tab=b", { replace: true });
  await tick();
  window.history.back();
  await until(() => app.router.path() === "/list");
  assert.deepEqual(app.router.query(), {});
  window.history.forward();
  await until(() => app.router.path() === "/item/1");
  assert.deepEqual(app.router.query(), { tab: "b" }, "the entry holds the last replaced URL");
  app.teardown();
});

test("query and fragment replacement; no scroll unless there is a reason", async () => {
  const app = setup();
  const scrolls = [];
  const intoView = [];
  const orig = window.scrollTo;
  const origInto = window.Element.prototype.scrollIntoView;
  window.scrollTo = (...a) => scrolls.push(a);
  window.Element.prototype.scrollIntoView = function () {
    intoView.push(this.id);
  };
  try {
    app.router.go("/list?page=2", { replace: true }); // same page, query change → keep scroll
    assert.deepEqual(scrolls, []);
    app.router.go("/list?page=2#missing", { replace: true }); // no such target → keep scroll
    assert.equal(window.location.hash, "#missing");
    assert.deepEqual(scrolls, []);
    app.router.go("/login#form", { replace: true }); // page change, target exists → scroll to it
    assert.deepEqual(scrolls, [], "scrolled to the element, not to the top");
    assert.deepEqual(intoView, ["form"]);
    app.router.go("/item/3", { replace: true }); // page change, no hash → top
    assert.deepEqual(scrolls, [[0, 0]]);
  } finally {
    window.scrollTo = orig;
    window.Element.prototype.scrollIntoView = origInto;
  }
  app.teardown();
});

test("invalid paths throw like go(); a same-URL replace is a no-op; bad options are tolerated", () => {
  const app = setup();
  const n = window.history.length;
  assert.throws(() => app.router.go("https://evil.example/", { replace: true }), TypeError);
  assert.throws(() => app.router.go("//evil.example", { replace: true }), TypeError);
  assert.throws(() => app.router.go("javascript:alert(1)", { replace: true }), TypeError);
  assert.equal(window.location.pathname, "/list");
  app.router.go("/list", { replace: true });
  app.router.go("/list?x=1", null); // null options → a normal push
  assert.equal(window.history.length, n + 1);
  app.teardown();
});

test("replace with a base prepends it", () => {
  window.history.replaceState({}, "", "/app/list");
  const router = createRouter({ "/list": () => html`<p></p>` }, { base: "/app" });
  const unmount = mount(() => html`${router.view()}`, document.createElement("div"));
  router.go("/list?q=1", { replace: true });
  assert.equal(window.location.pathname + window.location.search, "/app/list?q=1");
  unmount();
  router.destroy();
});
