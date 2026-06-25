// Real-browser tests for @zoijs/storage (Chromium / Firefox / WebKit).
// Each test clears localStorage first so reloads start from a known state.

import { test, expect } from "@playwright/test";

// Each test runs in a fresh browser context, so localStorage starts empty —
// no manual clearing needed (and clearing on reload would defeat persistence).

test("theme toggle persists across reload", async ({ page }) => {
  await page.goto("/storage/examples/theme-toggle/");
  await expect(page.getByTestId("theme")).toHaveText("light");

  await page.getByRole("button").click();
  await expect(page.getByTestId("theme")).toHaveText("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.reload();
  await expect(page.getByTestId("theme")).toHaveText("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("draft form persists typed text across reload", async ({ page }) => {
  await page.goto("/storage/examples/draft-form/");
  const box = page.locator("textarea");
  await box.fill("Remember this draft.");
  await expect(page.getByTestId("count")).toHaveText("20 characters saved");

  await page.reload();
  await expect(page.locator("textarea")).toHaveValue("Remember this draft.");
  await expect(page.getByTestId("count")).toHaveText("20 characters saved");
});
