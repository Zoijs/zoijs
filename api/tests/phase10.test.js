// Phase 10 — createApi(): explicit clients locked to ONE trusted origin. api() stays same-origin-only;
// a client reuses the same engine (resources, actions, retries, parsing) with a different boundary.

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { configure } from "@zoijs/core";
import { api, createApi, ApiError } from "../src/index.js";

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
const realFetch = globalThis.fetch;
let calls = [];
function stubFetch(script) {
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init, method: init.method, key: init.headers["Idempotency-Key"], body: init.body });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    return Promise.resolve().then(() => {
      if (step === "network") throw new TypeError("Failed to fetch https://api.example.com/v1/secret-path?q=secret");
      if (step === "hang") return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      return step(url, init);
    });
  };
}
test.afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
  globalThis.fetch = realFetch;
});
const json = (body = { ok: true }, status = 200, headers = {}) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const status = (code, headers = {}) => () => new Response("", { status: code, headers });
const loaded = async (r) => {
  for (let i = 0; i < 50 && r.loading(); i++) await settle();
  return r;
};
async function drive(p) {
  let settled = false;
  p.then(() => (settled = true));
  for (let i = 0; i < 500 && !settled; i++) {
    await settle();
    if (!settled) mock.timers.runAll();
  }
  await settle();
  assert.ok(settled);
  return p;
}
const ext = () => createApi({ baseURL: "https://api.example.com/v1/" });
const throwsCreate = (options, re) =>
  assert.throws(() => createApi(options), (e) => e instanceof TypeError && e.message.startsWith("createApi(): ") && (!re || re.test(e.message)), JSON.stringify(options));

// ---- baseURL ----------------------------------------------------------------------------------------

test("baseURL: absolute https (and loopback http) URLs are accepted and normalized to a directory", () => {
  const cases = {
    "https://api.example.com": "https://api.example.com/",
    "https://api.example.com/": "https://api.example.com/",
    "https://api.example.com/v1": "https://api.example.com/v1/",
    "https://api.example.com/v1/": "https://api.example.com/v1/",
    "HTTPS://API.Example.COM:443/v1": "https://api.example.com/v1/",
    "https://api.example.com:8443/a/b": "https://api.example.com:8443/a/b/",
    "https://xn--bcher-kva.example/api": "https://xn--bcher-kva.example/api/",
    "http://localhost:8080/api": "http://localhost:8080/api/",
    "http://127.0.0.1:3901": "http://127.0.0.1:3901/",
    "http://[::1]:3000/": "http://[::1]:3000/",
    "http://app.localhost/": "http://app.localhost/",
  };
  for (const [input, expected] of Object.entries(cases)) assert.equal(createApi({ baseURL: input }).baseURL, expected, input);
});

test("baseURL: relative, protocol-relative, non-http(s), credentialed and malformed URLs are refused", () => {
  for (const baseURL of [
    "", "/users", "users", "//example.com", "//example.com/v1/", "example.com", "api.example.com/v1",
    "javascript:alert(1)", "data:text/plain,x", "blob:https://api.example.com/1234", "file:///etc/passwd",
    "ftp://files.example.com/", "ws://api.example.com/", "https:", "https://", "https:///x",
    "https:api.example.com", "https:/api.example.com", "https://exa mple.com/", " https://api.example.com",
    "https://api.example.com/\n", "https:\\\\evil.example", "https://api.example.com\\@evil.example/",
    "https://[::1", "https://api.example.com:99999/",
  ]) throwsCreate({ baseURL });
  for (const baseURL of [42, null, undefined, {}, ["https://api.example.com"], new URL("https://api.example.com/")]) throwsCreate({ baseURL });
});

test("baseURL: plain http is allowed only for loopback hosts", () => {
  for (const baseURL of ["http://api.example.com/", "http://10.0.0.5:8080/", "http://192.168.1.10/", "http://localhost.example.com/", "http://127.0.0.1.evil.example/"]) {
    throwsCreate({ baseURL }, /https:/);
  }
});

