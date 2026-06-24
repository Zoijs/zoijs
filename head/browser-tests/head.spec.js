// Real-browser tests for @zoijs/head (Chromium / Firefox / WebKit).
//
// The router-title example is hosted at a sub-path, so its initial route is the
// "*" page. We drive it through its own links (absolute "/" and "/about") and
// confirm the title + description update on navigation — base-agnostic.

import { test, expect } from "@playwright/test";

const base = "/head/examples/router-title/";

const description = (page) =>
  page.locator('head meta[name="description"]').getAttribute("content");

test("basic title example sets document.title", async ({ page }) => {
  await page.goto("/head/examples/basic-title/");
  await expect(page).toHaveTitle("Welcome | Zoijs App");
});

test("router pages update the title as you navigate", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveTitle("About | Zoijs Head Demo");

  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveTitle("Home | Zoijs Head Demo");
});

test("router pages update the meta description as you navigate", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect.poll(() => description(page)).toBe("The about page of the head + router demo.");

  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect.poll(() => description(page)).toBe("The home page of the head + router demo.");
});
