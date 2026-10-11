// Phase 10.1 — createApi() hardening: canonical base URLs, the loopback policy's boundaries,
// segment-aware containment, and invariants that must hold on every attempt of a logical run.

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { configure, createState } from "@zoijs/core";
import { api, createApi } from "../src/index.js";

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
const realFetch = globalThis.fetch;
let calls = [];
function stubFetch(script) {
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    return Promise.resolve().then(() => {
      if (step === "network") throw new TypeError("NetworkError when attempting to fetch resource: https://api.example.com/v1/x?token=raw-SECRET");
      return step(url, init);
    });
  };
}
test.afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
  globalThis.fetch = realFetch;
});
const json = (body = { ok: true }, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const status = (code) => () => new Response("", { status: code });
const loaded = async (r) => {
  for (let i = 0; i < 50 && r.loading(); i++) await settle();
  return r;
};
const ext = () => createApi({ baseURL: "https://api.example.com/v1/" });
const refused = (baseURL, re) =>
  assert.throws(() => createApi({ baseURL }), (e) => e instanceof TypeError && (!re || re.test(e.message)), baseURL);

test("baseURL authority must be canonical: no spelling the parser would silently rewrite", () => {
  for (const baseURL of [
    "https://api%2eexample.com/", "https://%61pi.example.com/", "https://ａｐｉ.example.com/", "https://api。example.com/",
    "https://api．example.com/", "https://bücher.example/", "https://api.example.com:0443/", "https://api.example.com:/",
    "http://127.1/", "http://127.000.000.001/", "http://0x7f.0.0.1/", "http://2130706433/", "http://0177.0.0.1/",
    "http://[::ffff:127.0.0.1]/", "http://[0:0:0:0:0:0:0:1]/",
  ]) refused(baseURL, /canonical form/);
  // Case and the scheme's default port are the only accepted differences.
  assert.equal(createApi({ baseURL: "HTTPS://API.EXAMPLE.COM:443/V1" }).baseURL, "https://api.example.com/V1/");
  assert.equal(createApi({ baseURL: "http://LOCALHOST:80/" }).baseURL, "http://localhost/");
  assert.equal(createApi({ baseURL: "https://[::1]:8443/" }).baseURL, "https://[::1]:8443/");
});

test("loopback http: exact hosts only — look-alikes, unspecified and private addresses need https", () => {
  for (const baseURL of ["http://localhost/", "http://localhost:3000/", "http://app.localhost/", "http://a.b.localhost:1/", "http://127.0.0.1/", "http://127.9.8.7:5/", "http://[::1]/"]) {
    assert.ok(createApi({ baseURL }), baseURL);
  }
  for (const baseURL of ["http://localhost.evil.example/", "http://notlocalhost/", "http://localhostx/", "http://127.0.0.1.evil.example/", "http://127.0.0.1.nip.io/", "http://0.0.0.0/", "http://192.168.1.10/", "http://10.0.0.1/", "http://169.254.169.254/", "http://[::]/", "http://[fe80::1]/"]) {
    refused(baseURL, /https:/);
  }
});

test("containment is segment-aware: a sibling like /v1-evil/ is never inside /v1/", async () => {
  const sent = [];
  stubFetch([(url) => (sent.push(url), json()())]);
  const c = ext();
  for (const path of ["/users", "/v1-evil/", "/v1-evil/x", "/%252e%252e/admin", "/a%2fb", "/a%5cb", "/a%2F..%2Fb", "/%zz", "/50%"]) await loaded(c(path));
  await loaded(c("/users/:id", { params: { id: "../../v2" } }));
  await loaded(c("/search", { query: { path: "../../admin", sep: "a/b\\c%2f" } }));
  for (const u of sent) {
    const url = new URL(u);
    assert.equal(url.origin, "https://api.example.com", u);
    assert.ok(url.pathname.startsWith("/v1/"), u);
  }
  assert.ok(sent.includes("https://api.example.com/v1/v1-evil/"), "a leading / stays under the base");
  assert.ok(sent.includes("https://api.example.com/v1/%252e%252e/admin"), "double-encoded dots stay literal (one decode on the server would give %2e%2e, not ..)");
  assert.ok(sent.includes("https://api.example.com/v1/search?path=..%2F..%2Fadmin&sep=a%2Fb%5Cc%252f"));
  // the base path itself as a sibling-prefix: /v1 vs /v1-evil
  const narrow = createApi({ baseURL: "https://api.example.com/v1" });
  await loaded(narrow("/x"));
  assert.equal(sent.at(-1), "https://api.example.com/v1/x");
  for (const bad of ["/../admin", "/%2e%2e/admin", "/%2E%2E/admin", "/%2e./admin", "/.%2E/admin", "/a/%2e%2e", "\\admin", "/a\\b", "//evil.example", "https://evil.example/", "/x\u0000"]) {
    assert.throws(() => c(bad), TypeError, JSON.stringify(bad));
  }
});

test("every attempt of a logical run keeps method, URL, body, key and the transport policy", async () => {
  mock.method(Math, "random", () => 0.5);
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  stubFetch(["network", status(503), status(429), json()]);
  const form = new FormData();
  form.append("a", "1");
  const m = ext().patch("/items/:id", { query: { v: 1 }, idempotencyKey: () => "run-key-1", retry: 3 });
  const p = m.run({ params: { id: 3 }, body: form });
  for (let i = 0; i < 100 && calls.length < 4; i++) {
    await settle();
    mock.timers.runAll();
  }
  await p;
  assert.equal(calls.length, 4);
  const shape = (c) => JSON.stringify([c.url, c.init.method, c.init.mode, c.init.credentials, c.init.redirect, c.init.referrerPolicy, c.init.headers]);
  assert.equal(new Set(calls.map(shape)).size, 1);
  assert.ok(calls.every((c) => c.init.body === form));
  assert.deepEqual(JSON.parse(shape(calls[0])).slice(0, 6), ["https://api.example.com/v1/items/3?v=1", "PATCH", "cors", "omit", "manual", "strict-origin-when-cross-origin"]);
});

test("a reactive change during a client GET's backoff starts a NEW load; the old retry never fires", async () => {
  mock.method(Math, "random", () => 0.5);
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  stubFetch([status(503), json({ v: 2 })]);
  const q = createState("a");
  const r = ext()("/search", { query: () => ({ q: q.get() }), retry: 3, retryDelay: 1000 });
  await settle();
  assert.equal(calls.length, 1);
  q.set("b");
  await settle();
  await settle();
  mock.timers.runAll();
  await settle();
  assert.deepEqual(calls.map((c) => c.url), ["https://api.example.com/v1/search?q=a", "https://api.example.com/v1/search?q=b"]);
  r.dispose();
});

test("dispose(), refresh() and mutation reset() cancel a client's pending retry", async () => {
  mock.method(Math, "random", () => 0.5);
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  stubFetch([status(503), json()]);
  const r = ext()("/a", { retry: 3, retryDelay: 1000 });
  await settle();
  r.dispose();
  mock.timers.runAll();
  await settle();
  assert.equal(calls.length, 1, "dispose");
  stubFetch([status(503), json()]);
  const r2 = ext()("/b", { retry: 3, retryDelay: 1000 });
  await settle();
  r2.refresh(); // supersedes the waiting load
  await settle();
  mock.timers.runAll();
  await settle();
  assert.equal(calls.length, 2, "refresh replaces the retry, it doesn't add to it");
  r2.dispose();
  stubFetch([status(503), json()]);
  const m = ext().post("/c", { idempotencyKey: true, retry: 3, retryDelay: 1000 });
  m.run({});
  await settle();
  m.reset();
  mock.timers.runAll();
  await settle();
  assert.equal(calls.length, 1, "reset");
});

test("CORS-looking failures: retried within the bound like any network error, same origin, and log-safe", async () => {
  mock.method(Math, "random", () => 0.5);
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  const reported = [];
  configure({ onError: (e, info) => reported.push({ e, info }) });
  try {
    stubFetch(["network"]);
    const r = ext()("/x", { query: { page: "q-SECRET" }, retry: 2 });
    for (let i = 0; i < 50 && r.loading(); i++) {
      await settle();
      mock.timers.runAll();
    }
    assert.equal(calls.length, 3, "bounded: 1 + retry");
    assert.ok(calls.every((c) => c.init.mode === "cors" && c.url.startsWith("https://api.example.com/v1/")), "never no-cors, never another origin");
    const e = r.error();
    assert.equal(e.type, "network");
    assert.equal(e.cause, undefined, "the platform exception isn't attached");
    const dump = JSON.stringify({ m: e.message, s: String(e), stack: e.stack, ...e, r: reported.map((x) => ({ m: x.e.message, ...x.e, info: x.info })) });
    for (const secret of ["q-SECRET", "raw-SECRET", "NetworkError"]) assert.ok(!dump.includes(secret), secret);
    assert.equal(reported.length, 1, "one report per logical load");
  } finally {
    configure({ onError: null });
  }
});

test("immutability: no assignment, defineProperty, prototype swap or options mutation reaches the boundary", async () => {
  const options = { baseURL: "https://api.example.com/v1/" };
  const c = createApi(options);
  assert.throws(() => Object.setPrototypeOf(c, { baseURL: "https://evil.example/" }), TypeError);
  assert.throws(() => Object.defineProperty(c, "post", { value: () => {} }), TypeError);
  assert.throws(() => delete c.baseURL, TypeError);
  assert.equal(Object.getOwnPropertyDescriptor(c, "baseURL").writable, false);
  const saved = Function.prototype.baseURL;
  Function.prototype.baseURL = "https://evil.example/";
  Object.prototype.origin = "https://evil.example";
  Object.prototype.path = "/";
  Object.prototype.href = "https://evil.example/";
  options.baseURL = "https://evil.example/";
  try {
    stubFetch([json()]);
    await loaded(c("/users"));
    await c.post("/users").run({});
    assert.ok(calls.every((x) => x.url.startsWith("https://api.example.com/v1/")));
    assert.equal(c.baseURL, "https://api.example.com/v1/");
  } finally {
    if (saved === undefined) delete Function.prototype.baseURL;
    delete Object.prototype.origin;
    delete Object.prototype.path;
    delete Object.prototype.href;
  }
});

test("no hidden auth state: clients add no headers, and nothing from api() or another client leaks in", async () => {
  stubFetch([json()]);
  await loaded(api("/me"));
  const a = createApi({ baseURL: "https://a.example.com/" });
  await a.post("/x", { idempotencyKey: () => "a-key" }).run({ x: 1 });
  await loaded(createApi({ baseURL: "https://b.example.com/" })("/y"));
  const [, post, get] = calls;
  assert.deepEqual(Object.keys(post.init.headers).sort(), ["Accept", "Content-Type", "Idempotency-Key"]);
  assert.deepEqual(Object.keys(get.init.headers), ["Accept"]);
  assert.equal(get.init.credentials, "omit");
  for (const c of calls) assert.ok(!("Authorization" in c.init.headers) && !("Cookie" in c.init.headers));
});

test("SSR: valid and invalid configuration are validated; initial seeds; refresh and mutations send nothing", async () => {
  const saved = globalThis.location;
  globalThis.location = undefined;
  try {
    stubFetch([json()]);
    const c = createApi({ baseURL: "https://api.example.com/" });
    assert.throws(() => createApi({ baseURL: "https://user:pw@api.example.com/" }), TypeError);
    assert.throws(() => createApi({ baseURL: "https://api.example.com", headers: {} }), TypeError);
    const r = c("/a", { initial: { cached: true } });
    assert.deepEqual(r.data(), { cached: true });
    r.refresh();
    await loaded(r);
    assert.equal(r.error().type, "security");
    assert.deepEqual(r.data(), { cached: true }, "the seed survives a refused refresh");
    for (const make of ["post", "put", "patch", "delete"]) {
      const m = c[make]("/b");
      await m.run(make === "delete" ? undefined : {});
      assert.equal(m.error().type, "security", make);
    }
    assert.equal(calls.length, 0);
    r.dispose();
  } finally {
    globalThis.location = saved;
  }
});

test("0.1.0 behavior of api() is unchanged: same-origin transport, follows redirects, no referrer override", async () => {
  stubFetch([json([])]);
  const users = await loaded(api("/users"));
  await api.post("/users", { invalidate: users }).run({ a: 1 });
  await api.delete("/users/:id").run({ params: { id: 1 } });
  await settle();
  for (const c of calls) {
    assert.equal(c.init.mode, "same-origin");
    assert.equal(c.init.credentials, "same-origin");
    assert.ok(!("redirect" in c.init) && !("referrerPolicy" in c.init));
  }
  assert.deepEqual(calls.map((c) => `${c.init.method} ${c.url}`), ["GET https://app.example.com/users", "POST https://app.example.com/users", "GET https://app.example.com/users", "DELETE https://app.example.com/users/1"]);
  // a same-origin redirect is still followed (the browser's mode "same-origin" refuses cross-origin ones)
  globalThis.fetch = async () => Object.defineProperties(new Response("[1]", { headers: { "Content-Type": "application/json" } }), { redirected: { value: true }, url: { value: "https://app.example.com/moved" } });
  assert.deepEqual((await loaded(api("/old"))).data(), [1]);
});