test("baseURL: embedded credentials are refused and never echoed", () => {
  for (const baseURL of ["https://user:hunter2@api.example.com/", "https://user@api.example.com/", "https://:hunter2@api.example.com/"]) {
    assert.throws(() => createApi({ baseURL }), (e) => /credentials/.test(e.message) && !e.message.includes("hunter2") && !e.message.includes("user@"));
  }
});

test("baseURL: query strings, fragments and dot segments are refused", () => {
  for (const baseURL of ["https://api.example.com/v1?key=1", "https://api.example.com/v1/?", "https://api.example.com/#x", "https://api.example.com/v1#"]) throwsCreate({ baseURL }, /query string or fragment/);
  for (const baseURL of ["https://api.example.com/v1/../admin", "https://api.example.com/./v1", "https://api.example.com/%2e%2e/", "https://api.example.com/v1/%2E"]) throwsCreate({ baseURL }, /segments/);
});

test("options: only { baseURL, auth } — headers, credentials and anything else are refused", () => {
  throwsCreate({ baseURL: "https://api.example.com", headers: {} }, /unsupported option "headers"/);
  throwsCreate({ baseURL: "https://api.example.com", credentials: "include" }, /unsupported option "credentials"/);
  for (const key of ["mode", "redirect", "fetch", "token", "authorization", "trustedOrigins", "baseUrl"]) throwsCreate({ baseURL: "https://api.example.com", [key]: 1 }, /unsupported option/);
  throwsCreate({}, /baseURL must be/);
  throwsCreate(null, /plain object/);
  throwsCreate("https://api.example.com", /plain object/);
  assert.throws(() => createApi(), TypeError);
  assert.throws(() => createApi({ baseURL: "https://api.example.com" }, {}), TypeError);
});

// ---- base path and path escape -------------------------------------------------------------------------

test("base path: a leading '/' resolves UNDER the base path, never back to the origin root", async () => {
  const sent = [];
  stubFetch([(url) => (sent.push(url), json([])())]);
  for (const base of ["https://api.example.com/v1/", "https://api.example.com/v1"]) {
    const c = createApi({ baseURL: base });
    await loaded(c("/users"));
    await loaded(c("/users/:id/posts", { params: { id: "a/b" }, query: { page: 2, tag: ["x", "y"] } }));
    await loaded(c("/"));
    await loaded(c("/search?sort=new#frag", { query: { q: "a b" } }));
  }
  await loaded(createApi({ baseURL: "https://api.example.com" })("/users"));
  assert.deepEqual(sent, [
    "https://api.example.com/v1/users",
    "https://api.example.com/v1/users/a%2Fb/posts?page=2&tag=x&tag=y",
    "https://api.example.com/v1/",
    "https://api.example.com/v1/search?sort=new&q=a+b",
    "https://api.example.com/v1/users",
    "https://api.example.com/v1/users/a%2Fb/posts?page=2&tag=x&tag=y",
    "https://api.example.com/v1/",
    "https://api.example.com/v1/search?sort=new&q=a+b",
    "https://api.example.com/users",
  ]);
});

test("path escape: full, protocol-relative, relative, backslash and dot-segment paths are refused before any request", () => {
  stubFetch([json()]);
  const c = ext();
  const bad = [
    "https://evil.example/", "http://api.example.com/v1/users", "https://api.example.com/v1/users", "https://api.example.com.evil.com/v1/",
    "//evil.example/", " //evil.example/", "///evil.example", "\\evil", "/\\evil.example", "/users\\..\\admin",
    "../admin", "../../", "/../admin", "/a/../../b", "/./users", "/users/.", "/%2e%2e/admin", "/%2E%2e/admin", "/.%2e/x", "/%2e/x",
    "users", "./users", "?q=1", "#x", "/a\tb", "/a\nb", "/a b", "javascript:alert(1)", "data:,x", "blob:https://api.example.com/x",
  ];
  for (const url of bad) {
    for (const make of [() => c(url), () => c.post(url), () => c.put(url), () => c.patch(url), () => c.delete(url)]) {
      assert.throws(make, (e) => e instanceof TypeError && /client path|createApi\(\) client/.test(e.message), JSON.stringify(url));
    }
  }
  assert.equal(calls.length, 0);
});

