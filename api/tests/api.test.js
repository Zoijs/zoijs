// Tests for @zoijs/api. The page runs at https://app.example.com/dashboard/ (tests/setup-dom.js);
// fetch is replaced per test with a stub that records each call and answers with a real Response.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, configure } from "@zoijs/core";
import { api, ApiError } from "../src/index.js";

const tick = () => new Promise((resolve) => setTimeout(resolve));
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

const realFetch = globalThis.fetch;
let calls = [];
// `respond(url, init)` returns a Response (or a promise of one), or throws.
function stubFetch(respond) {
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve().then(() => respond(url, init));
  };
}
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, ...init, headers: { "Content-Type": "application/json", ...init.headers } });

async function load(url, respond) {
  stubFetch(respond);
  const r = api(url);
  await settle();
  return r;
}

// ---- successful responses ---------------------------------------------------

test("200 application/json is parsed, through the resource lifecycle", async () => {
  stubFetch(() => json([{ id: 1, title: "Write docs" }]));
  const users = api("/users");
  assert.equal(users.loading(), true);
  assert.equal(users.data(), undefined);
  assert.equal(users.error(), null);
  await settle();
  assert.equal(users.loading(), false);
  assert.deepEqual(users.data(), [{ id: 1, title: "Write docs" }]);
  assert.equal(users.error(), null);
});

test("the request is a same-origin GET of the resolved URL, with no body", async () => {
  await load("/api/users", () => json([]));
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, "https://app.example.com/api/users");
  assert.equal(init.method, "GET");
  assert.equal(init.mode, "same-origin", "the browser refuses cross-origin requests and redirects");
  assert.equal(init.credentials, "same-origin");
  assert.equal(init.body, undefined);
  assert.match(init.headers.Accept, /^application\/json/);
  assert.ok(init.signal, "an AbortSignal is passed");
});

test("JSON with parameters, +json and differently-cased types parse; look-alikes don't", async () => {
  for (const type of ["application/json; charset=utf-8", "application/problem+json", "application/vnd.api+json; charset=UTF-8", "Application/JSON", " application/json ;charset=utf-8", "text/json"]) {
    const r = await load("/api/x", () => new Response('{"ok":true}', { headers: { "Content-Type": type } }));
    assert.deepEqual(r.data(), { ok: true }, type);
  }
  for (const type of ["application/jsonp", "application/json-seq", "text/html", "application/x-json-stream", "jsonx/plain"]) {
    const r = await load("/api/x", () => new Response('{"ok":true}', { headers: { "Content-Type": type } }));
    assert.equal(r.data(), '{"ok":true}', `${type} is returned as text`);
  }
});

test("204 and 205 return null without parsing; an empty JSON body is null", async () => {
  for (const status of [204, 205]) {
    const r = await load("/api/x", () => new Response(null, { status, headers: { "Content-Type": "application/json" } }));
    assert.equal(r.data(), null, String(status));
    assert.equal(r.error(), null);
  }
  const empty = await load("/api/x", () => new Response("", { status: 200, headers: { "Content-Type": "application/json" } }));
  assert.equal(empty.data(), null);
  assert.equal(empty.error(), null);
});

test("text/plain (and a missing Content-Type) returns the body as a string", async () => {
  const text = await load("/api/x", () => new Response("hello", { headers: { "Content-Type": "text/plain; charset=utf-8" } }));
  assert.equal(text.data(), "hello");
  const none = await load("/api/x", () => new Response(new Blob(["raw"]), {}));
  assert.equal(typeof none.data(), "string");
});

test("returned text is data: rendered, an HTML/script body stays text", async () => {
  const payload = '<img src=x onerror="globalThis.__pwned=1"><script>globalThis.__pwned=1</script>';
  stubFetch(() => new Response(payload, { headers: { "Content-Type": "text/html" } }));
  const host = document.createElement("div");
  const unmount = mount(() => {
    const page = api("/api/fragment");
    return html`<p>${() => page.data() ?? ""}</p>`;
  }, host);
  await settle();
  assert.equal(host.querySelector("p").textContent, payload);
  assert.equal(host.querySelector("img, script"), null);
  assert.equal(globalThis.__pwned, undefined);
  unmount();
});

