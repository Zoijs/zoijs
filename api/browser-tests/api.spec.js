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

test("real fetch: a redirect to another origin fails; a same-origin redirect is followed", async ({ page, browserName }) => {
  // Playwright can't fulfill a 3xx in WebKit ("Cannot fulfill with redirect status"), so the faked
  // redirect can't be built there. The client-side redirect check is unit-tested; Chromium and
  // Firefox cover the browser's own mode: "same-origin" enforcement.
  test.skip(browserName === "webkit", "Playwright route.fulfill can't return a redirect in WebKit");
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

// ---- Phase 4: mutations (real fetch) ------------------------------------------------------------------

// /__crud/ answers every method with what the browser actually sent; /__crud/fail answers 422.
async function crud(page, { delay = 0 } = {}) {
  await page.route(/\/__crud\//, async (r) => {
    const req = r.request();
    if (delay && req.method() !== "GET") await new Promise((res) => setTimeout(res, delay));
    if (req.url().includes("/__crud/fail")) {
      return r.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: "server-side-detail" }) });
    }
    const headers = req.headers();
    await r.fulfill({
      status: req.method() === "DELETE" ? 204 : req.method() === "POST" ? 201 : 200,
      contentType: "application/json",
      body: req.method() === "DELETE" ? "" : JSON.stringify({ method: req.method(), url: req.url(), contentType: headers["content-type"] ?? null, body: req.postData() ?? null }),
    });
  });
}

async function inCrud(page, body, opts) {
  await crud(page, opts);
  await page.goto(EXAMPLE);
  return page.evaluate(async (src) => {
    const core = await import("/framework/src/index.js");
    const { api } = await import("/api/src/index.js");
    const sent = [];
    const realFetch = window.fetch;
    window.fetch = (url, init) => {
      sent.push(`${init.method} ${String(url).replace(location.origin, "")}`);
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

test("POST sends a JSON body with Content-Type; the response is parsed", async ({ page }) => {
  const { out } = await inCrud(page, `
    const add = api.post("/__crud/tasks");
    const res = await add.run({ title: "Learn Zoijs", tags: ["a"], n: 1 });
    return { res, done: add.done() };
  `);
  expect(out.done).toBe(true);
  expect(out.res).toMatchObject({ method: "POST", contentType: "application/json", body: '{"title":"Learn Zoijs","tags":["a"],"n":1}' });
});

test("PATCH and PUT with route params; DELETE with params sends no body", async ({ page }) => {
  const { sent, out } = await inCrud(page, `
    const patch = await api.patch("/__crud/tasks/:id").run({ params: { id: "a/b" }, body: { completed: true } });
    const put = await api.put("/__crud/tasks/:id").run({ params: { id: 7 }, body: { title: "Updated" } });
    const remove = api.delete("/__crud/tasks/:id", { query: { hard: true } });
    const del = await remove.run({ params: { id: 42 } });
    return { patch, put, del, delDone: remove.done() };
  `);
  expect(out.patch).toMatchObject({ method: "PATCH", url: "http://127.0.0.1:3900/__crud/tasks/a%2Fb", body: '{"completed":true}' });
  expect(out.put).toMatchObject({ method: "PUT", url: "http://127.0.0.1:3900/__crud/tasks/7", body: '{"title":"Updated"}' });
  expect(out.del).toBeNull();
  expect(out.delDone).toBe(true);
  expect(sent).toEqual(["PATCH /__crud/tasks/a%2Fb", "PUT /__crud/tasks/7", "DELETE /__crud/tasks/42?hard=true"]);
});

test("invalidation refreshes the GET after success; exclusive double submit sends once", async ({ page }) => {
  const { sent, out } = await inCrud(page, `
    const tasks = api("/__crud/tasks");
    await wait(80);
    const add = api.post("/__crud/tasks", { invalidate: tasks, exclusive: true });
    const [a, b] = await Promise.all([add.run({ title: "x" }), add.run({ title: "y" })]);
    await wait(150);
    tasks.dispose();
    return { same: JSON.stringify(a) === JSON.stringify(b), last: tasks.data()?.method };
  `, { delay: 100 });
  expect(sent).toEqual(["GET /__crud/tasks", "POST /__crud/tasks", "GET /__crud/tasks"]);
  expect(out.same).toBe(true);
  expect(out.last).toBe("GET");
});

test("mutations are same-origin only — no request leaves the page", async ({ page }) => {
  const external = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:3900/")) external.push(r.url());
  });
  const { sent, out } = await inCrud(page, `
    const out = [];
    for (const url of ["http://localhost:3900/__crud/x", "//localhost:3900/x", "/\\\\localhost:3900/x"]) {
      const m = api.post(url);
      await m.run({ secret: "body" });
      out.push(m.error()?.type);
    }
    const p = api.patch("/__crud/:a");
    await p.run({ params: { a: "//localhost:3900" }, body: {} });
    out.push(p.result()?.url);
    return out;
  `);
  expect(out.slice(0, 3)).toEqual(["security", "security", "security"]);
  expect(out[3]).toBe("http://127.0.0.1:3900/__crud/%2F%2Flocalhost%3A3900");
  expect(sent).toEqual(["PATCH /__crud/%2F%2Flocalhost%3A3900"]);
  expect(external).toEqual([]);
});

test("a mutation HTTP error renders without leaking the body or the response", async ({ page }) => {
  await crud(page);
  await page.goto(EXAMPLE);
  const text = await page.evaluate(async () => {
    const core = await import("/framework/src/index.js");
    const { api } = await import("/api/src/index.js");
    const host = document.createElement("div");
    document.body.append(host);
    let save;
    core.mount(() => {
      save = api.post("/__crud/fail");
      return core.html`${() => (save.error() ? core.html`<p role="alert">${save.error().message}</p>` : null)}`;
    }, host);
    await save.run({ password: "hunter2-body-secret", card: "4111" });
    await new Promise((r) => setTimeout(r, 20));
    return host.textContent;
  });
  expect(text).toMatch(/^POST request failed: 422( [A-Za-z ]+)?$/); // status text varies by engine
  expect(text).not.toContain("hunter2");
  expect(text).not.toContain("server-side-detail");
});

// ---- Phase 5: timeout, problem details, initial, FormData (real fetch) ---------------------------------

test("timeout aborts the real request and reports type timeout", async ({ page }) => {
  await page.route(/\/__slow\//, async (r) => {
    await new Promise((res) => setTimeout(res, 1500));
    await r.fulfill({ status: 200, contentType: "application/json", body: "[]" }).catch(() => {});
  });
  const failed = [];
  page.on("requestfailed", (r) => failed.push(r.url()));
  await page.goto(EXAMPLE);
  const out = await page.evaluate(async () => {
    const { api } = await import("/api/src/index.js");
    const r = api("/__slow/list", { timeout: 200 });
    const m = api.post("/__slow/orders", { timeout: 200 });
    const res = await m.run({ item: 1 });
    for (let i = 0; i < 100 && r.loading(); i++) await new Promise((x) => setTimeout(x, 10));
    const e = r.error();
    r.dispose();
    return { get: e && { type: e.type, message: e.message }, post: { type: m.error()?.type, message: m.error()?.message, res } };
  });
  expect(out.get).toEqual({ type: "timeout", message: "GET request timed out" });
  expect(out.post).toEqual({ type: "timeout", message: "POST request timed out", res: undefined }); // run() resolves undefined on failure
  await expect.poll(() => failed.length).toBeGreaterThanOrEqual(2); // the browser really cancelled both
});

test("problem details: private by default, normalized with problemDetails: true", async ({ page }) => {
  await page.route(/\/__problem\//, (r) =>
    r.fulfill({ status: 422, contentType: "application/problem+json; charset=utf-8", body: JSON.stringify({ type: "about:blank", title: "Invalid", status: 422, detail: "<b>email</b> is required", ext: { secret: 1 } }) }),
  );
  await page.goto(EXAMPLE);
  const out = await page.evaluate(async () => {
    const { api } = await import("/api/src/index.js");
    const plain = api.post("/__problem/users");
    const opted = api.post("/__problem/users", { problemDetails: true });
    await plain.run({ email: "" });
    await opted.run({ email: "" });
    return { plain: plain.error().problem, opted: opted.error().problem, message: opted.error().message };
  });
  expect(out.plain).toBeNull();
  expect(out.opted).toEqual({ type: "about:blank", title: "Invalid", status: 422, detail: "<b>email</b> is required" });
  expect(out.message).toMatch(/^POST request failed: 422/);
  expect(out.message).not.toContain("email");
});

test("initial: no request on creation; refresh() fetches", async ({ page }) => {
  await echo(page);
  await page.goto(EXAMPLE);
  const out = await page.evaluate(async () => {
    const { api } = await import("/api/src/index.js");
    const sent = [];
    const realFetch = window.fetch;
    window.fetch = (url, init) => (sent.push(String(url)), realFetch(url, init));
    const r = api("/__echo/users", { initial: [{ id: 1 }] });
    await new Promise((x) => setTimeout(x, 100));
    const before = { sent: sent.length, loading: r.loading(), data: r.data() };
    r.refresh();
    for (let i = 0; i < 100 && r.loading(); i++) await new Promise((x) => setTimeout(x, 10));
    window.fetch = realFetch;
    const after = r.data()?.url;
    r.dispose();
    return { before, after, sent: sent.length };
  });
  expect(out.before).toEqual({ sent: 0, loading: false, data: [{ id: 1 }] });
  expect(out.after).toBe("http://127.0.0.1:3900/__echo/users");
  expect(out.sent).toBe(1);
});

// FormData bodies are checked against what the test server's POST /__echo actually received
// (scripts/test-server.mjs) — real network bytes, not Playwright's request interception, which in
// WebKit doesn't expose File/Blob contents of multipart bodies.
function parseMultipart(contentType, base64) {
  const buf = Buffer.from(base64, "base64");
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType || "");
  expect(boundary, `multipart Content-Type: ${contentType}`).not.toBeNull();
  const sep = Buffer.from("--" + (boundary[1] || boundary[2]));
  const parts = [];
  let at = buf.indexOf(sep);
  while (at !== -1) {
    const next = buf.indexOf(sep, at + sep.length);
    if (next === -1) break;
    const part = buf.subarray(at + sep.length + 2, next - 2); // skip CRLF after the boundary and before the next
    const split = part.indexOf("\r\n\r\n");
    const head = part.subarray(0, split).toString("latin1").toLowerCase().split("\r\n").map((l) => l.replace(/\s+/g, " ").trim()).sort().join("|");
    parts.push({ head, body: part.subarray(split + 4) });
    at = next;
  }
  return parts;
}