test("params can't escape: traversal and URL-shaped values stay one encoded segment under the base", async () => {
  const sent = [];
  stubFetch([(url) => (sent.push(url), json()())]);
  const c = ext();
  for (const id of ["../../admin", "..%2F..%2Fadmin", "https://evil.example/", "//evil.example", "\\evil", "a?b#c", "%2e%2e"]) {
    await loaded(c("/files/:id", { params: { id } }));
  }
  assert.ok(sent.every((u) => u.startsWith("https://api.example.com/v1/files/") && new URL(u).origin === "https://api.example.com"), sent.join("\n"));
  for (const id of ["..", "."]) assert.throws(() => c("/files/:id", { params: { id } }), TypeError);
});

test("reactive params can't escape either: a refused value is a config error, nothing is sent", async () => {
  const { createState } = await import("@zoijs/core");
  stubFetch([json()]);
  const id = createState("1");
  const r = ext()("/files/:id", { params: () => ({ id: id.get() }) });
  await loaded(r);
  id.set("..");
  await settle();
  await loaded(r);
  assert.equal(r.error().type, "config");
  assert.equal(calls.length, 1);
  r.dispose();
});

// ---- isolation, origin lock, transport ------------------------------------------------------------------

test("api() is unchanged: still same-origin-only, even after clients exist, and still sends credentials same-origin", async () => {
  stubFetch([json()]);
  ext();
  createApi({ baseURL: "https://app.example.com/" });
  const blocked = await loaded(api("https://api.example.com/v1/users"));
  assert.equal(blocked.error().type, "security");
  assert.equal(calls.length, 0);
  await loaded(api("/me"));
  assert.equal(calls[0].url, "https://app.example.com/me");
  assert.equal(calls[0].init.mode, "same-origin");
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.equal("redirect" in calls[0].init, false);
  assert.equal("referrerPolicy" in calls[0].init, false);
  assert.equal("baseURL" in api, false);
});

test("client requests: mode cors, credentials omit, redirect manual, strict referrer — for every method", async () => {
  stubFetch([json()]);
  const c = ext();
  await loaded(c("/a"));
  await c.post("/b").run({ x: 1 });
  await c.put("/b/:id").run({ params: { id: 1 }, body: { x: 1 } });
  await c.patch("/b/:id").run({ params: { id: 1 }, body: { x: 1 } });
  await c.delete("/b/:id").run({ params: { id: 1 } });
  assert.deepEqual(calls.map((c) => c.method), ["GET", "POST", "PUT", "PATCH", "DELETE"]);
  for (const call of calls) {
    assert.equal(call.init.mode, "cors");
    assert.equal(call.init.credentials, "omit");
    assert.equal(call.init.redirect, "manual");
    assert.equal(call.init.referrerPolicy, "strict-origin-when-cross-origin");
    assert.ok(call.url.startsWith("https://api.example.com/v1/"));
    assert.deepEqual(Object.keys(call.init.headers).filter((h) => !["Accept", "Content-Type"].includes(h)), []); // no auth, no cookies, nothing extra
  }
});

test("two clients are isolated: each stays on its own origin and base path", async () => {
  const sent = [];
  stubFetch([(url) => (sent.push(url), json()())]);
  const a = createApi({ baseURL: "https://a.example.com/v1/" });
  const b = createApi({ baseURL: "https://b.example.com:8443/" });
  await loaded(a("/x"));
  await loaded(b("/x"));
  await a.post("/y").run({});
  assert.deepEqual(sent, ["https://a.example.com/v1/x", "https://b.example.com:8443/x", "https://a.example.com/v1/y"]);
});