test("JSON with __proto__ keys can't pollute prototypes", async () => {
  const r = await load("/api/x", () => new Response('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}', { headers: { "Content-Type": "application/json" } }));
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.ok(Object.prototype.hasOwnProperty.call(r.data(), "__proto__"), "kept as a plain own key");
});

// ---- HTTP errors --------------------------------------------------------------

test("404 is an ApiError of type http with the structured fields", async () => {
  const r = await load("/api/users", () => new Response("not here", { status: 404, statusText: "Not Found" }));
  const err = r.error();
  assert.ok(err instanceof ApiError);
  assert.ok(err instanceof Error);
  assert.equal(err.name, "ApiError");
  assert.equal(err.type, "http");
  assert.equal(err.status, 404);
  assert.equal(err.statusText, "Not Found");
  assert.equal(err.method, "GET");
  assert.equal(err.url, "https://app.example.com/api/users");
  assert.equal(err.message, "GET request failed: 404 Not Found");
  assert.equal(r.data(), undefined);
  assert.equal(r.loading(), false);
});

test("500 produces the structured error; a status without text omits it", async () => {
  const r = await load("/api/users", () => new Response(JSON.stringify({ detail: "db down" }), { status: 500, statusText: "Internal Server Error", headers: { "Content-Type": "application/problem+json" } }));
  assert.equal(r.error().type, "http");
  assert.equal(r.error().status, 500);
  assert.equal(r.error().message, "GET request failed: 500 Internal Server Error");
  assert.ok(!r.error().message.includes("db down"), "the response body is never in the error");
  const bare = await load("/api/users", () => new Response("", { status: 503 }));
  assert.equal(bare.error().statusText, "");
  assert.equal(bare.error().message, "GET request failed: 503");
});

test("no non-2xx status is treated as success", async () => {
  for (const status of [400, 401, 403, 404, 409, 410, 422, 429, 500, 502, 503]) {
    const r = await load("/api/x", () => json({ ok: true }, { status }));
    assert.equal(r.error()?.type, "http", String(status));
    assert.equal(r.error().status, status);
    assert.equal(r.data(), undefined, `${status} doesn't set data`);
  }
});

test("a 2xx JSON response that isn't JSON is a parse error", async () => {
  const r = await load("/api/x", () => new Response("<html>oops</html>", { headers: { "Content-Type": "application/json" } }));
  assert.equal(r.error().type, "parse");
  assert.equal(r.error().status, 200);
  assert.equal(r.error().message, "GET request failed: the response is not valid JSON");
});

test("a network failure is type network and doesn't carry the platform message", async () => {
  const r = await load("/api/x?cursor=s3cret", () => {
    throw new TypeError("fetch failed: https://app.example.com/api/x?cursor=s3cret");
  });
  const err = r.error();
  assert.equal(err.type, "network");
  assert.equal(err.status, null);
  assert.equal(err.message, "GET request failed: network error");
  assert.equal(err.url, "https://app.example.com/api/x");
  assert.ok(!JSON.stringify({ ...err, message: err.message, stack: err.stack }).includes("s3cret"));
  assert.equal(err.cause, undefined);
});

// ---- same-origin policy --------------------------------------------------------

test("cross-origin URLs are rejected as security errors, without a request", async () => {
  const blocked = [
    "https://evil.example/data",
    "//evil.example/data", // protocol-relative
    "/\\evil.example/data", // backslash: URL parsing makes this //evil.example
    "\\\\evil.example/data",
    "http://app.example.com/api", // scheme downgrade is another origin
    "https://app.example.com:8443/api", // another port
    "https://app.example.com.evil.example/api", // prefix look-alike
    "https://evil.example/https://app.example.com/api",
    "javascript:alert(1)",
    "data:application/json,{}",
    "blob:https://app.example.com/0b7c1f2e-0000-0000-0000-000000000000",
    "ftp://app.example.com/api",
    " https://evil.example/ ", // whitespace is stripped by the URL parser, not by us
    "http:evil.example/data", // a different scheme is absolute: http://evil.example/data
  ];
  for (const url of blocked) {
    const r = await load(url, () => json({ leaked: true }));
    assert.equal(calls.length, 0, `${url}: no request`);
    const err = r.error();
    assert.ok(err instanceof ApiError, url);
    assert.equal(err.type, "security", url);
    assert.equal(err.status, null);
    assert.equal(err.method, "GET");
    assert.equal(r.data(), undefined);
  }
});