test("FormData is sent as multipart with a browser-generated boundary; JSON and none differ", async ({ page }) => {
  await page.goto(EXAMPLE);
  const out = await page.evaluate(async () => {
    const { api } = await import("/api/src/index.js");
    let posts = 0;
    const realFetch = window.fetch;
    window.fetch = (url, init) => (posts++, realFetch(url, init));
    const form = new FormData();
    form.append("description", "Profile photo");
    form.append("file", new Blob(["PNGDATA"], { type: "image/png" }), "me.png");
    const up = api.post("/__echo/upload/:id", { exclusive: true });
    const [a, b] = await Promise.all([up.run({ params: { id: 7 }, body: form }), up.run({ params: { id: 7 }, body: form })]);
    const plain = api.post("/__echo/plain");
    const json = await plain.run({ a: 1 });
    const none = await plain.run();
    window.fetch = realFetch;
    return { posts, same: a === b, upload: a, json, none };
  });
  expect(out.posts).toBe(3); // exclusive: the double submit sent once
  expect(out.same).toBe(true);
  expect(out.upload.path).toBe("/__echo/upload/7");
  expect(out.upload.contentType).toMatch(/^multipart\/form-data; boundary=/);
  const parts = parseMultipart(out.upload.contentType, out.upload.body);
  expect(parts.map((p) => p.head.includes('name="description"') || p.head.includes('name="file"'))).toEqual([true, true]);
  expect(parts[1].body.toString("utf8")).toBe("PNGDATA");
  expect(out.json.contentType).toBe("application/json");
  expect(Buffer.from(out.json.body, "base64").toString("utf8")).toBe('{"a":1}');
  expect(out.none.contentType).toBeNull();
  expect(out.none.body).toBe("");
});

test("a FormData from another realm (iframe) is accepted; spoofs are refused", async ({ page }) => {
  const seen = [];
  await page.route(/\/__upload/, async (r) => {
    seen.push(r.request().headers()["content-type"] ?? null);
    await r.fulfill({ status: 201, contentType: "application/json", body: "{}" });
  });
  await page.goto(EXAMPLE);
  const out = await page.evaluate(async () => {
    const { api } = await import("/api/src/index.js");
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const foreign = new frame.contentWindow.FormData();
    foreign.append("x", "1");
    const up = api.post("/__upload");
    await up.run(foreign);
    const crossRealm = up.error();
    const results = [];
    for (const spoof of [Object.create(FormData.prototype), { append() {}, entries() {} }]) {
      await up.run(spoof);
      results.push(up.error()?.type);
    }
    return { crossRealm, results };
  });
  expect(out.crossRealm).toBeNull();
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatch(/^multipart\/form-data; boundary=/);
  expect(out.results).toEqual(["config", "config"]);
});

// ---- Phase 6: idempotency keys and retries (real fetch) ------------------------------------------------

