// Security regression tests in REAL browsers — where injected <script> and
// onerror handlers would actually execute if the framework were vulnerable.

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("script injected via a text binding does not execute", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { html, mount } = await import("/src/index.js");
    window.__xss = false;
    const target = document.createElement("div");
    document.body.appendChild(target);
    mount(() => html`<p>${() => "<script>window.__xss = true<\/script>"}</p>`, target);
    await new Promise((r) => setTimeout(r, 20));
    return { executed: window.__xss, hasScript: !!target.querySelector("script"), text: target.querySelector("p").textContent };
  });
  expect(result.executed).toBe(false);
  expect(result.hasScript).toBe(false);
  expect(result.text).toContain("<script>");
});

test("img onerror injected via text binding does not fire", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { html, mount } = await import("/src/index.js");
    window.__xss = false;
    const target = document.createElement("div");
    document.body.appendChild(target);
    mount(() => html`<div>${() => '<img src=x onerror="window.__xss=true">'}</div>`, target);
    await new Promise((r) => setTimeout(r, 50));
    return { executed: window.__xss, hasImg: !!target.querySelector("img") };
  });
  expect(result.executed).toBe(false);
  expect(result.hasImg).toBe(false);
});

test("javascript: URL in href is not set", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { html, mount } = await import("/src/index.js");
    const target = document.createElement("div");
    mount(() => html`<a href=${() => "javascript:window.__xss=true"}>x</a>`, target);
    return target.querySelector("a").hasAttribute("href");
  });
  expect(result).toBe(false);
});

test("a string handler is not wired up or executed", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { html, mount } = await import("/src/index.js");
    window.__pwned = false;
    const target = document.createElement("div");
    document.body.appendChild(target);
    mount(() => html`<button onclick=${"window.__pwned=true"}>x</button>`, target);
    target.querySelector("button").click();
    return window.__pwned;
  });
  expect(result).toBe(false);
});

// SEC-9: a Zoijs-rendered target="_blank" link (bound or static target, the app's own rel kept)
// opens without exposing window.opener and without a Referer.
test("target=_blank links open with no window.opener and no referrer", async ({ page }) => {
  const rels = await page.evaluate(async () => {
    const { html, mount } = await import("/src/index.js");
    const target = document.createElement("div");
    document.body.appendChild(target);
    mount(
      () => html`<a id="bound" href="/browser-tests/fixtures/opener-target.html" target=${"_blank"} rel="external">bound</a>
        <a id="static" target="_blank" href=${"/browser-tests/fixtures/opener-target.html"}>static</a>`,
      target
    );
    return [...target.querySelectorAll("a")].map((a) => a.getAttribute("rel"));
  });
  expect(rels).toEqual(["external noopener noreferrer", "noopener noreferrer"]);

  for (const id of ["#bound", "#static"]) {
    const [popup] = await Promise.all([page.waitForEvent("popup"), page.click(id)]);
    await popup.waitForLoadState();
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    expect(await popup.evaluate(() => document.referrer)).toBe("");
    await popup.close();
  }
});
