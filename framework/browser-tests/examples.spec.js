// Smoke tests for the example apps, run in real browsers (Chromium/Firefox/WebKit).

import { test, expect } from "@playwright/test";

test("counter: increment / decrement", async ({ page }) => {
  await page.goto("/examples/counter/");
  const count = page.locator(".count");
  await expect(count).toHaveText("0");
  await page.getByRole("button", { name: "Increment" }).click();
  await page.getByRole("button", { name: "Increment" }).click();
  await page.getByRole("button", { name: "Decrement" }).click();
  await expect(count).toHaveText("1");
});

test("input: live text + length", async ({ page }) => {
  await page.goto("/examples/input/");
  await page.locator("input").fill("Hello Zoijs");
  await expect(page.locator("strong")).toHaveText("Hello Zoijs");
  await expect(page.locator("p").nth(1)).toHaveText("Length: 11");
});

test("todo: add / clear input / toggle / delete", async ({ page }) => {
  await page.goto("/examples/todo/");
  const input = page.locator('input[type="text"]');
  await input.fill("A");
  await page.getByRole("button", { name: "Add" }).click();
  await input.fill("B");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.locator("li")).toHaveCount(2);
  await expect(input).toHaveValue(""); // property binding cleared it

  await page.locator("li").nth(1).getByRole("checkbox").check();
  await expect(page.locator(".count")).toHaveText("1 remaining");

  await page.locator("li").first().locator(".del").click();
  await expect(page.locator("li")).toHaveCount(1);
  await expect(page.locator("li span")).toHaveText("B");
});

test("computed: derived full name + parity", async ({ page }) => {
  await page.goto("/examples/computed/");
  await expect(page.locator("strong").first()).toHaveText("Jane Doe");
  await page.locator("input").first().fill("John");
  await expect(page.locator("strong").first()).toHaveText("John Doe");
  await page.getByRole("button", { name: "+1" }).click();
  await expect(page.locator("strong").nth(1)).toHaveText("odd");
});

test("reorder: reverse moves items", async ({ page }) => {
  await page.goto("/examples/reorder/");
  await page.getByRole("button", { name: "Reverse" }).click();
  await expect(page.locator("li").first()).toHaveText("Item 5");
  await expect(page.locator("li").last()).toHaveText("Item 1");
});

test("input-preservation: value survives reorder", async ({ page }) => {
  await page.goto("/examples/input-preservation/");
  const row2 = page.locator("li", { hasText: "Row 2" }).locator("input");
  await row2.fill("preserved");
  await page.getByRole("button", { name: "Reverse" }).click();
  await expect(page.locator("li", { hasText: "Row 2" }).locator("input")).toHaveValue("preserved");
});