// /__retry/<plan>: each request records its Idempotency-Key; the plan says how attempts answer —
// "f" fail with 503, "r" 503 + Retry-After: 1, "n" drop the connection, "s" hang 600 ms, "k" succeed
// (the last letter repeats).
async function retryRoute(page) {
  const seen = [];
  await page.route(/\/__retry\//, async (r) => {
    const req = r.request();
    const plan = new URL(req.url()).pathname.split("/")[2];
    const n = seen.filter((x) => x.path === new URL(req.url()).pathname && x.method === req.method()).length;
    seen.push({ path: new URL(req.url()).pathname, method: req.method(), key: req.headers()["idempotency-key"] ?? null, body: req.postData() ?? null, at: Date.now() });
    const step = plan[Math.min(n, plan.length - 1)];
    if (step === "n") return r.abort("connectionreset");
    if (step === "s") await new Promise((res) => setTimeout(res, 600));
    if (step === "f") return r.fulfill({ status: 503, contentType: "application/json", body: "{}" }).catch(() => {});
    if (step === "r") return r.fulfill({ status: 503, headers: { "Retry-After": "1" }, contentType: "application/json", body: "{}" }).catch(() => {});
    return r.fulfill({ status: req.method() === "GET" ? 200 : 201, contentType: "application/json", body: JSON.stringify({ ok: true, n }) }).catch(() => {});
  });
  return seen;
}
const runInPage = (page, src) =>
  page.evaluate(async (src) => {
    const core = await import("/framework/src/index.js");
    const { api } = await import("/api/src/index.js");
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    return new Function("core", "api", "wait", `return (async () => { ${src} })()`)(core, api, wait);
  }, src);

test("retry: a failed POST succeeds on retry with the SAME Idempotency-Key; a new run gets a new key", async ({ page }) => {
  const seen = await retryRoute(page);
  await page.goto(EXAMPLE);
  const out = await runInPage(page, `
    const m = api.post("/__retry/nk/orders", { idempotencyKey: true, retry: 2, retryDelay: 20 });
    const first = await m.run({ sku: "ABC-123" });
    const second = await m.run({ sku: "ABC-123" });
    return { first, second, done: m.done(), error: m.error() };
  `);
  expect(out.first).toEqual({ ok: true, n: 1 });
  expect(out.done).toBe(true);
  expect(out.error).toBeNull();
  const posts = seen.filter((x) => x.method === "POST");
  expect(posts.map((x) => x.body)).toEqual(['{"sku":"ABC-123"}', '{"sku":"ABC-123"}', '{"sku":"ABC-123"}']);
  expect(posts[0].key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(posts[1].key).toBe(posts[0].key);
  expect(posts[2].key).not.toBe(posts[0].key); // the second run.run(): first attempt succeeded ("k" repeats)
});

test("retry: 503 and timeouts are retried; exhaustion ends with the final error", async ({ page }) => {
  const seen = await retryRoute(page);
  await page.goto(EXAMPLE);
  const out = await runInPage(page, `
    const a = api.post("/__retry/fk/a", { idempotencyKey: true, retry: 1, retryDelay: 20 });
    const b = api.post("/__retry/sk/b", { idempotencyKey: true, retry: 1, retryDelay: 20, timeout: 200 });
    const c = api.put("/__retry/f/c", { idempotencyKey: true, retry: 2, retryDelay: 20 });
    await a.run({}); await b.run({}); await c.run({});
    return { a: a.done(), b: b.done(), c: [c.done(), c.error()?.type, c.error()?.status] };
  `);
  expect(out).toEqual({ a: true, b: true, c: [false, "http", 503] });
  const count = (p) => seen.filter((x) => x.path.startsWith(p)).length;
  expect([count("/__retry/fk/"), count("/__retry/sk/"), count("/__retry/f/")]).toEqual([2, 2, 3]);
});

test("retry + exclusive + invalidation: one sequence, one key, one refresh after eventual success", async ({ page }) => {
  const seen = await retryRoute(page);
  await page.goto(EXAMPLE);
  await runInPage(page, `
    const list = api("/__retry/k/list");
    await wait(100);
    const m = api.post("/__retry/fk/orders", { exclusive: true, idempotencyKey: true, retry: 2, retryDelay: 30, invalidate: list });
    await Promise.all([m.run({ n: 1 }), m.run({ n: 2 })]);
    await wait(150);
    list.dispose();
  `);
  const posts = seen.filter((x) => x.method === "POST");
  expect(posts).toHaveLength(2);
  expect(new Set(posts.map((x) => x.key)).size).toBe(1);
  expect(seen.filter((x) => x.method === "GET")).toHaveLength(2); // initial load + one invalidation
});

test("unmount during backoff cancels the scheduled retry; rendered errors never show the key", async ({ page }) => {
  const seen = await retryRoute(page);
  await page.goto(EXAMPLE);
  const text = await runInPage(page, `
    let m;
    const host = document.createElement("div");
    document.body.append(host);
    const unmount = core.mount(() => {
      m = api.post("/__retry/f/gone", { idempotencyKey: true, retry: 3, retryDelay: 300 });
      return core.html\`<p></p>\`;
    }, host);
    m.run({});
    await wait(100); // first attempt failed; a retry is waiting
    unmount();
    await wait(800);
    const shown = document.createElement("div");
    document.body.append(shown);
    let x;
    core.mount(() => {
      x = api.post("/__retry/f/shown", { idempotencyKey: true, retry: 1, retryDelay: 10 });
      return core.html\`\${() => (x.error() ? core.html\`<p role="alert">\${x.error().message}</p>\` : null)}\`;
    }, shown);
    await x.run({ secret: 1 });
    await wait(20);
    return shown.textContent;
  `);
  expect(seen.filter((x) => x.path === "/__retry/f/gone")).toHaveLength(1);
  const shownKeys = seen.filter((x) => x.path === "/__retry/f/shown").map((x) => x.key);
  expect(shownKeys).toHaveLength(2);
  expect(text).toMatch(/^POST request failed: 503/);
  expect(text).not.toContain(shownKeys[0]);
});

// ---- Phase 7: key functions, retry status, FormData replay verification ---------------------------------

test("a key function is called once per run; its key is reused by the retry", async ({ page }) => {
  const seen = await retryRoute(page);
  await page.goto(EXAMPLE);
  const out = await runInPage(page, `
    let calls = 0;
    const m = api.post("/__retry/nk/orders", { idempotencyKey: () => "op-" + (++calls), retry: 2, retryDelay: 20 });
    await m.run({ a: 1 });
    return { calls, done: m.done() };
  `);
  expect(out).toEqual({ calls: 1, done: true });
  expect(seen.filter((x) => x.method === "POST").map((x) => x.key)).toEqual(["op-1", "op-1"]);
});

test("attempt() / retrying() follow a real retry; exclusive joiners see the same status", async ({ page }) => {
  await retryRoute(page);
  await page.goto(EXAMPLE);
  const out = await runInPage(page, `
    const m = api.post("/__retry/fk/orders", { exclusive: true, idempotencyKey: true, retry: 2, retryDelay: 150 });
    const samples = [[m.attempt(), m.retrying()]];
    const a = m.run({ n: 1 });
    const b = m.run({ n: 2 }); // joins
    samples.push([m.attempt(), m.retrying()]);
    await wait(80);   // first attempt failed (503); waiting 150 ms to retry
    samples.push([m.attempt(), m.retrying(), m.pending()]);
    await Promise.all([a, b]);
    samples.push([m.attempt(), m.retrying(), m.pending(), m.done()]);
    m.reset();
    samples.push([m.attempt(), m.retrying()]);
    return samples;
  `);
  expect(out).toEqual([[0, false], [1, false], [1, true, true], [2, false, false, true], [0, false]]);
});

// Evidence for (not yet enablement of) FormData retries: send ONE FormData object twice with the
// platform fetch and check the server sees semantically equal multipart payloads each time — text
// fields, file names, MIME types and exact binary bytes. Boundaries may differ; contents may not.
test("FormData replay: the same FormData sends equivalent multipart payloads twice", async ({ page }) => {
  await page.goto(EXAMPLE);
  const out = await page.evaluate(async () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const form = new FormData();
    form.append("description", "Profile photo ✓");
    form.append("file", new File([bytes], "photo.png", { type: "image/png" }));
    form.append("blob", new Blob(["plain text\r\n--not-a-boundary"], { type: "text/plain" }), "notes.txt");
    const snapshot = async () => Promise.all([...form.entries()].map(async ([k, v]) => [k, typeof v === "string" ? v : [v.name, v.type, v.size, Array.from(new Uint8Array(await v.arrayBuffer())).join(",")]]));
    const first = await snapshot();
    const sent = [];
    for (let i = 0; i < 2; i++) sent.push(await (await fetch("/__echo/multipart", { method: "POST", body: form })).json());
    const after = await snapshot();
    return { unchanged: JSON.stringify(first) === JSON.stringify(after), sent };
  });
  expect(out.unchanged).toBe(true); // the caller's FormData isn't changed by being sent
  expect(out.sent).toHaveLength(2);
  const [a, b] = out.sent.map((r) => parseMultipart(r.contentType, r.body));
  expect(a).toHaveLength(3);
  // Semantically equal on both sends: same part headers and exact bytes (boundaries may differ).
  expect(b.map((p) => [p.head, p.body.toString("base64")])).toEqual(a.map((p) => [p.head, p.body.toString("base64")]));
  expect(a[0].head).toContain('name="description"');
  expect(a[0].body.toString("utf8")).toBe("Profile photo ✓");
  expect(a[1].head).toContain('filename="photo.png"');
  expect(a[1].head).toContain("content-type: image/png");
  expect([...a[1].body]).toEqual([...Array(256).keys()]);
  expect(a[2].head).toContain('filename="notes.txt"');
  expect(a[2].body.toString("utf8")).toBe("plain text\r\n--not-a-boundary");
});