test("a same-origin client works too (but still CORS mode, no credentials)", async () => {
  stubFetch([json([1])]);
  const backend = createApi({ baseURL: "https://app.example.com/api/" });
  const r = await loaded(backend("/items"));
  assert.deepEqual(r.data(), [1]);
  assert.equal(calls[0].url, "https://app.example.com/api/items");
  assert.equal(calls[0].init.credentials, "omit");
});

test("redirects are never followed: opaque redirects and raw 3xx are security errors, never retried", async () => {
  const opaque = () => ({ type: "opaqueredirect", status: 0, ok: false, redirected: false, url: "", headers: new Headers(), body: null });
  for (const step of [opaque, status(301, { Location: "https://evil.example/" }), status(307, { Location: "https://api.example.com/v1/other" }), status(308, { Location: "http://api.example.com/" })]) {
    stubFetch([step, json()]);
    const r = await loaded(ext()("/moved", { retry: 3, retryDelay: 1 }));
    assert.equal(r.error().type, "security", String(step));
    assert.match(r.error().message, /doesn't follow redirects/);
    assert.equal(calls.length, 1);
    stubFetch([step, json()]);
    const m = ext().post("/save", { idempotencyKey: true, retry: 3, retryDelay: 1 });
    await m.run({ card: "4111" });
    assert.equal(m.error().type, "security");
    assert.equal(calls.length, 1);
  }
});

test("defense in depth: a response that reports a cross-origin redirect is refused", async () => {
  globalThis.fetch = async () => {
    const res = new Response("{}", { headers: { "Content-Type": "application/json" } });
    Object.defineProperty(res, "redirected", { value: true });
    Object.defineProperty(res, "url", { value: "https://evil.example/x" });
    return res;
  };
  const r = await loaded(ext()("/x"));
  assert.equal(r.error().type, "security");
});

test("client configuration is immutable: no public setter changes the boundary", async () => {
  const options = { baseURL: "https://api.example.com/v1/" };
  const c = createApi(options);
  assert.ok(Object.isFrozen(c));
  assert.throws(() => (c.baseURL = "https://evil.example/"), TypeError);
  assert.throws(() => (c.post = () => {}), TypeError);
  assert.throws(() => Object.defineProperty(c, "baseURL", { value: "x" }), TypeError);
  options.baseURL = "https://evil.example/";
  stubFetch([json()]);
  await loaded(c("/users"));
  assert.equal(calls[0].url, "https://api.example.com/v1/users");
  assert.equal(c.baseURL, "https://api.example.com/v1/");
  assert.deepEqual(Object.keys(c).sort(), ["baseURL", "delete", "patch", "post", "put"]);
});

test("baseURL is read exactly once (a getter can't swap it later)", async () => {
  let reads = 0;
  const c = createApi({
    get baseURL() {
      return reads++ ? "https://evil.example/" : "https://api.example.com/";
    },
  });
  stubFetch([json()]);
  await loaded(c("/x"));
  await c.post("/y").run({});
  assert.equal(reads, 1);
  assert.ok(calls.every((call) => call.url.startsWith("https://api.example.com/")));
});

// ---- the shared engine through a client ------------------------------------------------------------------

test("secret-looking query keys are refused for clients too — static and reactive", async () => {
  const c = ext();
  for (const query of [{ access_token: "t" }, { apiKey: "k" }, { password: "p" }]) {
    assert.throws(() => c("/callback", { query }), TypeError);
    assert.throws(() => c.post("/callback", { query }), TypeError);
  }
  assert.throws(() => c("/callback?token=abc"), TypeError);
  stubFetch([json()]);
  const r = await loaded(c("/callback", { query: () => ({ access_token: "tok-SECRET" }) }));
  assert.equal(r.error().type, "config");
  assert.ok(!r.error().message.includes("tok-SECRET"));
  assert.equal(calls.length, 0);
});

test("errors stay log-safe: generic message; url is origin + path, never query, fragment or platform text", async () => {
  const reported = [];
  configure({ onError: (e) => reported.push(e) });
  try {
    stubFetch(["network"]);
    const r = await loaded(ext()("/users/:id", { params: { id: 7 }, query: { q: "query-SECRET" } }));
    const e = r.error();
    assert.ok(e instanceof ApiError);
    assert.equal(e.type, "network"); // a CORS refusal looks exactly like this: the browser hides the reason
    assert.equal(e.message, "GET request failed: network error");
    assert.equal(e.url, "https://api.example.com/v1/users/7");
    const dump = JSON.stringify({ m: e.message, ...e, r: reported.map((x) => ({ m: x.message, ...x })) });
    for (const s of ["query-SECRET", "secret-path", "Failed to fetch"]) assert.ok(!dump.includes(s), s);
    stubFetch([status(500)]);
    const m = ext().post("/pay", { idempotencyKey: () => "key-SECRET-1" });
    await m.run({ card: "card-SECRET" });
    assert.equal(m.error().message, "POST request failed: 500");
    assert.ok(!JSON.stringify({ ...m.error(), m: m.error().message }).match(/SECRET/));
  } finally {
    configure({ onError: null });
  }
});

test("problemDetails: same media type, size and field rules for external responses", async () => {
  stubFetch([json({ type: "https://errors.example/limit", title: "Too many", status: 422, detail: "<b>x</b>", extra: "dropped", instance: 7 }, 422, { "Content-Type": "application/problem+json" })]);
  const m = ext().post("/orders", { problemDetails: true });
  await m.run({});
  assert.deepEqual({ ...m.error().problem }, { type: "https://errors.example/limit", title: "Too many", status: 422, detail: "<b>x</b>" });
  stubFetch([() => new Response("x".repeat(70 * 1024), { status: 422, headers: { "Content-Type": "application/problem+json" } })]);
  const big = await loaded(ext()("/x", { problemDetails: true }));
  assert.equal(big.error().problem, null);
  stubFetch([json({ title: "plain json" }, 422)]);
  const plain = await loaded(ext()("/x", { problemDetails: true }));
  assert.equal(plain.error().problem, null);
});

test("GET retries through a client replay the same URL on the same origin; Retry-After keeps its cap", async () => {
  mock.method(Math, "random", () => 0.5);
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  stubFetch([status(503, { "Retry-After": "1" }), "network", json({ ok: 1 })]);
  const r = ext()("/feed", { query: { page: 2 }, retry: 3 });
  for (let i = 0; i < 100 && r.loading(); i++) {
    await settle();
    mock.timers.runAll();
  }
  assert.deepEqual(r.data(), { ok: 1 });
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.url === "https://api.example.com/v1/feed?page=2" && c.init.mode === "cors" && c.init.credentials === "omit"));
  stubFetch([status(429, { "Retry-After": "31" }), json()]);
  const capped = ext()("/feed", { retry: 3 });
  for (let i = 0; i < 20 && capped.loading(); i++) {
    await settle();
    mock.timers.runAll();
  }
  assert.equal(capped.error().status, 429);
  assert.equal(calls.length, 1, "a Retry-After over 30 s ends the retries");
});

