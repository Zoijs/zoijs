// CSP / Trusted-Types regression — Zoijs must render and react under the strict
// CSP documented in docs/security.md (require-trusted-types-for 'script';
// trusted-types zoijs) with NO policy violations. This proves the "CSP- and
// Trusted-Types-friendly" claim under real enforcement, not just on paper.
//
// Trusted Types is implemented in Chromium only, so this gate runs there.

import { test, expect } from "@playwright/test";

test("renders and reacts under a strict Trusted-Types CSP with no violations", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Trusted Types is implemented in Chromium only");

  await page.goto("/browser-tests/fixtures/csp.html");

  // The reactive button rendered → Zoijs's `zoijs` Trusted-Types policy was
  // created and used for its template HTML, and no eval / inline script was needed.
  const button = page.locator("#counter");
  await expect(button).toHaveText("0");

  // Bootstrap threw nothing, and no CSP directive was violated while rendering.
  expect(await page.evaluate(() => window.__error)).toBeNull();
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  expect(await page.evaluate(() => window.__rendered)).toBe(true);

  // A fine-grained reactive update works under the CSP (still no eval, no new sink).
  await button.click();
  await expect(button).toHaveText("1");
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
});
