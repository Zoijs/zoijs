// Real-browser tests for @zoijs/router (Chromium / Firefox / WebKit).
//
// These focus on what jsdom can only approximate: real client-side navigation
// and the real back/forward buttons. They are written to be base-agnostic — the
// dev server hosts the example at a sub-path, so we drive the app through its own
// links (which use pushState and never trigger a full reload) instead of asserting
// the "/" route. Root-relative behavior (initial route, Home active) is covered by
// the jsdom suite.

import { test, expect } from "@playwright/test";

const base = "/router/examples/basic/";

test("link navigation swaps the page and updates the URL", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("About");
  await expect(page).toHaveURL(/\/about$/);
});

test("dynamic params render", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "User 7", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("User 7");
  await expect(page).toHaveURL(/\/users\/7$/);
});

test("unknown route renders Not Found", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "Broken link", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Not Found");
});

test("real back / forward buttons work", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("About");
  await page.getByRole("link", { name: "User 7", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("User 7");

  await page.goBack();
  await expect(page.locator("main h1")).toHaveText("About");

  await page.goForward();
  await expect(page.locator("main h1")).toHaveText("User 7");
});

test("active link gets aria-current after navigating", async ({ page }) => {
  await page.goto(base);
  const about = page.getByRole("link", { name: "About", exact: true });
  await about.click();
  await expect(about).toHaveAttribute("aria-current", "page");
});

test("interceptLinks: a PLAIN <a> navigates client-side with no full reload", async ({ page }) => {
  await page.goto(base);
  // Reach Home first (the app is hosted at a sub-path with no base, so the initial
  // URL is the "*" route until we navigate via a link).
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByRole("link", { name: "About (plain link)", exact: true })).toBeVisible();

  // Tag the live document. A full page reload would wipe this; client nav keeps it.
  await page.evaluate(() => (window.__noReload = true));
  await page.getByRole("link", { name: "About (plain link)", exact: true }).click();

  await expect(page.locator("main h1")).toHaveText("About");
  await expect(page).toHaveURL(/\/about$/);
  expect(await page.evaluate(() => window.__noReload)).toBe(true); // never reloaded
});

// ---- L4–L6, L8 (found by Zoijs Insight) ------------------------------------------------------
const fixture = "/router/browser-tests/fixtures/links.html";

test("custom link (href/onLinkClick/isActive) and rich link content navigate client-side", async ({ page }) => {
  await page.goto(fixture);
  await page.evaluate(() => (window.__noReload = true));
  const custom = page.locator("a.custom");
  await expect(custom).toHaveAttribute("href", fixture + "/reports");
  await custom.click();
  await expect(page.locator("main h1")).toHaveText("Reports");
  await expect(custom).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Report 7", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Report 7");
  await expect(custom).toHaveAttribute("aria-current", "page"); // exact: false → sub-path
  expect(await page.evaluate(() => window.__noReload)).toBe(true);
});

test("keyboard: Enter on a focused link navigates", async ({ page }) => {
  await page.goto(fixture);
  await page.locator("a.custom").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main h1")).toHaveText("Reports");
});

test("go(path, { replace: true }) adds no history entry; Back skips replaced states", async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("Home");
  const n = await page.evaluate(() => history.length);
  await page.locator("a.custom").click(); // push
  await expect(page.locator("main h1")).toHaveText("Reports");
  await page.evaluate(() => {
    window.__router.go("/reports?q=a", { replace: true });
    window.__router.go("/reports?q=ab", { replace: true });
  });
  expect(await page.evaluate(() => history.length)).toBe(n + 1);
  await expect(page).toHaveURL(/\/reports\?q=ab$/);
  await page.goBack();
  await expect(page.locator("main h1")).toHaveText("Home");
  await page.goForward();
  await expect(page).toHaveURL(/\/reports\?q=ab$/);
  await expect(page.locator("main h1")).toHaveText("Reports");
});

test("path() readers don't re-run on query-only navigation (including Back/Forward)", async ({ page }) => {
  await page.goto(fixture);
  await page.locator("a.custom").click();
  await expect(page.locator("main h1")).toHaveText("Reports");
  const before = await page.evaluate(() => ({ ...window.__counts }));
  await page.evaluate(() => window.__router.go("/reports?page=2"));
  await page.goBack();
  await expect(page).toHaveURL(/\/reports$/);
  await expect.poll(() => page.evaluate(() => window.__counts.query)).toBe(before.query + 2);
  expect(await page.evaluate(() => window.__counts.path)).toBe(before.path);
});

test("a route that returns null renders an empty outlet; navigation continues", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(fixture);
  await page.getByRole("link", { name: "Empty", exact: true }).click();
  await expect(page.locator("main h1")).toHaveCount(0);
  await page.locator("a.custom").click();
  await expect(page.locator("main h1")).toHaveText("Reports");
  expect(errors).toEqual([]);
});