// ---- Phase 8: GET retries (real fetch) --------------------------------------------------------------------

test("GET retry: 503, a dropped connection and a timeout each recover on the next attempt", async ({ page }) => {
  const seen = await retryRoute(page);
  await page.goto(EXAMPLE);
  const out = await runInPage(page, `
    const until = async (r) => { for (let i = 0; i < 300 && r.loading(); i++) await wait(10); return { data: r.data(), error: r.error() }; };
    const a = await until(api("/__retry/fk/users", { retry: 2, retryDelay: 20 }));
    const b = await until(api("/__retry/nk/users", { retry: 2, retryDelay: 20 }));
    const c = await until(api("/__retry/sk/users", { retry: 1, retryDelay: 20, timeout: 200 }));
    return [a, b, c];
  `);
  for (const r of out) expect(r).toEqual({ data: { ok: true, n: 1 }, error: null });
  const count = (p) => seen.filter((x) => x.path === p).length;
  expect([count("/__retry/fk/users"), count("/__retry/nk/users"), count("/__retry/sk/users")]).toEqual([2, 2, 2]);
});

test("GET Retry-After: the retry waits at least what the server asked", async ({ page }) => {
  const seen = await retryRoute(page);
  await page.goto(EXAMPLE);
  await runInPage(page, `
    const r = api("/__retry/rk/users", { retry: 1, retryDelay: 10 });
    for (let i = 0; i < 300 && r.loading(); i++) await wait(10);
  `);
  const hits = seen.filter((x) => x.path === "/__retry/rk/users");
  expect(hits).toHaveLength(2);
  expect(hits[1].at - hits[0].at).toBeGreaterThanOrEqual(950);
});

test("GET: a reactive URL change or refresh() cancels a pending retry", async ({ page }) => {
  const seen = await retryRoute(page);
  await page.goto(EXAMPLE);
  await runInPage(page, `
    const plan = core.createState("f");
    const r = api("/__retry/:plan/items", { params: () => ({ plan: plan.get() }), retry: 3, retryDelay: 300 });
    await wait(100);       // "f" failed; a retry is waiting
    plan.set("k");         // new URL: the old retry must never fire
    await wait(900);
    const s = api("/__retry/f/again", { retry: 3, retryDelay: 300 });
    await wait(100);
    s.refresh();           // fresh load now, fresh retry count; the old timer is cancelled
    await wait(60);
    s.dispose();
    await wait(900);
    r.dispose();
  `);
  expect(seen.filter((x) => x.path === "/__retry/f/items")).toHaveLength(1);
  expect(seen.filter((x) => x.path === "/__retry/k/items")).toHaveLength(1);
  expect(seen.filter((x) => x.path === "/__retry/f/again")).toHaveLength(2); // initial + refresh, no stray retry
});

// ---- Phase 9: FormData retries (real network, real bytes) ---------------------------------------------

test("a FormData upload that fails once (503) is retried with the same key and identical contents", async ({ page }) => {
  await page.goto(EXAMPLE);
  const out = await page.evaluate(async () => {
    const { api } = await import("/api/src/index.js");
    const keys = [];
    const realFetch = window.fetch;
    window.fetch = (url, init) => (keys.push(init.headers["Idempotency-Key"]), realFetch(url, init));
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const form = new FormData();
    form.append("description", "Profile photo ✓");
    form.append("file", new File([bytes], "photo.png", { type: "image/png" }));
    const id = "upload-" + crypto.randomUUID(); // a fresh fail-once path per run
    const up = api.post("/__echo/flaky/:id", { idempotencyKey: true, retry: 2, retryDelay: 20 });
    const echoed = await up.run({ params: { id }, body: form });
    window.fetch = realFetch;
    return { keys, echoed, done: up.done(), attempt: up.attempt(), names: [...form.keys()] };
  });
  expect(out.done).toBe(true);
  expect(out.attempt).toBe(2); // 503 first, then the retry succeeded
  expect(out.keys).toHaveLength(2);
  expect(out.keys[1]).toBe(out.keys[0]);
  expect(out.names).toEqual(["description", "file"]); // the caller's FormData is untouched
  const parts = parseMultipart(out.echoed.contentType, out.echoed.body);
  expect(parts).toHaveLength(2);
  expect(parts[0].body.toString("utf8")).toBe("Profile photo ✓");
  expect(parts[1].head).toContain('filename="photo.png"');
  expect(parts[1].head).toContain("content-type: image/png");
  expect([...parts[1].body]).toEqual([...Array(256).keys()]);
});

