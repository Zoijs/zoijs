// Real-browser tests for @zoijs/api (Chromium / Firefox / WebKit): the platform's own fetch, URL
// parsing and same-origin enforcement, not stubs. The page is served from http://127.0.0.1:3900;
// http://localhost:3900 is the same server on ANOTHER origin.

import { test, expect } from "@playwright/test";

const EXAMPLE = "/api/examples/tasks/";

test("example: loading → list; API text renders as text", async ({ page }) => {
  await page.goto(EXAMPLE);
  const items = page.locator("#tasks li");
  await expect(items).toHaveCount(3);
  await expect(items.first()).toHaveText("Write docs");
  await expect(items.nth(2)).toHaveText("<b>Not bold</b> — API data is text");
  await expect(page.locator("#tasks li b")).toHaveCount(0);
});

test("example: refresh() sends another GET", async ({ page }) => {
  await page.goto(EXAMPLE);
  await expect(page.locator("#tasks li")).toHaveCount(3);
  const again = page.waitForRequest((r) => r.url().endsWith("/data/tasks.json") && r.method() === "GET");
  await page.getByRole("button", { name: "Refresh" }).click();
  await again;
  await expect(page.locator("#tasks li")).toHaveCount(3);
});

test("example: a 404 is a structured http ApiError", async ({ page }) => {
  await page.goto(EXAMPLE);
  const alert = page.locator("#missing [role=alert]");
  await expect(alert).toHaveAttribute("data-type", "http");
  await expect(alert).toHaveAttribute("data-status", "404");
  await expect(alert).toHaveText("GET request failed: 404 Not Found");
});

test("example: a cross-origin URL is blocked before any request", async ({ page }) => {
  const external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:3900/")) external.push(r.url());
  });
  await page.goto(EXAMPLE);
  const alert = page.locator("#cross-origin [role=alert]");
  await expect(alert).toHaveAttribute("data-type", "security");
  await expect(alert).toContainText("https://example.com is not the page's origin");
  await expect(page.locator("#tasks li")).toHaveCount(3);
  expect(external).toEqual([]);
});

// Runs api() in the page and resolves with its settled state.
async function run(page, url) {
  return page.evaluate(async (url) => {
    const { api } = await import("/api/src/index.js");
    const r = api(url);
    for (let i = 0; i < 200 && r.loading(); i++) await new Promise((res) => setTimeout(res, 10));
    const e = r.error();
    return { data: r.data(), error: e && { name: e.name, type: e.type, status: e.status, method: e.method, url: e.url, message: e.message } };
  }, url);
}

test("real fetch: JSON with charset parses; 204 is null; text is a string", async ({ page }) => {
  await page.route("**/__api/empty", (r) => r.fulfill({ status: 204 }));
  await page.route("**/__api/text", (r) => r.fulfill({ status: 200, contentType: "text/plain", body: "<script>window.__pwned=1</script>" }));
  await page.route("**/__api/problem", (r) => r.fulfill({ status: 200, headers: { "Content-Type": "application/problem+json" }, body: '{"title":"ok"}' }));
  await page.goto(EXAMPLE);
  expect((await run(page, "./data/tasks.json")).data).toHaveLength(3); // test-server: application/json; charset=utf-8
  expect(await run(page, "/__api/empty")).toEqual({ data: null, error: null });
  expect(await run(page, "/__api/text")).toEqual({ data: "<script>window.__pwned=1</script>", error: null });
  expect((await run(page, "/__api/problem")).data).toEqual({ title: "ok" });
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test("real fetch: cross-origin, protocol-relative and backslash URLs are refused", async ({ page }) => {
  await page.goto(EXAMPLE);
  for (const url of ["http://localhost:3900/api/examples/tasks/data/tasks.json", "//localhost:3900/x", "/\\localhost:3900/x", "https://127.0.0.1:3900/x"]) {
    const { data, error } = await run(page, url);
    expect(data, url).toBeUndefined();
    expect(error.type, url).toBe("security");
  }
  expect((await run(page, "http://127.0.0.1:3900/api/examples/tasks/data/tasks.json")).data).toHaveLength(3);
});

test("real fetch: a redirect to another origin fails; a same-origin redirect is followed", async ({ page }) => {
  await page.route("**/__api/away", (r) => r.fulfill({ status: 302, headers: { Location: "http://localhost:3900/api/examples/tasks/data/tasks.json" } }));
  await page.route("**/__api/moved", (r) => r.fulfill({ status: 302, headers: { Location: "/api/examples/tasks/data/tasks.json" } }));
  await page.goto(EXAMPLE);
  const away = await run(page, "/__api/away");
  expect(away.data).toBeUndefined();
  expect(["network", "security"]).toContain(away.error.type); // the browser refuses it (mode "same-origin")
  expect((await run(page, "/__api/moved")).data).toHaveLength(3);
});

test("real fetch: a network failure is type network", async ({ page }) => {
  await page.route(/\/__api\/down/, (r) => r.abort("connectionrefused"));
  await page.goto(EXAMPLE);
  const { error } = await run(page, "/__api/down?token=secret");
  expect(error).toMatchObject({ name: "ApiError", type: "network", status: null, method: "GET", url: "http://127.0.0.1:3900/__api/down" });
  expect(error.message).not.toContain("secret");
});
