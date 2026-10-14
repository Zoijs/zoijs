// Hydration in real browsers: server HTML from @zoijs/ssr (rendered here, in Node) adopted by
// mount(…, { hydrate: true }) under a strict CSP with Trusted Types enforced. Covers what jsdom
// can't fully vouch for — real form controls, focus, selection, and CSP/TT enforcement:
//   - matching controls inside dynamic content keep identity, typed value, checked state,
//     selected option, focus and selection range; their handlers work after hydration;
//   - an adopted keyed list moves (not re-creates) items, keeping focus;
//   - a nested mismatch re-renders only that boundary (status "recovered", one dev warning);
//   - HTML without markers is rendered on the client and is interactive ("client-rendered").
// The jsdom suite (ssr/tests/hydration-recovery.test.js) covers every mismatch class in detail.

import { test, expect } from "@playwright/test";
import * as core from "../src/index.js";
import { renderToString } from "../../ssr/src/index.js";
import { makeApps } from "./fixtures/hydration-apps.js";

const apps = makeApps(core);
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; require-trusted-types-for 'script'; trusted-types zoijs";

// Serve a page whose #app holds the server render of `app`, with the CSP as a real header.
async function open(page, app, { hydratable = true } = {}) {
  const body = renderToString(apps[app], { hydratable });
  await page.route("**/__hydration.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      headers: { "Content-Security-Policy": CSP },
      body: `<!doctype html><html><head><meta charset="utf-8"><title>hydration</title>
        <script type="module" src="/browser-tests/fixtures/hydration-client.js"></script></head>
        <body><div id="app">${body}</div></body></html>`,
    })
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/__hydration.html");
  await page.waitForFunction(() => window.__ready);
  return errors;
}

test("form controls in dynamic content keep identity, value, checked, selection and focus", async ({ page }) => {
  const errors = await open(page, "form");
  const before = await page.evaluateHandle(() => ({ name: document.querySelector("#name"), bio: document.querySelector("#bio") }));
  await page.fill("#name", "typed by user");
  await page.fill("#bio", "edited bio");
  await page.check("#agree");
  await page.selectOption("#size", "m");
  await page.focus("#name");
  await page.evaluate(() => document.querySelector("#name").setSelectionRange(2, 5));

  const r = await page.evaluate((b) => {
    const h = window.__hydrate("form");
    const n = document.querySelector("#name");
    return {
      status: h.hydration.status,
      warnings: h.warnings,
      sameInput: n === b.name,
      sameTextarea: document.querySelector("#bio") === b.bio,
      value: n.value,
      bio: document.querySelector("#bio").value,
      checked: document.querySelector("#agree").checked,
      size: document.querySelector("#size").value,
      focused: document.activeElement === n,
      selection: [n.selectionStart, n.selectionEnd],
    };
  }, before);
  expect(r).toEqual({
    status: "hydrated", warnings: [], sameInput: true, sameTextarea: true, value: "typed by user", bio: "edited bio",
    checked: true, size: "m", focused: true, selection: [2, 5],
  });
  await page.keyboard.type("!");
  await expect(page.locator("#count")).toHaveText("1"); // the input handler was attached, once
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  expect(errors).toEqual([]);
});

test("an adopted keyed list moves items on reorder and keeps focus", async ({ page }) => {
  const errors = await open(page, "list");
  const r = await page.evaluate(async () => {
    const lis = [...document.querySelectorAll("li")];
    const h = window.__hydrate("list");
    lis[2].querySelector("input").focus();
    document.querySelector("#rev").click();
    await new Promise((res) => setTimeout(res, 20));
    const now = [...document.querySelectorAll("li")];
    return { status: h.hydration.status, moved: now[0] === lis[2] && now[2] === lis[0], focus: document.activeElement === lis[2].querySelector("input") };
  });
  expect(r).toEqual({ status: "hydrated", moved: true, focus: true });
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a nested mismatch re-renders only that boundary", async ({ page }) => {
  const errors = await open(page, "mismatchServer");
  const r = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const h = window.__hydrate("mismatchClient");
    return { hydration: h.hydration, h1Kept: document.querySelector("h1") === h1, inner: document.querySelector("section").innerHTML, warnings: h.warnings };
  });
  expect(r.hydration).toEqual({ status: "recovered", mismatches: 1 });
  expect(r.h1Kept).toBe(true);
  expect(r.inner).toBe("<i>in<!--zoijs--></i><!--zoijs-->");
  expect(r.warnings).toEqual(["Zoijs hydration: different element in <section>; the client's version replaced it."]);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  expect(errors).toEqual([]);
});

test("HTML without hydration markers is rendered on the client and is interactive", async ({ page }) => {
  const errors = await open(page, "counter", { hydratable: false });
  const r = await page.evaluate(() => window.__hydrate("counter"));
  expect(r.hydration.status).toBe("client-rendered");
  expect(r.warnings[0]).toMatch(/missing hydration marker.*hydratable: true/);
  await page.click("#inc");
  await expect(page.locator("#inc")).toHaveText("1");
  await expect(page.locator("button")).toHaveCount(1);
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  expect(errors).toEqual([]);
});