// ---- Phase 10: createApi() — a second, real origin (no interception) --------------------------------
// The test server also listens on 127.0.0.1:3901, a different origin. Its /__cors/ endpoints allow
// exactly one origin (this page's), and /__hits/ counts what each path actually received.

const X = "http://127.0.0.1:3901";

// Runs `src` in the page with createApi; every fetch the page makes is recorded with its init.
async function inExternal(page, src) {
  await page.goto(EXAMPLE);
  return page.evaluate(
    async ({ src, X }) => {
      const core = await import("/framework/src/index.js");
      const { api, createApi } = await import("/api/src/index.js");
      const sent = [];
      const realFetch = window.fetch;
      window.fetch = (url, init) => {
        sent.push({ url: String(url), method: init.method, mode: init.mode, credentials: init.credentials, redirect: init.redirect ?? null, referrerPolicy: init.referrerPolicy ?? null, key: init.headers?.["Idempotency-Key"] ?? null, ...(init.headers?.Authorization ? { authorization: init.headers.Authorization } : {}) });
        return realFetch(url, init);
      };
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const settled = async (r) => {
        for (let i = 0; i < 500 && r.loading(); i++) await wait(10);
        return r;
      };
      const hitInfo = async (path) => (await realFetch("/__hits" + path)).json();
      const hits = async (path) => (await hitInfo(path)).count;
      const err = (e) => e && { type: e.type, status: e.status, message: e.message, url: e.url, problem: e.problem && { ...e.problem } };
      const uid = crypto.randomUUID(); // 127.0.0.1 is a secure context
      try {
        const out = await new Function("core", "api", "createApi", "X", "wait", "settled", "hits", "err", "uid", "realFetch", "hitInfo", `return (async () => { ${src} })()`)(core, api, createApi, X, wait, settled, hits, err, uid, realFetch, hitInfo);
        return { sent, out };
      } finally {
        window.fetch = realFetch;
      }
    },
    { src, X },
  );
}

test("createApi: GET JSON with route params and query reaches the configured origin through real CORS", async ({ page }) => {
  const { sent, out } = await inExternal(page, `
    const ext = createApi({ baseURL: X + "/__cors/v1/" });
    const r = await settled(ext("/users/:id", { params: { id: "a/b ../c" }, query: { q: "x y", tag: ["1", "2"] } }));
    return { data: r.data(), error: err(r.error()), baseURL: ext.baseURL };
  `);
  expect(out.error).toBeNull();
  expect(out.baseURL).toBe(`${X}/__cors/v1/`);
  expect(out.data).toMatchObject({ method: "GET", path: "/__cors/v1/users/a%2Fb%20..%2Fc", search: "?q=x+y&tag=1&tag=2", origin: "http://127.0.0.1:3900" });
  expect(sent).toEqual([{ url: `${X}/__cors/v1/users/a%2Fb%20..%2Fc?q=x+y&tag=1&tag=2`, method: "GET", mode: "cors", credentials: "omit", redirect: "manual", referrerPolicy: "strict-origin-when-cross-origin", key: null }]);
});

test("createApi: the external API never sees the page's path or query in Referer, even under an unsafe-url page policy", async ({ page, browserName }) => {
  const { out } = await inExternal(page, `
    history.replaceState(null, "", "/api/examples/tasks/?reset=page-SECRET");
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "unsafe-url";
    document.head.append(meta);
    const control = await (await realFetch(X + "/__cors/ref-control-" + uid)).json(); // what the page policy alone sends
    const r = await settled(createApi({ baseURL: X + "/__cors/" })("/ref-" + uid));
    return { control: control.referer, client: r.data()?.referer };
  `);
  // Proof the test can see a leak: the page's own policy alone sends the full URL. Asserted in
  // Chromium only — engines differ in how far they honor a relaxed page policy.
  if (browserName === "chromium") expect(out.control).toContain("page-SECRET");
  expect(out.client).toBe("http://127.0.0.1:3900/");
});

test("createApi: cookies are not sent cross-origin (a credentialed control fetch proves the cookie exists)", async ({ page }) => {
  const { out } = await inExternal(page, `
    document.cookie = "zoijs_phase10=cookie-SECRET; path=/; SameSite=Lax";
    const ext = createApi({ baseURL: X + "/__cors/" });
    const r = await settled(ext("/cookies-" + uid));
    const m = ext.post("/cookies-post-" + uid);
    const posted = await m.run({ a: 1 });
    const control = await (await realFetch(X + "/__cors/control-" + uid, { credentials: "include" })).json();
    const same = await settled(api("/__cors/same-" + uid)); // api() is same-origin: its cookies still go
    document.cookie = "zoijs_phase10=; path=/; max-age=0";
    return { get: r.data()?.cookie, post: posted?.cookie, control: control.cookie, same: same.data()?.cookie };
  `);
  expect(out.control).toContain("zoijs_phase10=cookie-SECRET");
  expect(out.same).toContain("zoijs_phase10=cookie-SECRET");
  expect(out.get).toBeNull();
  expect(out.post).toBeNull();
});

test("createApi doesn't bypass CORS: a server that doesn't allow the page fails normally, with no no-cors retry", async ({ page }) => {
  const { sent, out } = await inExternal(page, `
    const ext = createApi({ baseURL: X + "/__cors/" });
    const r = await settled(ext("/deny/x-" + uid));
    const m = ext.post("/deny/p-" + uid);
    await m.run({ a: 1 });
    const blocked = await settled(api(X + "/__cors/direct-" + uid)); // the default api() never even tries
    return { get: err(r.error()), post: err(m.error()), blocked: err(blocked.error()),
             getHits: await hits("/__cors/deny/x-" + uid), directHits: await hits("/__cors/direct-" + uid) };
  `);
  expect(out.get).toMatchObject({ type: "network", message: "GET request failed: network error" });
  expect(out.post).toMatchObject({ type: "network" });
  expect(out.getHits).toBe(1); // the browser sent it and then hid the response — exactly once
  expect(out.blocked.type).toBe("security");
  expect(out.directHits).toBe(0);
  expect(sent.filter((s) => s.url.includes("/deny/"))).toHaveLength(2);
  expect(sent.every((s) => s.mode === "cors" || s.mode === "same-origin")).toBe(true);
});

