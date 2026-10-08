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

test("example: params fill the task-detail URL", async ({ page }) => {
  await page.goto(EXAMPLE);
  await expect(page.locator("#detail strong")).toHaveText("Ship @zoijs/api");
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
  const { error } = await run(page, "/__api/down?cursor=secret");
  expect(error).toMatchObject({ name: "ApiError", type: "network", status: null, method: "GET", url: "http://127.0.0.1:3900/__api/down" });
  expect(error.message).not.toContain("secret");
});

// ---- Phase 2: params / query / reactive queries, with real fetch and URL --------------------------

// Every /__echo/ request answers with the URL the browser actually sent.
async function echo(page, { delay } = {}) {
  await page.route(/\/__echo\//, async (r) => {
    const url = r.request().url();
    const ms = delay ? delay(url) : 0;
    if (ms) await new Promise((res) => setTimeout(res, ms));
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url }) }).catch(() => {});
  });
}

test("params: one encoded segment each; traversal can't leave the route", async ({ page }) => {
  await echo(page);
  await page.goto(EXAMPLE);
  const sent = await page.evaluate(async () => {
    const { api } = await import("/api/src/index.js");
    const out = {};
    for (const name of ["abc/123", "../../admin", "%2e%2e", "a b?c#d", "café", "//evil.example"]) {
      const r = api("/__echo/files/:name/meta", { params: { name } });
      for (let i = 0; i < 200 && r.loading(); i++) await new Promise((res) => setTimeout(res, 10));
      out[name] = r.data()?.url ?? r.error()?.type;
    }
    return out;
  });
  const base = "http://127.0.0.1:3900/__echo/files/";
  expect(sent).toEqual({
    "abc/123": `${base}abc%2F123/meta`,
    "../../admin": `${base}..%2F..%2Fadmin/meta`,
    "%2e%2e": `${base}%252e%252e/meta`,
    "a b?c#d": `${base}a%20b%3Fc%23d/meta`,
    "café": `${base}caf%C3%A9/meta`,
    "//evil.example": `${base}%2F%2Fevil.example/meta`,
  });
});

test("query: encoded by URLSearchParams, merged with the template's query, no fragment sent", async ({ page }) => {
  await echo(page);
  await page.goto(EXAMPLE);
  const url = await page.evaluate(async () => {
    const { api } = await import("/api/src/index.js");
    const r = api("/__echo/search?page=1&keep=yes#frag", { query: { q: "a b&c=d?#✓", page: 2, exact: true, none: null } });
    for (let i = 0; i < 200 && r.loading(); i++) await new Promise((res) => setTimeout(res, 10));
    return r.data().url;
  });
  const u = new URL(url);
  expect(u.pathname).toBe("/__echo/search");
  expect([...u.searchParams]).toEqual([["keep", "yes"], ["q", "a b&c=d?#✓"], ["page", "2"], ["exact", "true"]]); // option keys replace (delete + append)
  expect(url).not.toContain("#");
});

test("the built URL is still checked: cross-origin templates and secret keys never request", async ({ page }) => {
  const external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:3900/")) external.push(r.url());
  });
  await echo(page);
  await page.goto(EXAMPLE);
  const result = await page.evaluate(async () => {
    const { api } = await import("/api/src/index.js");
    const settle = async (r) => {
      for (let i = 0; i < 200 && r.loading(); i++) await new Promise((res) => setTimeout(res, 10));
      return r.error()?.type ?? "ok";
    };
    const cross = await settle(api("http://localhost:3900/__echo/:id", { params: { id: 1 }, query: { a: 1 } }));
    let secret;
    try {
      api("/__echo/reset", { query: { access_token: "x" } });
    } catch (e) {
      secret = e instanceof TypeError ? e.name : "other";
    }
    return { cross, secret };
  });
  expect(result).toEqual({ cross: "security", secret: "TypeError" });
  expect(external).toEqual([]);
});

test("reactive query: refetches on change, latest wins, nothing after unmount", async ({ page }) => {
  // q=a answers slowly, so it would land last if stale answers weren't ignored.
  await echo(page, { delay: (url) => (url.includes("q=a&") || url.endsWith("q=a") ? 400 : 20) });
  await page.goto(EXAMPLE);
  const out = await page.evaluate(async () => {
    const core = await import("/framework/src/index.js");
    const { api } = await import("/api/src/index.js");
    const sent = [];
    const realFetch = window.fetch;
    window.fetch = (url, init) => {
      sent.push(String(url).replace(location.origin, ""));
      return realFetch(url, init);
    };
    const q = core.createState("a");
    let results;
    const host = document.createElement("div");
    const unmount = core.mount(() => {
      results = api("/__echo/search", { query: () => ({ q: q.get() }) });
      return core.html`<p>${() => results.data()?.url ?? ""}</p>`;
    }, host);
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    await wait(0);
    q.set("ab");
    await wait(0);
    q.set("abc");
    await wait(600); // past the slow q=a answer
    const shown = host.textContent;
    unmount();
    q.set("after-unmount");
    await wait(200);
    window.fetch = realFetch;
    return { sent, shown, data: results.data()?.url };
  });
  expect(out.sent).toEqual(["/__echo/search?q=a", "/__echo/search?q=ab", "/__echo/search?q=abc"]);
  expect(out.shown).toBe("http://127.0.0.1:3900/__echo/search?q=abc");
  expect(out.data).toBe("http://127.0.0.1:3900/__echo/search?q=abc");
});

