// Real-browser tests for @zoijs/action (Chromium / Firefox / WebKit).

import { test, expect } from "@playwright/test";

test("form submit: pending disables the button, then shows success", async ({ page }) => {
  await page.goto("/action/examples/form/");
  await page.locator('input[name="name"]').fill("Ada");

  const button = page.getByRole("button");
  await button.click();
  await expect(button).toBeDisabled(); // pending
  await expect(page.locator(".ok")).toHaveText("Saved Ada.");
  await expect(button).toBeEnabled();
});

test("form submit: empty name surfaces an error message", async ({ page }) => {
  await page.goto("/action/examples/form/");
  await page.getByRole("button").click(); // no name entered
  await expect(page.locator('[role="alert"]')).toHaveText("Please enter a name.");
});

test("error handling: failing action shows an alert, reset() dismisses it", async ({ page }) => {
  await page.goto("/action/examples/error-handling/");
  await page.getByRole("button", { name: /Save/ }).click();
  await expect(page.locator('[role="alert"]')).toContainText("Could not save");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test("save button: label switches to Saving… then shows success", async ({ page }) => {
  await page.goto("/action/examples/save-button/");
  const button = page.getByRole("button");
  await button.click();
  await expect(button).toBeDisabled();
  await expect(page.locator(".ok")).toHaveText("Saved successfully.");
});

test("delete button: removes a row on success", async ({ page }) => {
  await page.goto("/action/examples/delete-button/");
  await expect(page.locator("li")).toHaveCount(3);
  await page.locator("li", { hasText: "Beta" }).getByRole("button").click();
  await expect(page.locator("li")).toHaveCount(2);
  await expect(page.locator("li", { hasText: "Beta" })).toHaveCount(0);
});