test("createApi: no redirect is followed — 301/302/303/307/308, GET and POST, with retries enabled", async ({ page }) => {
  const { sent, out } = await inExternal(page, `
    const ext = createApi({ baseURL: X + "/__cors/" });
    const targets = {
      otherOrigin: "http://127.0.0.1:3900/__echo/escaped-" + uid,           // another origin (port change)
      lookalike: "http://127.0.0.1.localhost:3901/__cors/escaped-l-" + uid,  // look-alike host
      scheme: "https://127.0.0.1:3901/__cors/escaped-s-" + uid,              // scheme change
      sameOrigin: X + "/__cors/escaped-same-" + uid,                          // even within the origin
    };
    const results = [];
    for (const code of [301, 302, 303, 307, 308]) {
      for (const [name, to] of Object.entries(targets)) {
        const r = await settled(ext("/redirect/" + code, { query: { to }, retry: 2, retryDelay: 10 }));
        const m = ext.post("/redirect/" + code, { query: { to }, idempotencyKey: () => "key-SECRET-" + uid, retry: 2, retryDelay: 10 });
        await m.run({ card: "body-SECRET" });
        results.push({ code, name, get: err(r.error()), post: err(m.error()) });
      }
    }
    const reached = {};
    for (const p of ["/__echo/escaped-", "/__cors/escaped-l-", "/__cors/escaped-s-", "/__cors/escaped-same-"]) reached[p] = await hits(p + uid);
    return { results, reached, perCode: await hits("/__cors/redirect/307") };
  `);
  for (const { code, name, get, post } of out.results) {
    expect(get, `${code} ${name} GET`).toMatchObject({ type: "security", message: "GET request blocked: a createApi() client doesn't follow redirects" });
    expect(post, `${code} ${name} POST`).toMatchObject({ type: "security", message: "POST request blocked: a createApi() client doesn't follow redirects" });
    expect(JSON.stringify(post)).not.toContain("SECRET");
  }
  // Nothing — no body, no key, no request at all — reached any redirect target.
  expect(out.reached).toEqual({ "/__echo/escaped-": 0, "/__cors/escaped-l-": 0, "/__cors/escaped-s-": 0, "/__cors/escaped-same-": 0 });
  // Redirects are terminal: one attempt each, never retried (5 codes × 4 targets × GET+POST).
  expect(sent.filter((s) => s.url.includes("/__cors/redirect/"))).toHaveLength(40);
});

test.describe("with browser-managed HTTP credentials for the external origin", () => {
  test.use({ httpCredentials: { username: "zoijs", password: "basic-SECRET" } });

  test("createApi: HTTP authentication is never sent cross-origin", async ({ page, browserName }) => {
    const { out } = await inExternal(page, `
      const r = await settled(createApi({ baseURL: X + "/__cors/" })("/basic/client-" + uid));
      const control = await realFetch(X + "/__cors/basic/control-" + uid, { credentials: "include" }).then((res) => res.status, () => "failed");
      return { error: err(r.error()), client: await hitInfo("/__cors/basic/client-" + uid), control, controlHits: await hitInfo("/__cors/basic/control-" + uid) };
    `);
    expect(out.error).toMatchObject({ type: "http", status: 401 });
    expect(out.client.authorized).toBe(0); // the challenge was not answered with credentials
    // Proof the browser does hold credentials to answer with: a credentialed fetch sends them.
    // Asserted in Chromium only — how Playwright supplies httpCredentials differs per engine.
    if (browserName === "chromium") expect(out.controlHits.authorized).toBeGreaterThan(0);
  });
});

test("createApi: paths can't escape the base — refused before any request; params stay one segment", async ({ page }) => {
  const external = [];
  page.on("request", (r) => {
    if (r.url().startsWith(X) && !r.url().includes("/__cors/v1/files/")) external.push(r.url());
  });
  const { out } = await inExternal(page, `
    const ext = createApi({ baseURL: X + "/__cors/v1/" });
    const refused = [];
    for (const url of ["http://127.0.0.1:3900/x", X + "/__cors/v1/x", "//127.0.0.1:3900/x", "\\\\x", "/\\\\127.0.0.1:3900/x", "../x", "/../x", "/%2e%2e/x", "/a/%2E./x", "x"]) {
      try { ext(url); refused.push([url, "sent"]); } catch (e) { refused.push([url, e.name]); }
    }
    const traversal = await settled(ext("/files/:name", { params: { name: "../../admin" } }));
    let badBase = [];
    for (const baseURL of ["//127.0.0.1:3901/", "/api", "http://user:pw@127.0.0.1:3901/", "javascript:alert(1)", X + "/?x=1", "http://example.com/"]) {
      try { createApi({ baseURL }); badBase.push("accepted"); } catch (e) { badBase.push(e.name); }
    }
    return { refused, path: traversal.data()?.path, badBase };
  `);
  for (const [url, result] of out.refused) expect(result, url).toBe("TypeError");
  expect(out.path).toBe("/__cors/v1/files/..%2F..%2Fadmin");
  expect(out.badBase.every((r) => r === "TypeError")).toBe(true);
  expect(external).toEqual([]);
});

test("createApi: GET retry, timeout and problem details work through the shared engine", async ({ page }) => {
  const { sent, out } = await inExternal(page, `
    const ext = createApi({ baseURL: X + "/__cors/" });
    const flaky = await settled(ext("/flaky/:id", { params: { id: "g-" + uid }, retry: 2, retryDelay: 10 }));
    const slow = await settled(ext("/hang-once/:id", { params: { id: "t-" + uid }, timeout: 400, retry: 1, retryDelay: 10 }));
    const timedOut = await settled(ext("/hang-once/:id", { params: { id: "t2-" + uid }, timeout: 300 }));
    const m = ext.post("/problem", { problemDetails: true });
    await m.run({ qty: -1 });
    return { flaky: flaky.data()?.path, flakyHits: await hits("/__cors/flaky/g-" + uid), slow: slow.data()?.path, timedOut: err(timedOut.error()), problem: err(m.error()) };
  `);
  expect(out.flaky).toMatch(/^\/__cors\/flaky\/g-/);
  expect(out.flakyHits).toBe(2);
  expect(out.slow).toMatch(/^\/__cors\/hang-once\/t-/);
  expect(out.timedOut).toMatchObject({ type: "timeout", message: "GET request timed out" });
  expect(out.problem).toMatchObject({ type: "http", status: 422, message: "POST request failed: 422 Unprocessable Entity" });
  expect(out.problem.problem).toEqual({ type: "https://errors.example/invalid", title: "Invalid order", status: 422, detail: "quantity must be positive" });
  expect(new Set(sent.filter((s) => s.url.includes("/flaky/")).map((s) => s.url)).size).toBe(1); // same URL on retry
});

