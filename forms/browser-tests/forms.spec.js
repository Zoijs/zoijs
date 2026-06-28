// Real-browser tests for @zoijs/forms (Chromium / Firefox / WebKit), driving the
// login example.

import { test, expect } from "@playwright/test";

test("typing updates the form state (controlled value round-trips)", async ({ page }) => {
  await page.goto("/forms/examples/login/");
  const email = page.locator('input[name="email"]');
  await email.pressSequentially("user@example.com");
  await expect(email).toHaveValue("user@example.com");
});

test("blur marks the field touched", async ({ page }) => {
  await page.goto("/forms/examples/login/");
  const email = page.locator('input[name="email"]');
  await expect(page.locator("label.field").first()).not.toHaveClass(/touched/);
  await email.focus();
  await email.blur();
  await expect(page.locator("label.field").first()).toHaveClass(/touched/);
});

test("submit validates first, then calls the action", async ({ page }) => {
  await page.goto("/forms/examples/login/");

  // Invalid submit: errors show, no success.
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("err-email")).toBeVisible();
  await expect(page.getByTestId("err-password")).toBeVisible();
  await expect(page.getByTestId("ok")).toHaveCount(0);

  // Valid submit: the action runs and its result shows.
  await page.locator('input[name="email"]').fill("user@example.com");
  await page.locator('input[name="password"]').fill("supersecret");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("ok")).toHaveText("Welcome, user@example.com!");
});

test("reset clears the fields", async ({ page }) => {
  await page.goto("/forms/examples/login/");
  await page.locator('input[name="email"]').fill("user@example.com");
  await page.locator('input[name="password"]').fill("supersecret");
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.locator('input[name="email"]')).toHaveValue("");
  await expect(page.locator('input[name="password"]')).toHaveValue("");
});