// ---- Phase 3: reactive params, debounce, dispose, query arrays (real fetch) -----------------------

// Runs `body(core, api, wait)` in the page; every fetch the page makes is recorded in `sent`.
async function inPage(page, body) {
  await echo(page);
  await page.goto(EXAMPLE);
  return page.evaluate(async (src) => {
    const core = await import("/framework/src/index.js");
    const { api } = await import("/api/src/index.js");
    const sent = [];
    const realFetch = window.fetch;
    window.fetch = (url, init) => {
      sent.push(String(url).replace(location.origin, ""));
      return realFetch(url, init);
    };
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    try {
      const out = await new Function("core", "api", "wait", `return (async () => { ${src} })()`)(core, api, wait);
      return { sent, out };
    } finally {
      window.fetch = realFetch;
    }
  }, body);
}

test("reactive params: changing the id refetches, encoded as one segment", async ({ page }) => {
  const { sent, out } = await inPage(page, `
    const id = core.createState("1");
    const user = api("/__echo/users/:id", { params: () => ({ id: id.get() }) });
    await wait(100);
    id.set("a/b ../c");
    await wait(150);
    const last = user.data()?.url;
    user.dispose();
    return last;
  `);
  expect(sent).toEqual(["/__echo/users/1", "/__echo/users/a%2Fb%20..%2Fc"]);
  expect(out).toBe("http://127.0.0.1:3900/__echo/users/a%2Fb%20..%2Fc");
});

test("debounce: rapid changes send one request with the latest value", async ({ page }) => {
  const { sent, out } = await inPage(page, `
    const q = core.createState("");
    const r = api("/__echo/search", { query: () => ({ q: q.get() }), debounce: 150 });
    await wait(50);
    for (const v of ["a", "ab", "abc", "abcd"]) { q.set(v); await wait(30); }
    await wait(400);
    const last = r.data()?.url;
    r.dispose();
    return last;
  `);
  expect(sent).toEqual(["/__echo/search?q=", "/__echo/search?q=abcd"]);
  expect(out).toBe("http://127.0.0.1:3900/__echo/search?q=abcd");
});

test("query arrays: repeated keys, each value encoded", async ({ page }) => {
  const { sent } = await inPage(page, `
    const r = api("/__echo/products?tag=old", { query: { tag: ["new", "a&b=c", null, "✓"], page: 1 } });
    await wait(100);
    r.dispose();
  `);
  expect(sent).toHaveLength(1);
  const u = new URL(sent[0], "http://127.0.0.1:3900");
  expect(u.searchParams.getAll("tag")).toEqual(["new", "a&b=c", "✓"]);
  expect([...u.searchParams.keys()]).toEqual(["tag", "tag", "tag", "page"]);
});

test("no network request after dispose() or unmount — not even a pending debounce", async ({ page }) => {
  const network = [];
  page.on("request", (r) => {
    if (r.url().includes("/__echo/")) network.push(r.url());
  });
  const { sent, out } = await inPage(page, `
    const q = core.createState("a");
    const loose = api("/__echo/loose", { query: () => ({ q: q.get() }), debounce: 100 });
    let owned;
    const unmount = core.mount(() => {
      owned = api("/__echo/owned/:q", { params: () => ({ q: q.get() }) });
      return core.html\`<p></p>\`;
    }, document.createElement("div"));
    await wait(80);
    q.set("b");             // loose now has a debounce pending
    await wait(10);
    loose.dispose();
    unmount();
    q.set("c");
    await wait(300);
    let threw = false;
    try { loose.refresh(); } catch (e) { threw = e.name === "ApiError" && e.type === "config"; }
    await wait(50);
    return { threw };
  `);
  expect(out.threw).toBe(true);
  // `owned` (no debounce) refetches "b" before it unmounts; after dispose/unmount nothing is sent
  // for "c", and `loose` never sends the "b" its debounce was still waiting on.
  expect(sent).toContain("/__echo/owned/b");
  expect(sent.filter((u) => u.includes("q=b") && u.includes("loose"))).toEqual([]);
  expect(sent.filter((u) => u.endsWith("q=c") || u.endsWith("/owned/c"))).toEqual([]);
  expect(network.filter((u) => u.includes("loose?q=b") || u.endsWith("q=c") || u.endsWith("/owned/c"))).toEqual([]);
});
