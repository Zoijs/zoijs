// Route components that render nothing (L8, found by Zoijs Insight). `RouteComponent` allows
// `null`, and with no "*" route the default not-found component returns null too — but router
// ≤ 0.6.0 handed that null to mount(), which threw "expected an html`…` template result". A null
// route now renders an empty outlet.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, onCleanup } from "@zoijs/core";
import { createRouter } from "../src/index.js";

const tick = () => new Promise((resolve) => setTimeout(resolve));

function setup(routes, start) {
  window.history.replaceState({}, "", start);
  const router = createRouter(routes);
  const target = document.createElement("div");
  const unmount = mount(() => html`<main>${router.view()}</main>`, target);
  const outlet = target.querySelector(".zoijs-router-outlet");
  return { router, outlet, teardown: () => (unmount(), router.destroy()) };
}

test("initial null route renders an empty outlet", () => {
  const app = setup({ "/empty": () => null, "/": () => html`<h1>Home</h1>` }, "/empty");
  assert.equal(app.outlet.childNodes.length, 0);
  app.teardown();
});

test("no '*' route: an unmatched URL renders nothing instead of throwing", () => {
  const app = setup({ "/": () => html`<h1>Home</h1>` }, "/does-not-exist");
  assert.equal(app.outlet.textContent, "");
  app.teardown();
});

test("navigating to and away from a null route cleans up and renders the next route", async () => {
  const cleaned = [];
  const app = setup(
    {
      "/a": () => (onCleanup(() => cleaned.push("a")), html`<h1>A</h1><p>more</p>`),
      "/empty": () => (onCleanup(() => cleaned.push("empty")), null),
      "/b": () => html`<h1>B</h1>`,
    },
    "/a"
  );
  assert.equal(app.outlet.querySelectorAll("h1, p").length, 2);
  app.router.go("/empty");
  await tick();
  assert.deepEqual(cleaned, ["a"], "the previous page was disposed");
  assert.equal(app.outlet.childNodes.length, 0, "no stale DOM");
  app.router.go("/b");
  await tick();
  assert.deepEqual(cleaned, ["a", "empty"], "the null route's own cleanup ran");
  assert.equal(app.outlet.textContent, "B");
  app.teardown();
});

test("undefined is treated like null; a throwing route still throws (no silent swallowing)", () => {
  const app = setup({ "/u": () => undefined }, "/u");
  assert.equal(app.outlet.childNodes.length, 0);
  app.teardown();
  window.history.replaceState({}, "", "/boom");
  const router = createRouter({ "/boom": () => { throw new Error("route failed"); } });
  assert.throws(() => mount(() => html`${router.view()}`, document.createElement("div")), /route failed/);
  router.destroy();
});