test("timeouts through a client: a hung attempt times out and the retry goes to the same URL", async () => {
  mock.method(Math, "random", () => 0.5);
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  stubFetch(["hang", json({ ok: 1 })]);
  const m = ext().post("/slow", { idempotencyKey: true, retry: 1, timeout: 1000 });
  assert.deepEqual(await drive(m.run({ a: 1 })), { ok: 1 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, calls[1].url);
  stubFetch(["hang"]);
  const r = ext()("/slow", { timeout: 500 });
  for (let i = 0; i < 20 && r.loading(); i++) {
    await settle();
    mock.timers.runAll();
  }
  assert.equal(r.error().type, "timeout");
});

test("mutation retries through a client: same method, URL, query, body and key on every attempt", async () => {
  mock.method(Math, "random", () => 0.5);
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  for (const make of ["post", "put", "patch", "delete"]) {
    stubFetch([status(502), "network", json({ ok: true })]);
    const m = ext()[make]("/orders/:id", { query: { v: 2 }, idempotencyKey: true, retry: 2 });
    await drive(m.run(make === "delete" ? { params: { id: 9 } } : { params: { id: 9 }, body: { total: 5 } }));
    assert.equal(m.done(), true, make);
    assert.equal(calls.length, 3);
    assert.equal(new Set(calls.map((c) => `${c.method} ${c.url} ${c.body} ${c.key}`)).size, 1, make);
    assert.equal(calls[0].url, "https://api.example.com/v1/orders/9?v=2");
    assert.match(calls[0].key, /^[0-9a-f-]{36}$/);
  }
});

test("FormData through a client: sent as-is (browser writes the boundary), and retried as the same object", async () => {
  mock.method(Math, "random", () => 0.5);
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  stubFetch([status(503), json({ id: 1 }, 201)]);
  const form = new FormData();
  form.append("file", new File(["bytes"], "a.txt", { type: "text/plain" }));
  const m = ext().post("/uploads", { idempotencyKey: true, retry: 1 });
  assert.deepEqual(await drive(m.run(form)), { id: 1 });
  assert.ok(calls.every((c) => c.body === form && !("Content-Type" in c.init.headers) && c.init.credentials === "omit"));
});

test("invalidation is by reference across boundaries: a client mutation can refresh an api() resource and vice versa", async () => {
  stubFetch([json([])]);
  const local = api("/summary");
  const remote = ext()("/items");
  await loaded(local);
  await loaded(remote);
  const before = calls.length;
  await ext().post("/save", { invalidate: local }).run({});
  await settle();
  assert.equal(calls.slice(before).filter((c) => c.url === "https://app.example.com/summary").length, 1);
  const mid = calls.length;
  await api.post("/sync", { invalidate: remote }).run({});
  await settle();
  assert.equal(calls.slice(mid).filter((c) => c.url === "https://api.example.com/v1/items").length, 1);
  // a URL-matching look-alike is not a target: trust comes from the reference, not the URL
  assert.throws(() => ext().post("/save", { invalidate: { refresh() {}, data() {} } }), TypeError);
  local.dispose();
  remote.dispose();
});

test("exclusive double submit through a client sends once", async () => {
  stubFetch([json({ ok: 1 })]);
  const m = ext().post("/once", { exclusive: true });
  await Promise.all([m.run({}), m.run({})]);
  assert.equal(calls.length, 1);
});

test("no server-side networking: without a page, client requests are refused; `initial` still seeds SSR", async () => {
  const saved = globalThis.location;
  globalThis.location = undefined;
  try {
    stubFetch([json()]);
    const c = ext(); // configuration is still validated
    assert.throws(() => createApi({ baseURL: "http://api.example.com/" }), TypeError);
    const r = await loaded(c("/users"));
    assert.equal(r.error().type, "security");
    assert.match(r.error().message, /only from an http\(s\) page/);
    const m = c.post("/x");
    await m.run({});
    assert.equal(m.error().type, "security");
    const seeded = c("/users", { initial: [{ id: 1 }] });
    assert.deepEqual(seeded.data(), [{ id: 1 }]);
    assert.equal(seeded.loading(), false);
    assert.equal(calls.length, 0);
    seeded.dispose();
    r.dispose();
  } finally {
    globalThis.location = saved;
  }
});

test("client options are the api() options: unknown ones still refused", () => {
  const c = ext();
  assert.throws(() => c("/x", { headers: { Authorization: "Bearer x" } }), /unsupported option "headers"/);
  assert.throws(() => c("/x", { credentials: "include" }), /unsupported option/);
  assert.throws(() => c.post("/x", { headers: {} }), /unsupported option/);
  assert.throws(() => c.post("/x", { retry: 1 }), /retry needs idempotencyKey/);
  assert.throws(() => c("/x", {}, {}), /too many arguments/);
});