test("createApi: POST/PUT/PATCH/DELETE, FormData, idempotent retries and invalidation across boundaries", async ({ page }) => {
  const { sent, out } = await inExternal(page, `
    const ext = createApi({ baseURL: X + "/__cors/" });
    const local = api("./data/tasks.json");
    await settled(local);
    const save = ext.post("/flaky/:id", { idempotencyKey: true, retry: 2, retryDelay: 10, invalidate: local });
    const saved = await save.run({ params: { id: "m-" + uid }, body: { total: 5 } });
    await wait(150);
    const put = await ext.put("/items/:id").run({ params: { id: 7 }, body: { a: 1 } });
    const patch = await ext.patch("/items/:id").run({ params: { id: 7 }, body: { b: 2 } });
    const del = await ext.delete("/items/:id", { query: { hard: true } }).run({ params: { id: 7 } });
    const form = new FormData();
    form.append("note", "über ✓");
    form.append("file", new File([new Uint8Array([0, 1, 254, 255])], "a.bin", { type: "application/octet-stream" }));
    const up = await ext.post("/flaky/:id", { idempotencyKey: true, retry: 1, retryDelay: 10 }).run({ params: { id: "f-" + uid }, body: form });
    local.dispose();
    return { saved, attempt: save.attempt(), put, patch, del, up };
  `);
  const saves = sent.filter((s) => s.url.includes("/flaky/m-"));
  expect(saves).toHaveLength(2);
  expect(saves[1].key).toBe(saves[0].key);
  expect(saves[0].key).toMatch(/^[0-9a-f-]{36}$/);
  expect(out.saved).toMatchObject({ method: "POST", idempotencyKey: saves[0].key, contentType: "application/json" });
  expect(Buffer.from(out.saved.body, "base64").toString()).toBe('{"total":5}');
  expect(out.attempt).toBe(2);
  expect(sent.filter((s) => s.url.endsWith("/data/tasks.json"))).toHaveLength(2); // initial + one invalidation
  expect(out.put).toMatchObject({ method: "PUT", path: "/__cors/items/7" });
  expect(out.patch).toMatchObject({ method: "PATCH", path: "/__cors/items/7" });
  expect(out.del).toMatchObject({ method: "DELETE", path: "/__cors/items/7", search: "?hard=true", body: "" });
  const parts = parseMultipart(out.up.contentType, out.up.body);
  expect(parts[0].body.toString("utf8")).toBe("über ✓");
  expect([...parts[1].body]).toEqual([0, 1, 254, 255]);
  expect(sent.filter((s) => s.url.startsWith(X)).every((s) => s.mode === "cors" && s.credentials === "omit" && s.redirect === "manual" && s.referrerPolicy === "strict-origin-when-cross-origin")).toBe(true);
});

// ---- Phase 11: Bearer authentication through createApi({ auth }) — real CORS preflights -----------
// /__cors/auth/… allows Authorization in its preflight; plain /__cors/… doesn't.