test("https://evil.example/data is rejected from https://app.example.com", async () => {
  const r = await load("https://evil.example/data", () => json({}));
  assert.equal(r.error().type, "security");
  assert.equal(r.error().url, "https://evil.example/data");
  assert.match(r.error().message, /^GET blocked: https:\/\/evil\.example is not the page's origin/);
});

test("same-origin absolute URLs are allowed (case and default port normalized by URL)", async () => {
  for (const url of ["https://app.example.com/api/users", "HTTPS://APP.EXAMPLE.COM/api/users", "https://app.example.com:443/api/users"]) {
    const r = await load(url, () => json([{ id: 1 }]));
    assert.equal(r.error(), null, url);
    assert.deepEqual(r.data(), [{ id: 1 }]);
    assert.equal(calls[0].url, "https://app.example.com/api/users");
  }
});

test("relative URLs resolve against the document base URL, like fetch()", async () => {
  await load("/api/users", () => json([]));
  assert.equal(calls[0].url, "https://app.example.com/api/users");
  await load("api/users?page=2", () => json([]));
  assert.equal(calls[0].url, "https://app.example.com/dashboard/api/users?page=2");
  await load("../api/users", () => json([]));
  assert.equal(calls[0].url, "https://app.example.com/api/users");
  // Same scheme without slashes is a relative path per the URL standard — it stays on this origin.
  await load("https:evil.example/data", () => json([]));
  assert.equal(calls[0].url, "https://app.example.com/dashboard/evil.example/data");
});

test("URLs with credentials are rejected and the credentials never appear in the error", async () => {
  for (const url of ["https://user:hunter2@app.example.com/api", "https://hunter2@app.example.com/api", "//user:hunter2@app.example.com/api"]) {
    const r = await load(url, () => json({}));
    assert.equal(calls.length, 0);
    assert.equal(r.error().type, "security");
    assert.match(r.error().message, /credentials in the URL/);
    assert.ok(!JSON.stringify({ ...r.error(), m: r.error().message }).includes("hunter2"), url);
  }
});

test("a malformed URL is a security error that doesn't echo the input", async () => {
  const r = await load("https://[secret-token", () => json({}));
  assert.equal(calls.length, 0);
  assert.equal(r.error().type, "security");
  assert.equal(r.error().message, "GET blocked: invalid URL");
  assert.equal(r.error().url, null);
});

test("without an http(s) page origin every request is refused", async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "location");
  try {
    for (const loc of [undefined, { href: "file:///home/me/index.html" }, { href: "about:blank" }, { href: "not a url" }]) {
      Object.defineProperty(globalThis, "location", { value: loc, configurable: true, writable: true });
      const r = await load("/api/users", () => json({}));
      assert.equal(calls.length, 0, JSON.stringify(loc));
      assert.equal(r.error().type, "security");
      assert.match(r.error().message, /needs an http\(s\) page origin/);
    }
  } finally {
    Object.defineProperty(globalThis, "location", saved);
  }
});

test("a response redirected to another origin is refused (defense in depth)", async () => {
  const r = await load("/api/users", () => {
    const res = json({ leaked: true });
    Object.defineProperty(res, "redirected", { value: true });
    Object.defineProperty(res, "url", { value: "https://evil.example/collect" });
    return res;
  });
  assert.equal(r.error().type, "security");
  assert.match(r.error().message, /redirected to another origin/);
  assert.equal(r.data(), undefined);
  const same = await load("/api/users", () => {
    const res = json([1]);
    Object.defineProperty(res, "redirected", { value: true });
    Object.defineProperty(res, "url", { value: "https://app.example.com/api/v2/users" });
    return res;
  });
  assert.deepEqual(same.data(), [1], "same-origin redirects are fine");
});

// ---- no leaks -----------------------------------------------------------------------

