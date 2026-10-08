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

test("FormData is sent as multipart with a browser-generated boundary; JSON and none differ", async ({ page }) => {
  const seen = [];
  await page.route(/\/__upload/, async (r) => {
    const req = r.request();
    seen.push({ type: req.headers()["content-type"] ?? null, body: req.postData() ?? "" });
    await r.fulfill({ status: 201, contentType: "application/json", body: "{}" });
  });
  await page.goto(EXAMPLE);
  await page.evaluate(async () => {
    const { api } = await import("/api/src/index.js");
    const form = new FormData();
    form.append("description", "Profile photo");
    form.append("file", new Blob(["PNGDATA"], { type: "image/png" }), "me.png");
    const up = api.post("/__upload/:id", { exclusive: true });
    await Promise.all([up.run({ params: { id: 7 }, body: form }), up.run({ params: { id: 7 }, body: form })]);
    const plain = api.post("/__upload");
    await plain.run({ a: 1 });
    await plain.run();
  });
  expect(seen).toHaveLength(3); // exclusive: the double submit sent once
  expect(seen[0].type).toMatch(/^multipart\/form-data; boundary=/);
  expect(seen[0].body).toContain('name="description"');
  expect(seen[0].body).toContain("PNGDATA");
  expect(seen[1]).toEqual({ type: "application/json", body: '{"a":1}' });
  expect(seen[2].type).toBeNull();
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
// "f" fail with 503, "n" drop the connection, "s" hang 600 ms, "k" succeed (the last letter repeats).
async function retryRoute(page) {
  const seen = [];
  await page.route(/\/__retry\//, async (r) => {
    const req = r.request();
    const plan = new URL(req.url()).pathname.split("/")[2];
    const n = seen.filter((x) => x.path === new URL(req.url()).pathname && x.method === req.method()).length;
    seen.push({ path: new URL(req.url()).pathname, method: req.method(), key: req.headers()["idempotency-key"] ?? null, body: req.postData() ?? null });
    const step = plan[Math.min(n, plan.length - 1)];
    if (step === "n") return r.abort("connectionreset");
    if (step === "s") await new Promise((res) => setTimeout(res, 600));
    if (step === "f") return r.fulfill({ status: 503, contentType: "application/json", body: "{}" }).catch(() => {});
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
  const bodies = [];
  await page.route(/\/__multipart/, async (r) => {
    const req = r.request();
    bodies.push({ type: req.headers()["content-type"], buf: req.postDataBuffer() });
    await r.fulfill({ status: 201, contentType: "application/json", body: "{}" });
  });
  await page.goto(EXAMPLE);
  const before = await page.evaluate(async () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const form = new FormData();
    form.append("description", "Profile photo ✓");
    form.append("file", new File([bytes], "photo.png", { type: "image/png" }));
    form.append("blob", new Blob(["plain text\r\n--not-a-boundary"], { type: "text/plain" }), "notes.txt");
    const snapshot = async () => Promise.all([...form.entries()].map(async ([k, v]) => [k, typeof v === "string" ? v : [v.name, v.type, v.size, Array.from(new Uint8Array(await v.arrayBuffer())).join(",")]]));
    const first = await snapshot();
    await fetch("/__multipart", { method: "POST", body: form });
    await fetch("/__multipart", { method: "POST", body: form });
    const after = await snapshot();
    return JSON.stringify(first) === JSON.stringify(after);
  });
  expect(before).toBe(true); // the caller's FormData isn't changed by being sent
  expect(bodies).toHaveLength(2);
  const parse = ({ type, buf }) => {
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(type);
    expect(boundary).not.toBeNull();
    const sep = Buffer.from("--" + (boundary[1] || boundary[2]));
    const parts = [];
    let at = buf.indexOf(sep);
    while (at !== -1) {
      const next = buf.indexOf(sep, at + sep.length);
      if (next === -1) break;
      const part = buf.subarray(at + sep.length + 2, next - 2); // skip CRLF after the boundary and before the next
      const split = part.indexOf("\r\n\r\n");
      const head = part.subarray(0, split).toString("latin1").toLowerCase().split("\r\n").map((l) => l.replace(/\s+/g, " ").trim()).sort().join("|");
      parts.push({ head, body: part.subarray(split + 4).toString("base64") });
      at = next;
    }
    return parts;
  };
  const [a, b] = bodies.map(parse);
  expect(a).toHaveLength(3);
  expect(b).toEqual(a);
  expect(a[0].head).toContain('name="description"');
  expect(Buffer.from(a[0].body, "base64").toString("utf8")).toBe("Profile photo ✓");
  expect(a[1].head).toContain('filename="photo.png"');
  expect(a[1].head).toContain("content-type: image/png");
  expect([...Buffer.from(a[1].body, "base64")]).toEqual([...Array(256).keys()]);
  expect(a[2].head).toContain('filename="notes.txt"');
  expect(Buffer.from(a[2].body, "base64").toString("utf8")).toBe("plain text\r\n--not-a-boundary");
});
