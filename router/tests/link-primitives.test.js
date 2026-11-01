// Links with your own attributes and handlers (L6, found by Zoijs Insight). `html` can't spread
// attributes, and router ≤ 0.6.0's link() took only (path, text) — so a link with a class, an
// icon, data-/ARIA attributes or an extra handler had to re-implement the click logic. Now
// href(), onLinkClick() and isActive() compose with any <a>, and link() is built from them.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount } from "@zoijs/core";
import { createRouter } from "../src/index.js";

const tick = () => new Promise((resolve) => setTimeout(resolve));
const click = (el, init = {}) => {
  const e = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  el.dispatchEvent(e);
  return e;
};

const routes = {
  "/": () => html`<h1>Home</h1>`,
  "/reports": () => html`<h1>Reports</h1>`,
  "/reports/:id": (p) => html`<h1>Report ${p.id}</h1>`,
  "/search": () => html`<h1>Search</h1>`,
  "*": () => html`<h1>404</h1>`,
};

function setup(view, options) {
  const base = options && options.base ? options.base : "";
  window.history.replaceState({}, "", base + "/");
  const router = createRouter(routes, options);
  const target = document.body.appendChild(document.createElement("div"));
  const unmount = mount(() => html`<nav>${view(router)}</nav><main>${router.view()}</main>`, target);
  return {
    router,
    target,
    $: (s) => target.querySelector(s),
    page: () => target.querySelector("main h1").textContent,
    teardown: () => (unmount(), router.destroy(), target.remove()),
  };
}

test("existing text links keep working (href, client navigation, aria-current)", async () => {
  const app = setup((r) => r.link("/reports", "Reports"));
  const a = app.$("nav a");
  assert.equal(a.getAttribute("href"), "/reports");
  assert.equal(a.textContent, "Reports");
  assert.equal(a.hasAttribute("aria-current"), false);
  assert.equal(click(a).defaultPrevented, true);
  await tick();
  assert.equal(app.page(), "Reports");
  assert.equal(a.getAttribute("aria-current"), "page");
  app.teardown();
});

test("rich and reactive link content", async () => {
  const app = setup((r) => html`${r.link("/reports", html`<svg class="icon"></svg><span>Reports</span>`)}
    ${r.link("/", () => (r.path() === "/" ? "Home (here)" : "Home"))}`);
  const [reports, home] = app.target.querySelectorAll("nav a");
  assert.ok(reports.querySelector("svg.icon"));
  assert.equal(reports.querySelector("span").textContent, "Reports");
  assert.equal(home.textContent, "Home (here)");
  click(reports.querySelector("span")); // a click on a child of the link
  await tick();
  assert.equal(app.page(), "Reports");
  assert.equal(home.textContent, "Home");
  app.teardown();
});

test("custom <a>: own class, data-/ARIA attributes, and an extra handler", async () => {
  const log = [];
  const app = setup((r) => html`<a class="nav-item" data-tooltip="Reports" aria-describedby="hint"
      href=${r.href("/reports")}
      onclick=${(e) => (log.push("analytics"), r.onLinkClick("/reports")(e))}
      aria-current=${() => (r.isActive("/reports", { exact: false }) ? "page" : null)}>Reports</a>`);
  const a = app.$("a.nav-item");
  assert.equal(a.dataset.tooltip, "Reports");
  assert.equal(a.getAttribute("aria-describedby"), "hint");
  click(a);
  await tick();
  assert.deepEqual(log, ["analytics"]);
  assert.equal(app.page(), "Reports");
  assert.equal(a.getAttribute("aria-current"), "page");
  app.router.go("/reports/7");
  await tick();
  assert.equal(a.getAttribute("aria-current"), "page", "exact: false matches sub-paths");
  app.router.go("/");
  await tick();
  assert.equal(a.hasAttribute("aria-current"), false);
  app.teardown();
});

test("isActive(): exact path; a query in the target must match too; exact:false ignores it", async () => {
  const app = setup(() => null);
  const r = app.router;
  r.go("/search?q=zoijs");
  await tick();
  assert.equal(r.isActive("/search"), true);
  assert.equal(r.isActive("/search?q=zoijs"), true);
  assert.equal(r.isActive("/search?q=other"), false);
  assert.equal(r.isActive("/search?q=other", { exact: false }), true);
  assert.equal(r.isActive("/search#results"), true, "the hash never counts");
  assert.equal(r.isActive("?q=zoijs"), true, "a query-only target is relative to the current path");
  assert.equal(r.isActive("/"), false);
  assert.equal(r.isActive("/", { exact: false }), false, "/ is not a prefix of every path");
  r.go("/reports/7");
  await tick();
  assert.equal(r.isActive("/reports", { exact: false }), true);
  assert.equal(r.isActive("/reports/", { exact: false }), true);
  assert.equal(r.isActive("/rep", { exact: false }), false, "segment boundaries, not string prefixes");
  app.teardown();
});

test("keyboard activation: Enter on a focused link fires a plain click", async () => {
  const app = setup((r) => r.link("/reports", "Reports"));
  const a = app.$("nav a");
  a.focus();
  a.click(); // what the browser dispatches for Enter on a link (button 0, no modifiers)
  await tick();
  assert.equal(app.page(), "Reports");
  app.teardown();
});

test("modified, middle, target, download and already-handled clicks are left to the browser", async () => {
  const app = setup((r) => html`${r.link("/reports", "R")}
    <a id="blank" target="_blank" href=${r.href("/reports")} onclick=${r.onLinkClick("/reports")}>new tab</a>
    <a id="self" target="_self" href=${r.href("/reports")} onclick=${r.onLinkClick("/reports")}>same tab</a>
    <a id="dl" download href=${r.href("/reports")} onclick=${r.onLinkClick("/reports")}>file</a>`);
  const a = app.$("nav a");
  for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    assert.equal(click(a, init).defaultPrevented, false, JSON.stringify(init));
  }
  assert.equal(click(app.$("#blank")).defaultPrevented, false);
  assert.equal(click(app.$("#dl")).defaultPrevented, false);
  const handled = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  handled.preventDefault();
  a.dispatchEvent(handled); // another handler already took it
  await tick();
  assert.equal(app.page(), "Home");
  assert.equal(click(app.$("#self")).defaultPrevented, true, "target=_self is still client-side");
  await tick();
  assert.equal(app.page(), "Reports");
  app.teardown();
});

test("external links: href unchanged (even with a base), the browser navigates", () => {
  const app = setup((r) => html`${r.link("https://zoijs.dev/docs", "Docs")}${r.link("//cdn.example/x", "CDN")}`, { base: "/app" });
  const [docs, cdn] = app.target.querySelectorAll("nav a");
  assert.equal(docs.getAttribute("href"), "https://zoijs.dev/docs");
  assert.equal(cdn.getAttribute("href"), "//cdn.example/x");
  assert.equal(app.router.href("/reports"), "/app/reports", "app paths get the base");
  assert.equal(click(docs).defaultPrevented, false);
  assert.equal(click(cdn).defaultPrevented, false);
  app.teardown();
});

test("history: link clicks push one entry each; the same URL is not pushed twice", async () => {
  const app = setup((r) => r.link("/reports", "Reports"));
  const n = window.history.length;
  click(app.$("nav a"));
  click(app.$("nav a"));
  await tick();
  assert.equal(window.history.length, n + 1);
  app.teardown();
});

test("unsafe URLs are still refused by the renderer", () => {
  const app = setup((r) => r.link("javascript:alert(1)", "x"));
  assert.equal(app.$("nav a").hasAttribute("href"), false);
  app.teardown();
});
