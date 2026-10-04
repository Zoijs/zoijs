// Release-audit regression gate: @zoijs/resource, @zoijs/action and @zoijs/forms must load and
// work through a plain no-build import map that maps only public packages — no
// "@zoijs/core/internal". Their onError reports must still arrive (via the shared runtime).

import { test, expect } from "@playwright/test";

test("core + resource + action + forms load and run from a public-only import map", async ({ page }) => {
  const failedRequests = [];
  page.on("requestfailed", (r) => failedRequests.push(r.url()));
  await page.goto("/forms/browser-tests/fixtures/no-build.html");
  await page.waitForFunction(() => window.__r && (window.__r.loaded || window.__r.error));
  expect(await page.evaluate(() => window.__r.error)).toBeNull();

  await expect(page.locator("#user")).toHaveText("Ada"); // resource resolved
  await expect(page.locator("#broken")).toHaveText("resource down");
  await page.click("#submit"); // forms → action
  await expect(page.locator("#result")).toHaveText("saved ada@example.com");
  await page.click("#fail");
  await expect(page.locator("#fail-error")).toHaveText("action down");

  expect(await page.evaluate(() => window.__r.reports)).toEqual(["resource:resource down", "action:action down"]);
  expect(failedRequests).toEqual([]);
});
