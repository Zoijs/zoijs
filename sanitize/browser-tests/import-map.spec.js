// No-build regression (release-blocker bundle 2): @zoijs/sanitize imports @zoijs/core/server, so
// its import map needs that entry. With it, sanitize loads and sanitizes; without it, the page
// can't resolve the module — the README now documents the complete map.

import { test, expect } from "@playwright/test";

test("sanitize loads from a public-only import map that maps @zoijs/core/server", async ({ page }) => {
  await page.goto("/sanitize/browser-tests/fixtures/with-server.html");
  await page.waitForFunction(() => window.__r && window.__r.done);
  const r = await page.evaluate(() => window.__r);
  expect(r.error).toBeNull();
  expect(r.html).toBe('<b id="user-content-x">ok</b><img src="x"><a>l</a>');
  await expect(page.locator("#app article b")).toHaveText("ok");
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test("without the @zoijs/core/server entry the same page fails to load (the entry is required)", async ({ page }) => {
  await page.goto("/sanitize/browser-tests/fixtures/no-server.html");
  await page.waitForFunction(() => window.__r && window.__r.done);
  expect(await page.evaluate(() => window.__r.error)).toMatch(/@zoijs\/core\/server/);
});
