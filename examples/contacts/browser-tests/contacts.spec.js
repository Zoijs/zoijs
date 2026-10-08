// Browser smoke tests for the Contacts CRM demo (Chromium/Firefox/WebKit).
// Hosted under a sub-path with base: "/examples/contacts". The static server has no
// SPA fallback, so every test starts at the base and navigates client-side.

import { test, expect } from "@playwright/test";

const base = "/examples/contacts/";

test("list loads and search filters it", async ({ page }) => {
  await page.goto(base);
  await expect(page.locator("main h1")).toHaveText("Contacts");
  await expect(page.locator("ul.contacts li")).toHaveCount(4);

  await page.locator("input.search").fill("nasa");
  await expect(page.locator("ul.contacts li")).toHaveCount(1);
  await expect(page.locator("ul.contacts li")).toContainText("Katherine Johnson");
});

test("opens a contact's detail", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "Grace Hopper" }).click();
  await expect(page).toHaveURL(/\/examples\/contacts\/3$/);
  await expect(page.locator("main h1")).toContainText("Grace Hopper");
  await expect(page.locator("dl.detail")).toContainText("grace@example.com");
});

test("create flow: validation blocks, then a valid contact is added", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "+ New contact" }).click();
  await expect(page).toHaveURL(/\/examples\/contacts\/new$/);

  // Invalid email shows an inline error after the field is touched.
  await page.locator('input[type="email"]').fill("bad");
  await page.locator('input[type="email"]').blur();
  await expect(page.getByRole("alert")).toContainText("Enter a valid email.");

  // Fill valid values and submit → navigates to the new contact's detail.
  await page.getByLabel("Name").fill("Margaret Hamilton");
  await page.locator('input[type="email"]').fill("margaret@example.com");
  await page.getByLabel("Company").fill("MIT");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.locator("main h1")).toContainText("Margaret Hamilton");

  // It's now in the list.
  await page.getByRole("link", { name: "← Contacts" }).click();
  await expect(page.locator("ul.contacts li")).toHaveCount(5);
});

test("edit flow updates a contact", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "Alan Turing" }).click();
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/examples\/contacts\/2\/edit$/);

  const company = page.getByLabel("Company");
  await company.fill("Manchester University");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/examples\/contacts\/2$/);
  await expect(page.locator("dl.detail")).toContainText("Manchester University");
});

test("delete flow removes a contact", async ({ page }) => {
  await page.goto(base);
  await page.getByRole("link", { name: "Katherine Johnson" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/examples\/contacts\/?$/);
  await expect(page.locator("ul.contacts li")).toHaveCount(3);
});

test("unknown path hits the Not Found route", async ({ page }) => {
  await page.goto(base);
  await page.evaluate(() => {
    history.pushState({}, "", "/examples/contacts/zzz/edit/nope");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.locator("main h1")).toHaveText("Page not found");
});
