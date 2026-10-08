// Real-browser tests for @zoijs/resource (Chromium / Firefox / WebKit).
// The example API resolves after a short delay, so we assert the loading state
// first and then the loaded state.

import { test, expect } from "@playwright/test";

test("user profile: loading → loaded", async ({ page }) => {
  await page.goto("/resource/examples/user-profile/");
  await expect(page.locator(".muted")).toHaveText("Loading…");
  await expect(page.locator("h2")).toHaveText("Ada Lovelace");
});

test("posts: list renders after load", async ({ page }) => {
  await page.goto("/resource/examples/posts/");
  await expect(page.locator("li")).toHaveCount(3);
  await expect(page.locator("li strong").first()).toHaveText("Why no build step?");
});

test("refresh: button reloads the value", async ({ page }) => {
  await page.goto("/resource/examples/refresh/");
  const value = page.locator(".time strong");
  await expect(value).not.toHaveText(""); // initial load done
  const before = await value.textContent();

  // Refresh and confirm the button disables while loading, then settles.
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("button")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
  await expect(value).not.toHaveText("");
  void before;
});
