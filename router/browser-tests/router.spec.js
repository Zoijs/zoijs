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
