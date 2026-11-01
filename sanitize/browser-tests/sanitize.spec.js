// Real-browser tests for @zoijs/sanitize (Chromium / Firefox / WebKit) — where a
// surviving <script>, onerror, or javascript: URL would ACTUALLY execute if the
// sanitizer let it through. jsdom can't prove non-execution; a real browser can.

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/sanitize/examples/basic/");
  await page.waitForFunction(() => !!window.sanitizeTest);
});

// Push a payload through sanitize(), insert the result into the live document, and
// report whether anything executed and which dangerous nodes (if any) survived.
async function probe(page, payload) {
  return page.evaluate(async (p) => {
    const host = window.sanitizeTest.run(p);
    await new Promise((r) => setTimeout(r, 60)); // let any onerror/onload/script fire
    return {
      xss: window.__xss === true,
      dangerous: !!host.querySelector("script, svg, iframe, object, embed, form, style, base"),
      html: host.innerHTML,
    };
  }, payload);
}

const PAYLOADS = [
  "<script>window.__xss = true<\/script>",
  '<img src=x onerror="window.__xss = true">',
  "<svg><script>window.__xss = true<\/script></svg>",
  "<svg onload=\"window.__xss = true\"></svg>",
  '<iframe src="javascript:window.__xss = true"></iframe>',
  '<a href="javascript:window.__xss = true">x</a>',
  "<details open ontoggle=\"window.__xss = true\">x</details>",
  '<object data="data:text/html,<script>window.__xss=true</script>"></object>',
];

for (const payload of PAYLOADS) {
  test(`does not execute: ${payload.slice(0, 40)}`, async ({ page }) => {
    const r = await probe(page, payload);
    expect(r.xss, `executed for: ${payload}`).toBe(false);
    expect(r.dangerous, `dangerous element survived for: ${payload}`).toBe(false);
    expect(r.html).not.toMatch(/javascript:/i);
  });
}

test("legitimate rich text is rendered", async ({ page }) => {
  const article = page.getByTestId("output");
  await expect(article.getByRole("heading", { name: "Release notes" })).toBeVisible();
  const link = article.getByRole("link", { name: "docs" });
  await expect(link).toHaveAttribute("href", "https://zoijs.dev");
  await expect(link).toHaveAttribute("rel", /noopener/);
  // the injected <script>/onclick/javascript: link left nothing dangerous behind
  await expect(article.locator("script")).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss === true)).toBe(false);
});

// SEC-8: in a real browser, ids and <a name> become named properties of window. Sanitized
// content must not be able to claim page-level names like __DATA__ / config / location.
test("sanitized content cannot clobber window globals", async ({ page }) => {
  const r = await page.evaluate(() => {
    window.sanitizeTest.run('<a id="__DATA__" name="config" href="#__DATA__">x</a><p id="location">l</p>');
    return {
      data: typeof window.__DATA__,
      config: typeof window.config,
      location: Object.prototype.toString.call(window.location),
      namespaced: !!document.getElementById("user-content-__DATA__"),
      href: document.getElementById("user-content-__DATA__")?.getAttribute("href"),
    };
  });
  expect(r.data).toBe("undefined");
  expect(r.config).toBe("undefined");
  expect(r.location).toBe("[object Location]");
  expect(r.namespaced).toBe(true);
  expect(r.href).toBe("#user-content-__DATA__");
});

// Trusted Types: sanitize() parses through its own `zoijs-sanitize` policy, so it works on a page
// enforcing `require-trusted-types-for 'script'` that lists the policy — and fails with a clear,
// actionable error (never a silent bypass) on one that doesn't. Trusted Types is Chromium-only.
test.describe("under enforced Trusted Types", () => {
  test("works when the CSP allows zoijs-sanitize (no violations, nothing executes)", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Trusted Types is implemented in Chromium only");
    await page.goto("/sanitize/browser-tests/fixtures/tt-allowed.html");
    await page.waitForFunction(() => window.__r && window.__r.done);
    await page.waitForTimeout(60); // let any onerror fire, if something slipped through
    const r = await page.evaluate(() => ({ ...window.__r, violations: window.__violations, xss: window.__xss === true }));
    expect(r.error).toBeNull();
    expect(r.html).toBe('<p id="user-content-x">ok <b>bold</b></p><img src="x">');
    expect(r.violations).toEqual([]);
    expect(r.xss).toBe(false);
    await expect(page.locator("#app article b")).toHaveText("bold");
  });

  test("fails with a clear error when the CSP doesn't list zoijs-sanitize", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Trusted Types is implemented in Chromium only");
    await page.goto("/sanitize/browser-tests/fixtures/tt-missing.html");
    await page.waitForFunction(() => window.__r && window.__r.done);
    const r = await page.evaluate(() => window.__r);
    expect(r.error).toMatch(/add it to your CSP: trusted-types zoijs zoijs-sanitize/);
    expect(r.html).toBeNull();
  });
});
