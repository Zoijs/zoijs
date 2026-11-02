// The lean entry (src/lean.js, src/lean-prod.js; "zoijs-no-hydration"): loaded unbundled, it
// never fetches hydrate.js, renders and reacts under the strict CSP, and refuses to hydrate
// without touching the page.

import { test, expect } from "@playwright/test";

test("lean entry: no hydrate.js request, renders and reacts, refuses to hydrate", async ({ page, browserName }) => {
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await page.goto("/browser-tests/fixtures/lean.html");
  const button = page.locator("#counter");
  await expect(button).toHaveText("0");
  await button.click();
  await expect(button).toHaveText("1");

  expect(requested.filter((p) => p.endsWith("/core/hydrate.js"))).toEqual([]);
  expect(requested).toContain("/src/core/mount.js");
  expect(await page.evaluate(() => window.__hydrateError)).toMatch(/leaves hydration out/);
  expect(await page.evaluate(() => window.__untouched)).toBe(true);
  if (browserName === "chromium") expect(await page.evaluate(() => window.__violations)).toEqual([]); // Trusted Types: Chromium only
});