test("auth: the Bearer token reaches the configured origin through a real preflight (sync and async providers)", async ({ page }) => {
  const { sent, out } = await inExternal(page, `
    document.cookie = "zoijs_p11=cookie-SECRET; path=/; SameSite=Lax";
    let calls = 0;
    const ext = createApi({ baseURL: X + "/__cors/auth/", auth: () => (calls++, "tok-" + uid) });
    const later = createApi({ baseURL: X + "/__cors/auth/", auth: async () => { await wait(30); return "async-" + uid; } });
    const r = await settled(ext("/me/:id", { params: { id: 7 } }));
    const posted = await later.post("/orders", { idempotencyKey: true }).run({ total: 5 });
    document.cookie = "zoijs_p11=; path=/; max-age=0";
    return { get: r.data(), posted, calls, error: err(r.error()) };
  `);
  expect(out.error).toBeNull();
  expect(out.get).toMatchObject({ path: "/__cors/auth/me/7", authorization: expect.stringMatching(/^Bearer tok-/), cookie: null });
  expect(out.posted).toMatchObject({ method: "POST", authorization: expect.stringMatching(/^Bearer async-/), cookie: null, contentType: "application/json" });
  expect(out.posted.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(out.calls).toBe(1);
  expect(sent.every((s) => s.credentials === "omit" && s.mode === "cors" && s.redirect === "manual")).toBe(true);
});

test("auth: a server whose preflight refuses Authorization fails normally — the request itself is never sent", async ({ page }) => {
  const { out } = await inExternal(page, `
    const ext = createApi({ baseURL: X + "/__cors/", auth: () => "tok-SECRET-" + uid });
    const r = await settled(ext("/no-auth-" + uid));
    const anon = await settled(createApi({ baseURL: X + "/__cors/" })("/anon-" + uid)); // unauthenticated: no preflight needed
    return { error: err(r.error()), hits: await hitInfo("/__cors/no-auth-" + uid), anon: anon.data()?.authorization, anonError: err(anon.error()) };
  `);
  expect(out.error).toMatchObject({ type: "network", message: "GET request failed: network error" });
  expect(JSON.stringify(out.error)).not.toContain("SECRET");
  expect(out.hits).toEqual({ count: 0, authorized: 0 }); // only the refused preflight reached the server
  expect(out.anonError).toBeNull();
  expect(out.anon).toBeNull();
});

test("auth: no redirect forwards the token — 301/302/303/307/308, GET and POST, other origin, same origin, with retries", async ({ page }) => {
  const { sent, out } = await inExternal(page, `
    const ext = createApi({ baseURL: X + "/__cors/auth/", auth: () => "tok-SECRET-" + uid });
    const targets = {
      otherOrigin: "http://127.0.0.1:3900/__echo/stolen-" + uid,
      otherPort: "http://127.0.0.1:3900/__cors/auth/stolen-p-" + uid,
      sameOrigin: X + "/__cors/auth/stolen-same-" + uid,
    };
    const results = [];
    for (const code of [301, 302, 303, 307, 308]) {
      for (const [name, to] of Object.entries(targets)) {
        const r = await settled(ext("/redirect/" + code, { query: { to }, retry: 2, retryDelay: 10 }));
        const m = ext.post("/redirect/" + code, { query: { to }, idempotencyKey: true, retry: 2, retryDelay: 10 });
        await m.run({ secret: "body" });
        results.push({ code, name, get: err(r.error()), post: err(m.error()) });
      }
    }
    const reached = {};
    for (const p of ["/__echo/stolen-", "/__cors/auth/stolen-p-", "/__cors/auth/stolen-same-"]) reached[p] = await hitInfo(p + uid);
    return { results, reached };
  `);
  for (const { code, name, get, post } of out.results) {
    expect(get, `${code} ${name}`).toMatchObject({ type: "security" });
    expect(post, `${code} ${name}`).toMatchObject({ type: "security" });
  }
  for (const [p, h] of Object.entries(out.reached)) expect(h, p).toEqual({ count: 0, authorized: 0 });
  expect(sent.filter((s) => s.url.includes("/redirect/"))).toHaveLength(30); // one request each, never retried
  expect(JSON.stringify(out.results)).not.toContain("SECRET");
});

test("auth: retries reuse one token snapshot; a superseded async provider never sends", async ({ page }) => {
  const { sent, out } = await inExternal(page, `
    let n = 0;
    const retried = createApi({ baseURL: X + "/__cors/auth/", auth: () => "snap-" + (++n) });
    const r = await settled(retried("/flaky/:id", { params: { id: "r-" + uid }, retry: 2, retryDelay: 10 }));
    const gates = [];
    const slow = createApi({ baseURL: X + "/__cors/auth/", auth: () => new Promise((res) => gates.push(res)) });
    const id = core.createState("old");
    const res = slow("/users/:id", { params: () => ({ id: id.get() + "-" + uid }) });
    await wait(20);
    id.set("new");
    await wait(20);
    gates[1]("new-token");
    await wait(50);
    gates[0]("old-token"); // resolves after its load was superseded
    await settled(res);
    await wait(100);
    res.dispose();
    return { retried: r.data()?.authorization, n, latest: res.data(), oldHits: await hits("/__cors/auth/users/old-" + uid), newHits: await hits("/__cors/auth/users/new-" + uid) };
  `);
  const flaky = sent.filter((s) => s.url.includes("/flaky/"));
  expect(flaky).toHaveLength(2);
  expect(flaky[0].authorization).toBe("Bearer snap-1");
  expect(flaky[1].authorization).toBe("Bearer snap-1");
  expect(out.n).toBe(1);
  expect(out.retried).toBe("Bearer snap-1");
  expect(out.latest).toMatchObject({ authorization: "Bearer new-token" });
  expect(out.oldHits).toBe(0);
  expect(out.newHits).toBe(1);
});

test("auth: a FormData upload with Authorization is retried with the same token, key and contents", async ({ page }) => {
  const { sent, out } = await inExternal(page, `
    const ext = createApi({ baseURL: X + "/__cors/auth/", auth: async () => "up-" + uid });
    const form = new FormData();
    form.append("note", "über ✓");
    form.append("file", new File([new Uint8Array([0, 1, 254, 255])], "a.bin", { type: "application/octet-stream" }));
    const up = ext.post("/flaky/:id", { idempotencyKey: true, retry: 1, retryDelay: 10 });
    const echoed = await up.run({ params: { id: "f-" + uid }, body: form });
    return { echoed, attempt: up.attempt() };
  `);
  const ups = sent.filter((s) => s.url.includes("/flaky/f-"));
  expect(ups).toHaveLength(2);
  expect(new Set(ups.map((s) => s.authorization + s.key)).size).toBe(1);
  expect(out.attempt).toBe(2);
  expect(out.echoed.authorization).toMatch(/^Bearer up-/);
  const parts = parseMultipart(out.echoed.contentType, out.echoed.body);
  expect(parts[0].body.toString("utf8")).toBe("über ✓");
  expect([...parts[1].body]).toEqual([0, 1, 254, 255]);
});

test("auth: unauthenticated clients and api() are unchanged — no Authorization anywhere", async ({ page }) => {
  const { sent, out } = await inExternal(page, `
    const anon = await settled(createApi({ baseURL: X + "/__cors/" })("/plain-" + uid));
    const local = await settled(api("./data/tasks.json"));
    return { anon: anon.data()?.authorization, local: local.data()?.length };
  `);
  expect(out.anon).toBeNull();
  expect(out.local).toBe(3);
  expect(sent.every((s) => !s.authorization)).toBe(true);
  expect(sent.find((s) => s.url.endsWith("/data/tasks.json"))).toMatchObject({ mode: "same-origin", credentials: "same-origin", redirect: null, referrerPolicy: null });
});

// ---- Phase 12: the auth provider's lifecycle (abort signal, authTimeout, echoed-token redaction) -------

test("auth lifecycle: authTimeout ends a hanging provider — signal aborted with TimeoutError, nothing sent", async ({ page }) => {
  const { out } = await inExternal(page, `
    let seen;
    const ext = createApi({ baseURL: X + "/__cors/auth/", authTimeout: 300, auth: ({ signal }) => { seen = signal; return new Promise(() => {}); } });
    const started = performance.now();
    const r = await settled(ext("/never-" + uid, { retry: 2, retryDelay: 10 }));
    return { error: err(r.error()), ms: performance.now() - started, aborted: seen.aborted, reason: seen.reason?.name, hits: await hitInfo("/__cors/auth/never-" + uid) };
  `);
  expect(out.error).toMatchObject({ type: "auth", message: "GET request not sent: the auth provider timed out" });
  expect(out.aborted).toBe(true);
  expect(out.reason).toBe("TimeoutError");
  expect(out.ms).toBeLessThan(3000);
  expect(out.hits).toEqual({ count: 0, authorized: 0 });
});

test("auth lifecycle: a superseded request aborts the provider's own token fetch (signal passed through)", async ({ page }) => {
  const { out } = await inExternal(page, `
    const tokenFetches = [];
    const ext = createApi({
      baseURL: X + "/__cors/auth/",
      auth: async ({ signal }) => {
        const n = tokenFetches.length;
        tokenFetches.push("pending");
        try {
          // a token endpoint that's slow the first time (3 s), fast afterwards
          await realFetch(X + "/__cors/hang-once/token-" + uid, { signal });
          tokenFetches[n] = "done";
          return "tok-" + n;
        } catch (e) {
          tokenFetches[n] = e.name;
          throw e;
        }
      },
    });
    const r = ext("/me-" + uid);
    await wait(150);
    r.refresh(); // supersedes the first load while its token fetch is still in flight
    await settled(r);
    await wait(50);
    const data = r.data();
    r.dispose();
    return { tokenFetches, auth: data?.authorization, error: err(r.error()) };
  `);
  expect(out.tokenFetches[0]).toBe("AbortError"); // the provider's own fetch was cancelled
  expect(out.tokenFetches[1]).toBe("done");
  expect(out.auth).toBe("Bearer tok-1");
  expect(out.error).toBeNull();
});

test("auth lifecycle: a server echoing the token in problem details and status text never exposes it", async ({ page }) => {
  const { out } = await inExternal(page, `
    const reported = [];
    core.configure({ onError: (e) => reported.push({ message: e.message, statusText: e.statusText, problem: e.problem && { ...e.problem } }) });
    const T = "tok.MARKER-" + uid;
    const ext = createApi({ baseURL: X + "/__cors/auth/", auth: () => T });
    const r = await settled(ext("/echo-problem", { problemDetails: true }));
    const m = ext.post("/echo-problem", { problemDetails: true });
    await m.run({});
    core.configure({ onError: null });
    const surfaces = [r.error(), m.error()].map((e) => ({ message: e.message, statusText: e.statusText, url: e.url, stack: e.stack, problem: e.problem && { ...e.problem } }));
    return { T, surfaces, reported, leaked: JSON.stringify({ surfaces, reported }).includes(T) };
  `);
  expect(out.leaked).toBe(false);
  expect(out.surfaces[0].problem).toMatchObject({ title: "Rejected Bearer [redacted]", detail: "The credential Bearer [redacted] has expired", status: 401 });
  expect(out.reported.length).toBeGreaterThan(0);
  // HTTP/1.1 carries the reason phrase; where the browser exposes one, it's redacted too
  for (const s of out.surfaces) if (s.statusText) expect(s.statusText).toBe("Unauthorized Bearer [redacted]");
});
