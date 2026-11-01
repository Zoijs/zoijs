// Browser smoke tests for the Admin Dashboard ecosystem demo (Chromium/Firefox/WebKit).
// The app is hosted under a sub-path and passes base: "/examples/admin".

import { test, expect } from "@playwright/test";

const base = "/examples/admin/";

test("overview loads with stat cards", async ({ page }) => {
  await page.goto(base);
  await expect(page.locator("main h1")).toHaveText("Overview");
  await expect(page).toHaveTitle("Overview · Acme Admin");
  await expect(page.locator(".card")).toHaveCount(4); // waits for the stats resource
});

test("users table loads and search filters it", async ({ page }) => {
  await page.goto(base);
  await page.locator(".sidebar").getByRole("link", { name: "Users" }).click();
  await expect(page).toHaveURL(/\/examples\/admin\/users$/);
  await expect(page.locator("table.users tbody tr")).toHaveCount(6);

  await page.locator("input.search").fill("ada");
  await expect(page.locator("table.users tbody tr")).toHaveCount(1);
  await expect(page.locator("table.users tbody tr")).toContainText("Ada Lovelace");
});

test("navigates to a user detail and toggles active state", async ({ page }) => {
  await page.goto(base);
  await page.locator(".sidebar").getByRole("link", { name: "Users" }).click();
  await page.getByRole("link", { name: "Grace Hopper" }).click();
  await expect(page).toHaveURL(/\/examples\/admin\/users\/3$/);
  await expect(page.locator("main h1")).toHaveText("Grace Hopper");
  // Grace starts inactive → the action button offers to Activate.
  await expect(page.getByRole("button", { name: "Activate" })).toBeVisible();
});

test("settings form validates email before saving", async ({ page }) => {
  await page.goto(base);
  await page.locator(".sidebar").getByRole("link", { name: "Settings" }).click();
  const email = page.locator('input[type="email"]');
  await expect(email).toHaveValue("ada@example.com"); // loaded settings
  await email.fill("not-an-email");
  await email.blur();
  await expect(page.getByRole("alert")).toHaveText("Enter a valid email.");

  await email.fill("ada@new.com");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Settings saved.");
});

test("theme toggle persists across a reload", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("button", { name: /Dark/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); // from @zoijs/storage
});

test("language switch re-labels the UI (i18n)", async ({ page }) => {
  await page.goto(base);
  await expect(page.locator(".sidebar")).toContainText("Overview");
  await page.getByLabel("Language").selectOption("fr");
  await expect(page.locator(".sidebar")).toContainText("Aperçu");
  await expect(page.locator("main h1")).toHaveText("Aperçu");
});

test("unknown path hits the Not Found route", async ({ page }) => {
  await page.goto(base);
  await page.evaluate(() => {
    history.pushState({}, "", "/examples/admin/nope");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.locator("main h1")).toHaveText("Page not found");
});
