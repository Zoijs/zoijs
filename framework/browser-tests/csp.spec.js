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

// SEC-3: unsafeHTML() under ENFORCED Trusted Types — the app's TrustedHTML renders; a plain
// string is refused with Zoijs's clear error (one blocked sink, nothing rendered), proving the
// raw path never borrows the `zoijs` policy.
test("unsafeHTML: TrustedHTML renders, a plain string is refused under enforced Trusted Types", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Trusted Types is implemented in Chromium only");

  await page.goto("/browser-tests/fixtures/csp-unsafe.html");
  await page.waitForFunction(() => window.__unsafe && window.__unsafe.done);

  const state = await page.evaluate(() => window.__unsafe);
  expect(state.error).toBeNull();
  await expect(page.locator("#trusted b.raw")).toHaveText("trusted");
  expect(state.string).toMatch(/Trusted Types are enforced — pass unsafeHTML\(\) a TrustedHTML/);
  await expect(page.locator("#string b")).toHaveCount(0);
  const violations = await page.evaluate(() => window.__violations);
  expect(violations).toHaveLength(1); // the refused string assignment, nothing else
  expect(violations[0]).toContain("require-trusted-types-for");
});

// Release-audit blocker: two PHYSICAL core copies under `trusted-types zoijs` (no
// 'allow-duplicates') share ONE policy through the CORE-2 runtime, so both render.
test("two core copies share one zoijs Trusted Types policy (no 'allow-duplicates' needed)", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Trusted Types is implemented in Chromium only");

  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/browser-tests/fixtures/csp-two-cores.html");
  await page.waitForFunction(() => window.__r && window.__r.done);

  const r = await page.evaluate(() => window.__r);
  expect(r.error).toBeNull();
  expect(r.policies).toBe(1); // created once, reused by the second copy
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
  await expect(page.locator("#from-a")).toHaveText("A 0");
  await expect(page.locator("#from-b")).toHaveText("B 0");
  await expect(page.locator("#b-result")).toHaveText("B template in A"); // SEC-1 across copies
  await expect(page.locator("#child")).toHaveText("child of B"); // CORE-1 across copies
  expect(r.reports).toEqual(["binding:boom"]); // CORE-3: A's failure, B's hook
  expect(r.sec2).toBe("ZJS010"); // SEC-2 still enforced

  await page.evaluate(() => window.__r.inc()); // one shared reactive graph
  await expect(page.locator("#from-a")).toHaveText("A 1");
  await expect(page.locator("#from-b")).toHaveText("B 1");
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
});

// L7 (found by Zoijs Insight): style bindings under a strict `style-src 'self'` — no
// 'unsafe-inline', no style-src-attr. Core ≤ 1.9.0 used setAttribute("style"), which every engine
// refuses there; bindings now write through the CSSOM, which CSP doesn't govern. All engines.
test("style bindings apply under a strict style-src policy with no violations", async ({ page }) => {
  await page.goto("/browser-tests/fixtures/csp-style.html");
  await page.waitForFunction(() => window.__rendered || window.__error);
  expect(await page.evaluate(() => window.__error)).toBeNull();

  const css = (sel, prop) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s)).getPropertyValue(p).trim(), [sel, prop]);
  expect(await css("#obj", "height")).toBe("10px");
  expect(await css("#obj", "--gap")).toBe("6px");
  expect(await css("#obj", "opacity")).toBe("0.5");
  expect(await css("#str", "width")).toBe("33px");
  expect(await css("#str", "color")).toBe("rgb(0, 128, 0)");
  expect(await css("#mixed", "width")).toBe("20px");
  expect(await css("#mixed", "border-top-width")).toBe("0px"); // no border-style → computed 0
  expect(await css("#swap", "color")).toBe("rgb(255, 0, 0)");
  expect(await css("#swap", "margin-top")).toBe("4px");
  expect(await css("#rect", "fill")).toBe("rgb(255, 0, 0)");

  await page.evaluate(() => (window.__style.grow(), window.__style.swap()));
  await expect.poll(() => css("#obj", "height")).toBe("20px");
  expect(await css("#mixed", "width")).toBe("40px");
  expect(await css("#swap", "color")).toBe("rgb(0, 0, 255)");
  expect(await css("#swap", "margin-top")).toBe("0px"); // stale declaration removed

  await page.evaluate(() => window.__style.clear());
  await expect.poll(() => page.evaluate(() => document.querySelector("#swap").hasAttribute("style"))).toBe(false);

  expect(await page.evaluate(() => window.__violations)).toEqual([]);
});