test("errors never contain Authorization, Cookie, Bearer tokens, query strings or raw headers", async () => {
  document.cookie = "session=cookie-secret-value";
  const responses = [
    () => new Response('{"token":"Bearer body-secret"}', { status: 401, statusText: "Unauthorized", headers: { "WWW-Authenticate": 'Bearer realm="api", error="invalid_token"', "Set-Cookie": "session=set-cookie-secret", "Content-Type": "application/json" } }),
    () => { throw new TypeError("Authorization: Bearer header-secret; Cookie: session=cookie-secret-value"); },
    () => new Response("{nope", { headers: { "Content-Type": "application/json" } }),
  ];
  for (const respond of responses) {
    const r = await load("/api/me?q=query-secret#frag-secret", respond);
    const err = r.error();
    assert.ok(err instanceof ApiError);
    const dump = [err.message, String(err), err.stack, JSON.stringify(err), JSON.stringify(Object.getOwnPropertyNames(err).map((k) => err[k]))].join("\n");
    for (const secret of ["Authorization", "Cookie", "cookie-secret-value", "set-cookie-secret", "Bearer", "body-secret", "header-secret", "query-secret", "frag-secret", "q=", "WWW-Authenticate"]) {
      assert.ok(!dump.includes(secret), `${err.type} error leaks ${secret}`);
    }
    assert.deepEqual(Object.keys(err).sort(), ["method", "name", "problem", "status", "statusText", "type", "url"]);
    assert.equal(err.problem, null, "the body stays private without problemDetails");
  }
  // api() never sends request credentials of its own: only an Accept header.
  assert.deepEqual(Object.keys(calls[0].init.headers), ["Accept"]);
  document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

test("no error message contains the URL path (it may carry identifiers or tokens)", async () => {
  const path = "/api/reset/tok-9f8e7d";
  const cases = [
    [path, () => new Response("", { status: 404, statusText: "Not Found" }), "http"],
    [path, () => { throw new TypeError(`fetch failed: https://app.example.com${path}`); }, "network"],
    [path, () => new Response("{nope", { headers: { "Content-Type": "application/json" } }), "parse"],
    [path, () => { const res = json({}); Object.defineProperty(res, "redirected", { value: true }); Object.defineProperty(res, "url", { value: "https://evil.example/x" }); return res; }, "security"],
    [`https://evil.example${path}`, () => json({}), "security"],
    [`https://user:pw@app.example.com${path}`, () => json({}), "security"],
    [`javascript:fetch("${path}")`, () => json({}), "security"],
  ];
  for (const [url, respond, type] of cases) {
    const err = (await load(url, respond)).error();
    assert.equal(err.type, type, url);
    for (const part of ["/api", "reset", "tok-9f8e7d"]) assert.ok(!err.message.includes(part), `${type} message "${err.message}" contains ${part}`);
  }
  // The structured url field keeps origin + path for deliberate debugging.
  assert.equal((await load(path, () => new Response("", { status: 404 }))).error().url, `https://app.example.com${path}`);
});

test("api() writes nothing to the console", async () => {
  const original = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  const logged = [];
  for (const k of Object.keys(original)) console[k] = (...a) => logged.push(a);
  try {
    await load("/api/x", () => new Response("", { status: 500 }));
    await load("https://evil.example/", () => json({}));
    await load("/api/x", () => { throw new TypeError("offline"); });
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(logged, []);
});

// ---- resource lifecycle ----------------------------------------------------------

test("refresh() sends another request and keeps the data until it settles", async () => {
  let n = 0;
  const r = await load("/api/count", () => json({ n: ++n }));
  assert.deepEqual(r.data(), { n: 1 });
  r.refresh();
  assert.equal(r.loading(), true);
  assert.deepEqual(r.data(), { n: 1 }, "old data stays while reloading");
  await settle();
  assert.equal(calls.length, 2);
  assert.deepEqual(r.data(), { n: 2 });
  assert.equal(r.loading(), false);
});

test("refresh() after a failure clears the error and recovers", async () => {
  let fail = true;
  const r = await load("/api/x", () => (fail ? new Response("", { status: 503 }) : json({ ok: 1 })));
  assert.equal(r.error().status, 503);
  fail = false;
  r.refresh();
  assert.equal(r.error(), null, "a fresh attempt clears the error");
  await settle();
  assert.deepEqual(r.data(), { ok: 1 });
});

test("latest request wins, and the superseded request is aborted", async () => {
  const pending = [];
  stubFetch(() => new Promise((resolve) => pending.push(resolve)));
  const r = api("/api/search");
  await tick();
  r.refresh();
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.signal.aborted, true, "the first request was aborted");
  assert.equal(calls[1].init.signal.aborted, false);
  pending[1](json({ q: "new" }));
  await settle();
  pending[0](json({ q: "old" })); // a stale answer arriving late
  await settle();
  assert.deepEqual(r.data(), { q: "new" });
  assert.equal(r.error(), null, "the aborted request isn't reported as an error");
});

test("unmounting aborts the in-flight request; nothing settles or is reported", async () => {
  const reported = [];
  configure({ onError: (error, info) => reported.push({ error, info }) });
  try {
    let resolveIt;
    stubFetch((_url, init) => new Promise((resolve, reject) => {
      resolveIt = resolve;
      init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    let page;
    const host = document.createElement("div");
    const unmount = mount(() => {
      page = api("/api/slow");
      return html`<p>${() => (page.loading() ? "Loading…" : "done")}</p>`;
    }, host);
    await tick();
    assert.equal(host.textContent, "Loading…");
    unmount();
    assert.equal(calls[0].init.signal.aborted, true);
    resolveIt(json({ late: true }));
    await settle();
    assert.equal(page.data(), undefined);
    assert.equal(page.error(), null);
    assert.deepEqual(reported, []);
    // Unmount disposes it: refresh() throws a config ApiError instead of loading again.
    assert.throws(() => page.refresh(), (e) => e instanceof ApiError && e.type === "config" && /after dispose/.test(e.message));
    await settle();
    assert.equal(calls.length, 1);
  } finally {
    configure({ onError: null });
  }
});

test("failures reach configure({ onError }) once, as kind \"resource\", with the ApiError", async () => {
  const reported = [];
  configure({ onError: (error, info) => reported.push({ error, info }) });
  try {
    const r = await load("/api/users", () => new Response("", { status: 404, statusText: "Not Found" }));
    const blocked = await load("https://evil.example/", () => json({}));
    assert.equal(reported.length, 2);
    assert.equal(reported[0].error, r.error());
    assert.deepEqual(reported[0].info, { kind: "resource" });
    assert.equal(reported[1].error, blocked.error());
    assert.equal(reported[1].error.type, "security");
  } finally {
    configure({ onError: null });
  }
});

test("renders loading → list → error/retry like the resource it wraps", async () => {
  let fail = false;
  stubFetch(() => (fail ? new Response("", { status: 500, statusText: "Server Error" }) : json([{ id: 1, title: "Write docs" }])));
  const host = document.createElement("div");
  let tasks;
  const unmount = mount(() => {
    tasks = api("/api/tasks");
    return html`${() => {
      if (tasks.loading() && !tasks.data()) return html`<p>Loading...</p>`;
      if (tasks.error()) return html`<p role="alert">Failed: ${tasks.error().message}</p>`;
      return html`<ul>${(tasks.data() ?? []).map((t) => html`<li>${t.title}</li>`)}</ul>`;
    }}`;
  }, host);
  assert.equal(host.textContent, "Loading...");
  await settle();
  assert.equal(host.querySelector("li").textContent, "Write docs");
  fail = true;
  tasks.refresh();
  await settle();
  assert.equal(host.querySelector('[role="alert"]').textContent, "Failed: GET request failed: 500 Server Error");
  unmount();
});

// ---- input validation --------------------------------------------------------------------

test("api() takes exactly one non-empty string URL", () => {
  stubFetch(() => json({}));
  for (const bad of [undefined, null, 42, {}, new URL("https://app.example.com/api"), ["/api"], "", "   "]) {
    assert.throws(() => api(bad), TypeError, String(bad));
  }
  assert.throws(() => api("/api/x", { method: "POST" }), /always performs a GET/);
  assert.equal(calls.length, 0);
});
