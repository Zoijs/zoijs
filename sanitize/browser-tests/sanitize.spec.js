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
