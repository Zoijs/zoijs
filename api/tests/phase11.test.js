// Phase 11 — Bearer authentication for createApi() clients: an optional `auth` provider, asked once
// per logical request, whose token is validated, sent only to the client's origin, reused by that
// request's retries, and never exposed.

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { configure, createState, mount, html } from "@zoijs/core";
import { api, createApi, ApiError } from "../src/index.js";

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
const realFetch = globalThis.fetch;
let calls = [];
function stubFetch(script) {
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init, auth: init.headers.Authorization, key: init.headers["Idempotency-Key"] });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    return Promise.resolve().then(() => {
      if (step === "network") throw new TypeError("Failed to fetch");
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
const status = (code) => () => new Response("", { status: code });
const loaded = async (r) => {
  for (let i = 0; i < 50 && r.loading(); i++) await settle();
  return r;
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
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
const BASE = "https://api.example.com/v1/";
const withAuth = (auth) => createApi({ baseURL: BASE, auth });
const fakeTimers = () => {
  mock.method(Math, "random", () => 0.5);
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
};

// ---- configuration --------------------------------------------------------------------------------

test("auth is optional: without it (or with auth: undefined) no Authorization header is sent", async () => {
  stubFetch([json()]);
  await loaded(createApi({ baseURL: BASE })("/a"));
  await loaded(createApi({ baseURL: BASE, auth: undefined })("/b"));
  await createApi({ baseURL: BASE }).post("/c").run({});
  assert.equal(calls.length, 3);
  for (const c of calls) assert.equal("Authorization" in c.init.headers, false);
});

test("auth must be a function — a token string, object or anything else is refused without echoing it", () => {
  for (const auth of ["tok-SECRET-1", 42, { token: "tok-SECRET-2" }, null, true, ["tok-SECRET-3"]]) {
    assert.throws(() => createApi({ baseURL: BASE, auth }), (e) => e instanceof TypeError && /auth must be a function/.test(e.message) && !e.message.includes("SECRET"));
  }
  assert.throws(() => createApi({ baseURL: BASE, headers: { Authorization: "Bearer x" } }), /unsupported option "headers"/);
  assert.throws(() => createApi({ baseURL: BASE, token: "x" }), /unsupported option "token"/);
});

test("the provider is never called at construction, or when creating resources and mutations", () => {
  let n = 0;
  const c = withAuth(() => (n++, "t"));
  c.post("/x");
  c.delete("/x/:id");
  assert.equal(n, 0);
});

// ---- the header -----------------------------------------------------------------------------------

test("sync and async providers: Authorization: Bearer <token>, built by Zoijs, alongside the existing headers", async () => {
  stubFetch([json()]);
  await loaded(withAuth(() => "abc.DEF-123_~+/xyz==")("/me"));
  await loaded(withAuth(async () => "async-token")("/me"));
  await withAuth(() => "t1").post("/orders", { idempotencyKey: () => "key-1" }).run({ a: 1 });
  const form = new FormData();
  form.append("f", "v");
  await withAuth(() => "t2").put("/files/:id").run({ params: { id: 1 }, body: form });
  assert.deepEqual(calls.map((c) => c.auth), ["Bearer abc.DEF-123_~+/xyz==", "Bearer async-token", "Bearer t1", "Bearer t2"]);
  assert.deepEqual(Object.keys(calls[0].init.headers).sort(), ["Accept", "Authorization"]);
  assert.deepEqual(Object.keys(calls[2].init.headers).sort(), ["Accept", "Authorization", "Content-Type", "Idempotency-Key"]);
  assert.equal(calls[2].init.headers["Content-Type"], "application/json");
  assert.equal("Content-Type" in calls[3].init.headers, false, "FormData: the browser writes the multipart boundary");
  for (const c of calls) {
    assert.equal(c.init.credentials, "omit");
    assert.equal(c.init.redirect, "manual");
    assert.equal(c.init.mode, "cors");
  }
});

test("null / undefined → anonymous request (not an error); an empty string is invalid", async () => {
  stubFetch([json()]);
  const a = await loaded(withAuth(() => null)("/a"));
  const b = await loaded(withAuth(async () => undefined)("/b"));
  assert.equal(a.error(), null);
  assert.equal(b.error(), null);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => !("Authorization" in c.init.headers)));
  const empty = await loaded(withAuth(() => "")("/c"));
  assert.equal(empty.error().type, "auth");
  assert.equal(calls.length, 2, "never sent");
});

test("malformed tokens fail before fetch(), as type auth, and are never echoed", async () => {
  const bad = [
    "tok-SECRET\r\nX-Injected: yes", "tok-SECRET\nInjected", "tok-SECRET\u0000value", "Bearer tok-SECRET", "tok SECRET with spaces",
    " tok-SECRET", "tok-SECRET ", "tok-SECRET\t", "tok-SECRET\u007f", "tök-SECRET", "tok-SECRET✓", "tok-SECRET,x", "tok-SECRET;x", "tok=SECRET",
    "=tok-SECRET", "tok-SECRET\"", "a".repeat(8193) + "SECRET",
  ];
  const odd = [42, { token: "tok-SECRET" }, ["tok-SECRET"], true, 0n, Symbol("tok-SECRET"), () => "tok-SECRET"];
  const reported = [];
  configure({ onError: (e, info) => reported.push({ e, info }) });
  try {
    stubFetch([json()]);
    for (const value of [...bad, ...odd]) {
      const r = await loaded(withAuth(() => value)("/me"));
      const e = r.error();
      assert.ok(e instanceof ApiError, String(value).slice(0, 30));
      assert.equal(e.type, "auth");
      assert.match(e.message, /^GET request not sent: the auth provider returned an invalid token/);
      const m = withAuth(async () => value).post("/x");
      await m.run({});
      assert.equal(m.error().type, "auth");
    }
    assert.equal(calls.length, 0, "no invalid token ever reached fetch()");
    const dump = JSON.stringify(reported.map(({ e, info }) => ({ m: e.message, s: e.stack, ...e, info })));
    assert.ok(!dump.includes("SECRET"));
    assert.ok(reported.every(({ e }) => e.cause === undefined));
  } finally {
    configure({ onError: null });
  }
});

test("token length: 8192 characters are accepted, 8193 refused", async () => {
  stubFetch([json()]);
  await loaded(withAuth(() => "a".repeat(8192))("/ok"));
  assert.equal(calls.length, 1);
  const r = await loaded(withAuth(() => "a".repeat(8193))("/no"));
  assert.equal(r.error().type, "auth");
  assert.equal(calls.length, 1);
});

test("a provider that throws or rejects: type auth, generic message, no cause, no fetch, no retry", async () => {
  fakeTimers();
  const reported = [];
  configure({ onError: (e) => reported.push(e) });
  try {
    stubFetch([json()]);
    let n = 0;
    const sync = withAuth(() => {
      n++;
      throw new Error("internal-SECRET token=abc");
    });
    const r = sync("/me", { retry: 3 });
    for (let i = 0; i < 20 && r.loading(); i++) {
      await settle();
      mock.timers.runAll();
    }
    assert.equal(r.error().type, "auth");
    assert.equal(r.error().message, "GET request not sent: the auth provider failed");
    assert.equal(r.error().url, "https://api.example.com/v1/me");
    assert.equal(n, 1, "not retried");
    const m = withAuth(() => Promise.reject(new Error("reject-SECRET"))).post("/x", { idempotencyKey: true, retry: 3 });
    await drive(m.run({}));
    assert.equal(m.error().type, "auth");
    assert.equal(m.attempt(), 0, "no attempt was made");
    assert.equal(calls.length, 0);
    const dump = JSON.stringify(reported.map((e) => ({ m: e.message, s: e.stack, c: String(e.cause), ...e })));
    assert.ok(!dump.includes("SECRET"));
    assert.ok(reported.every((e) => e.cause === undefined && e.type === "auth"));
  } finally {
    configure({ onError: null });
  }
});

// ---- invocation timing -------------------------------------------------------------------------------

test("GET: one provider call per logical load; all its retries reuse that token; refresh() asks again", async () => {
  fakeTimers();
  let current = "first";
  let n = 0;
  const c = withAuth(() => (n++, current));
  stubFetch([status(503), "network", json({ v: 1 })]);
  const r = c("/users", { retry: 2 });
  for (let i = 0; i < 100 && r.loading(); i++) {
    await settle();
    mock.timers.runAll();
  }
  assert.deepEqual(r.data(), { v: 1 });
  assert.equal(n, 1);
  assert.deepEqual(calls.map((x) => x.auth), ["Bearer first", "Bearer first", "Bearer first"]);
  current = "second";
  stubFetch([json({ v: 2 })]);
  r.refresh();
  await settle();
  for (let i = 0; i < 20 && r.loading(); i++) await settle();
  assert.equal(n, 2);
  assert.deepEqual(calls.map((x) => x.auth), ["Bearer second"]);
  r.dispose();
});

test("reactive change: a new logical load gets a fresh token snapshot", async () => {
  let token = "t-a";
  const q = createState("a");
  stubFetch([json()]);
  const r = withAuth(() => token)("/search", { query: () => ({ q: q.get() }) });
  await loaded(r);
  token = "t-b";
  q.set("b");
  await settle();
  await loaded(r);
  assert.deepEqual(calls.map((x) => [x.url, x.auth]), [
    ["https://api.example.com/v1/search?q=a", "Bearer t-a"],
    ["https://api.example.com/v1/search?q=b", "Bearer t-b"],
  ]);
  r.dispose();
});

test("mutations: one provider call per run(); retries reuse token AND idempotency key; the next run asks again", async () => {
  fakeTimers();
  let i = 0;
  const c = withAuth(() => `tok-${++i}`);
  for (const make of ["post", "put", "patch", "delete"]) {
    stubFetch([status(502), "network", json()]);
    const m = c[make]("/orders/:id", { idempotencyKey: true, retry: 2 });
    const before = i;
    await drive(m.run(make === "delete" ? { params: { id: 1 } } : { params: { id: 1 }, body: { n: 1 } }));
    assert.equal(i, before + 1, make);
    assert.equal(calls.length, 3);
    assert.equal(new Set(calls.map((x) => `${x.auth}|${x.key}|${x.url}|${x.init.method}|${x.init.body}`)).size, 1, make);
    assert.equal(m.attempt(), 3);
  }
  stubFetch([json()]);
  const m = c.post("/again");
  await m.run({});
  await m.run({});
  assert.deepEqual(calls.map((x) => x.auth), [`Bearer tok-${i - 1}`, `Bearer tok-${i}`]);
});

test("exclusive: a joined run() doesn't call the provider again, and sends once", async () => {
  let n = 0;
  const gate = deferred();
  const c = withAuth(() => (n++, gate.promise));
  stubFetch([json({ ok: 1 })]);
  const m = c.post("/once", { exclusive: true });
  const a = m.run({});
  const b = m.run({});
  gate.resolve("tok");
  await Promise.all([a, b]);
  assert.equal(n, 1);
  assert.equal(calls.length, 1);
});

test("401 and 403 are ordinary HTTP errors: not retried, no provider re-call, no refresh", async () => {
  fakeTimers();
  for (const code of [401, 403]) {
    let n = 0;
    stubFetch([status(code), json()]);
    const r = withAuth(() => (n++, "tok"))("/me", { retry: 3 });
    for (let i = 0; i < 20 && r.loading(); i++) {
      await settle();
      mock.timers.runAll();
    }
    assert.equal(r.error().type, "http");
    assert.equal(r.error().status, code);
    assert.equal(calls.length, 1);
    assert.equal(n, 1);
    stubFetch([status(code), json()]);
    const m = withAuth(() => "tok").post("/x", { idempotencyKey: true, retry: 3 });
    await drive(m.run({}));
    assert.equal(m.error().status, code);
    assert.equal(calls.length, 1);
  }
});

// ---- cancellation while the provider is pending --------------------------------------------------------

test("superseded GET: the old provider resolves late and its request is never sent; the new one uses its own token", async () => {
  const gates = [];
  const c = withAuth(() => {
    const g = deferred();
    gates.push(g);
    return g.promise;
  });
  const id = createState(1);
  stubFetch([json()]);
  const r = c("/users/:id", { params: () => ({ id: id.get() }) });
  await settle();
  assert.equal(gates.length, 1);
  assert.equal(r.loading(), true, "loading while the provider is pending");
  id.set(2);
  await settle();
  assert.equal(gates.length, 2);
  gates[1].resolve("new-token");
  await settle();
  gates[0].resolve("old-token"); // resolves after it was superseded
  await settle();
  await loaded(r);
  assert.deepEqual(calls.map((x) => [x.url, x.auth]), [["https://api.example.com/v1/users/2", "Bearer new-token"]]);
  assert.equal(r.error(), null);
  r.dispose();
});

test("refresh(), dispose() and unmount during provider resolution: no stale request", async () => {
  const gates = [];
  const c = withAuth(() => {
    const g = deferred();
    gates.push(g);
    return g.promise;
  });
  stubFetch([json({ fresh: true })]);
  const r = c("/a");
  await settle();
  r.refresh();
  await settle();
  gates[0].resolve("stale");
  gates[1].resolve("fresh");
  await loaded(r);
  assert.deepEqual(calls.map((x) => x.auth), ["Bearer fresh"]);
  calls.length = 0;
  const d = c("/b");
  await settle();
  d.dispose();
  gates[2].resolve("late");
  await settle();
  assert.equal(calls.length, 0, "dispose");
  assert.equal(d.loading(), false);
  let owned;
  const unmount = mount(() => {
    owned = c("/c");
    return html`<p></p>`;
  }, document.createElement("div"));
  await settle();
  unmount();
  gates[3].resolve("late");
  await settle();
  assert.equal(calls.length, 0, "unmount");
  assert.ok(owned);
});

test("mutation reset() or unmount while the provider is pending: nothing is sent, no error reported", async () => {
  const reported = [];
  configure({ onError: (e) => reported.push(e) });
  try {
    const gates = [];
    const c = withAuth(() => {
      const g = deferred();
      gates.push(g);
      return g.promise;
    });
    stubFetch([json()]);
    const m = c.post("/x", { idempotencyKey: true, retry: 2 });
    const p = m.run({ a: 1 });
    await settle();
    assert.equal(m.pending(), true, "pending while the provider is pending");
    m.reset();
    gates[0].resolve("late");
    await p;
    await settle();
    assert.equal(calls.length, 0, "reset");
    assert.equal(m.pending(), false);
    assert.equal(m.error(), null);
    let owned;
    const unmount = mount(() => {
      owned = c.post("/y");
      return html`<p></p>`;
    }, document.createElement("div"));
    owned.run({});
    await settle();
    unmount();
    gates[1].resolve("late");
    await settle();
    assert.equal(calls.length, 0, "unmount");
    assert.deepEqual(reported, []);
  } finally {
    configure({ onError: null });
  }
});

test("a newer non-exclusive run doesn't cancel an older run's first request (unchanged semantics), only its retries", async () => {
  fakeTimers();
  const gates = [];
  const c = withAuth(() => {
    const g = deferred();
    gates.push(g);
    return g.promise;
  });
  stubFetch([status(503), json({ second: true })]);
  const m = c.post("/x", { idempotencyKey: true, retry: 3 });
  m.run({ n: 1 });
  m.run({ n: 2 });
  await settle();
  gates[0].resolve("t1");
  await settle();
  gates[1].resolve("t2");
  for (let i = 0; i < 30; i++) {
    await settle();
    mock.timers.runAll();
  }
  assert.deepEqual(calls.map((x) => [x.auth, x.init.body]), [["Bearer t1", '{"n":1}'], ["Bearer t2", '{"n":2}']], "the first run's 503 isn't retried once superseded");
});

// ---- isolation, leakage, SSR, immutability ----------------------------------------------------------

test("clients never share tokens; api() never sends one", async () => {
  stubFetch([json()]);
  const billing = createApi({ baseURL: "https://billing.example.com/", auth: () => "billing-token" });
  const analytics = createApi({ baseURL: "https://analytics.example.com/", auth: () => "analytics-token" });
  const anon = createApi({ baseURL: "https://public.example.com/" });
  await loaded(billing("/a"));
  await loaded(analytics("/b"));
  await loaded(anon("/c"));
  await loaded(api("/d"));
  await api.post("/e").run({});
  assert.deepEqual(calls.map((x) => [new URL(x.url).origin, x.auth ?? null]), [
    ["https://billing.example.com", "Bearer billing-token"],
    ["https://analytics.example.com", "Bearer analytics-token"],
    ["https://public.example.com", null],
    ["https://app.example.com", null],
    ["https://app.example.com", null],
  ]);
  assert.equal(calls[3].init.credentials, "same-origin", "api() unchanged");
});

test("a request that can't be sent never asks for a token: escapes, secret query keys, and refused URLs", async () => {
  let n = 0;
  const c = withAuth(() => (n++, "tok"));
  assert.throws(() => c("https://evil.example/x"), TypeError);
  assert.throws(() => c("/../admin"), TypeError);
  assert.throws(() => c("/x", { query: { access_token: "a" } }), TypeError);
  stubFetch([json()]);
  const r = await loaded(c("/x", { query: () => ({ token: "a" }) }));
  assert.equal(r.error().type, "config");
  assert.equal(n, 0);
  assert.equal(calls.length, 0);
});

test("redirects never carry the token anywhere: terminal security errors, no retry, no re-auth", async () => {
  fakeTimers();
  const opaque = () => ({ type: "opaqueredirect", status: 0, ok: false, redirected: false, url: "", headers: new Headers(), body: null });
  for (const step of [opaque, status(301), status(302), status(303), status(307), status(308)]) {
    let n = 0;
    stubFetch([step, step, json()]); // a retry (or a followed redirect) would show up as a third call
    const c = withAuth(() => (n++, "tok"));
    const r = c("/moved", { retry: 3 });
    for (let i = 0; i < 20 && r.loading(); i++) {
      await settle();
      mock.timers.runAll();
    }
    assert.equal(r.error().type, "security");
    const m = c.post("/moved", { idempotencyKey: true, retry: 3 });
    await drive(m.run({}));
    assert.equal(m.error().type, "security");
    assert.equal(calls.length, 2, "one request each, never followed or retried");
    assert.equal(n, 2);
    assert.ok(calls.every((x) => x.init.redirect === "manual"));
  }
});

test("the token appears on no public surface: errors, problem details, retry status, resource or mutation state", async () => {
  fakeTimers();
  const T = "tok-MARKER-9f3a";
  const reported = [];
  configure({ onError: (e, info) => reported.push({ e, info }) });
  try {
    const c = withAuth(() => T);
    stubFetch([json({ type: "about:blank", title: "Bearer " + T, detail: T, status: 422 }, 422, { "Content-Type": "application/problem+json" })]);
    const m = c.post("/x", { problemDetails: true });
    await m.run({});
    stubFetch(["network"]);
    const r = c("/y", { retry: 1 });
    for (let i = 0; i < 20 && r.loading(); i++) {
      await settle();
      mock.timers.runAll();
    }
    stubFetch(["hang"]);
    const t = c("/z", { timeout: 100 });
    for (let i = 0; i < 20 && t.loading(); i++) {
      await settle();
      mock.timers.runAll();
    }
    stubFetch([status(401)]);
    const u = await loaded(c("/w"));
    const surfaces = [m.error(), r.error(), t.error(), u.error()];
    const own = (e) => ({ m: e.message, s: e.stack, str: String(e), json: JSON.stringify({ ...e, problem: undefined }), cause: e.cause === undefined ? "none" : String(e.cause), ...e, problem: undefined });
    const dump = JSON.stringify({ surfaces: surfaces.map(own), reported: reported.map(({ e, info }) => ({ ...own(e), info })), state: [m.attempt(), m.retrying(), m.result(), r.data(), t.data(), u.data()] });
    assert.ok(!dump.includes(T), "token found on a library surface");
    // Phase 12: a server that echoes the token back has it redacted from problem details too.
    assert.equal(m.error().problem.detail, "[redacted]");
    assert.equal(m.error().problem.title, "Bearer [redacted]");
    assert.equal(Object.keys(c).includes("auth") || Object.keys(c).includes("token"), false);
    assert.equal(c.auth, undefined);
    assert.equal(c.token, undefined);
  } finally {
    configure({ onError: null });
  }
});

test("SSR: an authenticated client validates without calling the provider; requests are refused before it", async () => {
  const saved = globalThis.location;
  globalThis.location = undefined;
  try {
    let n = 0;
    stubFetch([json()]);
    const c = createApi({ baseURL: BASE, auth: () => (n++, "tok") });
    assert.throws(() => createApi({ baseURL: BASE, auth: "tok" }), TypeError);
    const seeded = c("/a", { initial: [1] });
    assert.deepEqual(seeded.data(), [1]);
    seeded.refresh();
    await loaded(seeded);
    assert.equal(seeded.error().type, "security");
    const m = c.post("/b");
    await m.run({});
    assert.equal(m.error().type, "security");
    assert.equal(n, 0, "the provider never ran");
    assert.equal(calls.length, 0);
    seeded.dispose();
  } finally {
    globalThis.location = saved;
  }
});

test("immutability: the provider is private and fixed at creation", async () => {
  const options = { baseURL: BASE, auth: () => "original" };
  const c = createApi(options);
  options.auth = () => "swapped";
  assert.throws(() => (c.auth = () => "evil"), TypeError);
  assert.throws(() => Object.defineProperty(c, "auth", { value: () => "evil" }), TypeError);
  stubFetch([json()]);
  await loaded(c("/x"));
  assert.equal(calls[0].auth, "Bearer original");
  // the provider may read changing application state — that's how new requests get new tokens
  let session = "s1";
  const live = createApi({ baseURL: BASE, auth: () => session });
  await loaded(live("/1"));
  session = "s2";
  await loaded(live("/2"));
  assert.deepEqual(calls.slice(1).map((x) => x.auth), ["Bearer s1", "Bearer s2"]);
});

test("the provider is called with one frozen { signal } argument and no `this` (Phase 12)", async () => {
  let seen;
  stubFetch([json()]);
  await loaded(createApi({ baseURL: BASE, auth: function (...args) { seen = { args, self: this }; return "t"; } })("/x"));
  assert.equal(seen.args.length, 1);
  assert.deepEqual(Object.keys(seen.args[0]), ["signal"]);
  assert.ok(seen.args[0].signal instanceof AbortSignal);
  assert.ok(Object.isFrozen(seen.args[0]));
  assert.ok(seen.self === undefined || typeof seen.self === "object"); // never the client or options
  assert.notEqual(seen.self?.baseURL, BASE);
});
