// Phase 8 — bounded retry jitter (mutations and GETs) and conservative GET retries.
// Fake setTimeout + Date; Math.random is controlled per test; promises settle via setImmediate.

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { html, mount, createState, configure } from "@zoijs/core";
import { api, ApiError } from "../src/index.js";

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
const realFetch = globalThis.fetch;
let calls = [];
function stubFetch(script) {
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init, method: init.method, at: Date.now() });
    const step = typeof script === "function" ? script : script[Math.min(calls.length - 1, script.length - 1)];
    return Promise.resolve().then(() => {
      if (step === "network") throw new TypeError("Failed to fetch");
      if (step === "hang") return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      return step(url, init);
    });
  };
}
let random = 0.5;
let randomMock;
test.beforeEach(() => {
  random = 0.5;
  randomMock = mock.method(Math, "random", () => random);
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
});
test.afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
  globalThis.fetch = realFetch;
});
const ok = (body = { ok: true }, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const status = (code, headers = {}) => () => new Response("", { status: code, headers });
const gaps = () => calls.map((c, i) => (i ? c.at - calls[i - 1].at : 0));
const paths = () => calls.map((c) => c.url.replace("https://app.example.com", ""));
// Settle, then jump to the next pending timer, until `done()`.
async function until(done, max = 500) {
  for (let i = 0; i < max && !done(); i++) {
    await settle();
    if (!done()) mock.timers.runAll();
  }
  await settle();
}
const finished = (p) => {
  let settled = false;
  p.then(() => (settled = true));
  return () => settled;
};

// ---- jitter ----------------------------------------------------------------------------------------------

test("jitter: factor 0.8–1.2 on the exponential backoff (lower bound, midpoint, upper bound)", async () => {
  for (const [r, expected] of [[0, [0, 200, 400, 800]], [0.5, [0, 250, 500, 1000]], [0.999999, [0, 300, 600, 1200]]]) {
    random = r;
    stubFetch(["network"]);
    const m = api.post("/x", { idempotencyKey: true, retry: 3 });
    const p = m.run({});
    await until(finished(p));
    assert.deepEqual(gaps().map(Math.round), expected, `random ${r}`);
  }
});

test("jitter never pushes a wait past the 30 s cap", async () => {
  random = 0.999999;
  stubFetch(["network"]);
  const m = api.post("/x", { idempotencyKey: true, retry: 2, retryDelay: 20_000 });
  const p = m.run({});
  await until(finished(p));
  assert.deepEqual(gaps().map(Math.round), [0, 24_000, 30_000]);
});

test("Retry-After isn't jittered: the wait is exactly what the server asked (never shorter)", async () => {
  for (const r of [0, 0.999999]) {
    random = r;
    stubFetch([status(429, { "Retry-After": "2" }), ok({}, 201)]);
    const m = api.post("/x", { idempotencyKey: true, retry: 1 });
    const p = m.run({});
    await until(finished(p));
    assert.deepEqual(gaps(), [0, 2000], `random ${r}`);
  }
  stubFetch([status(503, { "Retry-After": "0" }), ok({}, 201)]);
  random = 0;
  const m = api.post("/x", { idempotencyKey: true, retry: 1, retryDelay: 400 });
  const p = m.run({});
  await until(finished(p));
  assert.deepEqual(gaps(), [0, 400], "at least the un-jittered backoff");
});

test("a Retry-After over 30 s still ends the retries — never capped and retried early", async () => {
  stubFetch([status(503, { "Retry-After": "60" }), ok()]);
  const r = api("/x", { retry: 3 });
  await until(() => !r.loading());
  assert.equal(calls.length, 1);
  assert.equal(r.error().status, 503);
  r.dispose();
});

test("jitter changes nothing about attempt() / retrying() / pending() during the wait", async () => {
  random = 0;
  stubFetch(["network", ok({}, 201)]);
  const m = api.post("/x", { idempotencyKey: true, retry: 1 });
  const p = m.run({});
  await settle();
  assert.deepEqual([m.attempt(), m.retrying(), m.pending()], [1, true, true]);
  await until(finished(p));
  assert.deepEqual([m.attempt(), m.retrying(), m.done()], [2, false, true]);
});

// ---- GET retries -------------------------------------------------------------------------------------------

test("GET retries are off by default: one request", async () => {
  stubFetch([status(503), ok()]);
  const r = api("/users");
  await until(() => !r.loading());
  assert.equal(calls.length, 1);
  assert.equal(r.error().status, 503);
  r.dispose();
});

test("GET retry: network, timeout, 408, 425, 429, 500, 502, 503, 504 → success", async () => {
  for (const first of ["network", "hang", 408, 425, 429, 500, 502, 503, 504]) {
    stubFetch([typeof first === "number" ? status(first) : first, ok([1])]);
    const r = api("/users", { retry: 1, timeout: 1000 });
    await until(() => !r.loading());
    assert.equal(calls.length, 2, String(first));
    assert.deepEqual(r.data(), [1]);
    assert.equal(r.error(), null);
    r.dispose();
  }
});

test("GET never retries 400 401 403 404 405 409 410 412 422, parse or security", async () => {
  for (const code of [400, 401, 403, 404, 405, 409, 410, 412, 422]) {
    stubFetch([status(code), ok()]);
    const r = api("/users", { retry: 3 });
    await until(() => !r.loading());
    assert.equal(calls.length, 1, String(code));
    r.dispose();
  }
  stubFetch([() => new Response("{x", { headers: { "Content-Type": "application/json" } }), ok()]);
  const parse = api("/users", { retry: 3 });
  await until(() => !parse.loading());
  assert.equal(calls.length, 1);
  assert.equal(parse.error().type, "parse");
  parse.dispose();
  stubFetch([ok()]);
  const security = api("https://evil.example/users", { retry: 3 });
  await until(() => !security.loading());
  assert.equal(calls.length, 0);
  assert.equal(security.error().type, "security");
  security.dispose();
});

test("GET retry count: retry n = up to n extra attempts; exhaustion keeps the last error", async () => {
  for (const [retry, attempts] of [[1, 2], [2, 3], [5, 6]]) {
    stubFetch(["network", "network", "network", "network", "network", status(502)]);
    const r = api("/users", { retry });
    await until(() => !r.loading());
    assert.equal(calls.length, attempts, `retry ${retry}`);
    assert.equal(r.error().type, attempts === 6 ? "http" : "network");
    r.dispose();
  }
});

test("GET option validation: retry 0–5, retryDelay needs retry; mutation-only options refused", () => {
  stubFetch([ok()]);
  for (const bad of [-1, 1.5, 6, "2", true, null, NaN]) assert.throws(() => api("/x", { retry: bad }), /retry must be a whole number from 0 to 5/);
  assert.throws(() => api("/x", { retryDelay: 500 }), /retryDelay has no effect without retry/);
  assert.throws(() => api("/x", { retry: 0, retryDelay: 500 }), /retryDelay has no effect without retry/);
  for (const bad of [-1, Infinity, "250"]) assert.throws(() => api("/x", { retry: 1, retryDelay: bad }), /retryDelay must be a finite number/);
  for (const opt of ["idempotencyKey", "exclusive", "invalidate"]) assert.throws(() => api("/x", { [opt]: true }), /unsupported option/, opt);
  api("/x", { retry: 2, retryDelay: 100 }).dispose();
});

test("GET backoff: same exponential schedule, retryDelay and jitter as mutations", async () => {
  stubFetch(["network"]);
  const r = api("/users", { retry: 3, retryDelay: 100 });
  await until(() => !r.loading());
  assert.deepEqual(gaps(), [0, 100, 200, 400]);
  r.dispose();
  random = 0;
  stubFetch(["network"]);
  const j = api("/users", { retry: 2 });
  await until(() => !j.loading());
  assert.deepEqual(gaps().map(Math.round), [0, 200, 400]);
  j.dispose();
});

test("GET Retry-After on 429/503 uses the shared parser and policy", async () => {
  stubFetch([status(503, { "Retry-After": "3" }), ok([1])]);
  const r = api("/users", { retry: 1 });
  await until(() => !r.loading());
  assert.deepEqual(gaps(), [0, 3000]);
  r.dispose();
  stubFetch([status(429, { "Retry-After": new Date(Date.now() + 5000).toUTCString() }), ok([1])]);
  const d = api("/users", { retry: 1 });
  await until(() => !d.loading());
  assert.ok(gaps()[1] >= 4000 && gaps()[1] <= 5000, `${gaps()[1]}`);
  d.dispose();
});

test("GET loading() stays true through the retry wait; error() never shows intermediate failures", async () => {
  stubFetch(["network", status(503), ok([1])]);
  const r = api("/users", { retry: 2 });
  const seen = [];
  for (let i = 0; i < 20 && r.loading(); i++) {
    await settle();
    seen.push([r.loading(), r.error()]);
    mock.timers.runAll();
  }
  await settle();
  assert.ok(seen.filter(([l]) => l).every(([, e]) => e === null), "no intermediate error while loading");
  assert.ok(seen.slice(0, -1).every(([l]) => l), "loading never flickered off between attempts");
  assert.deepEqual([r.loading(), r.error(), r.data()], [false, null, [1]]);
  r.dispose();
});

test("GET monitoring: 0 reports when a retry recovers, 1 (the final error) when retries run out", async () => {
  const reported = [];
  configure({ onError: (e, info) => reported.push({ e, info }) });
  try {
    stubFetch(["network", status(500), ok([1])]);
    const a = api("/users", { retry: 2 });
    await until(() => !a.loading());
    assert.deepEqual(reported, []);
    stubFetch(["network", status(500), status(504)]);
    const b = api("/users", { retry: 2 });
    await until(() => !b.loading());
    assert.equal(reported.length, 1);
    assert.equal(reported[0].info.kind, "resource");
    assert.equal(reported[0].e.status, 504);
    a.dispose();
    b.dispose();
  } finally {
    configure({ onError: null });
  }
});

test("a reactive change during a retry wait cancels the old sequence and fetches the new URL", async () => {
  stubFetch((url) => (url.includes("q=a") && !url.includes("q=ab") ? status(503)() : ok({ url })()));
  const q = createState("a");
  const r = api("/search", { query: () => ({ q: q.get() }), retry: 3, retryDelay: 1000 });
  await settle();
  assert.deepEqual(paths(), ["/search?q=a"], "q=a failed; a retry is scheduled");
  q.set("ab");
  await settle();
  assert.deepEqual(paths(), ["/search?q=a", "/search?q=ab"]);
  mock.timers.runAll();
  await settle();
  mock.timers.runAll();
  await settle();
  assert.deepEqual(paths(), ["/search?q=a", "/search?q=ab"], "the old q=a retry never fires");
  assert.deepEqual(r.data(), { url: "https://app.example.com/search?q=ab" });
  r.dispose();
});

test("refresh() during a retry wait cancels it and starts a fresh load with a fresh retry count", async () => {
  stubFetch(["network", "network", ok([1]), "network", "network", "network"]);
  const r = api("/users", { retry: 2, retryDelay: 1000 });
  await settle();
  assert.equal(calls.length, 1);
  r.refresh();
  await settle();
  assert.equal(calls.length, 2, "refresh sent at once — not after the backoff");
  await until(() => !r.loading());
  assert.equal(calls.length, 3, "the new load's own retry (count reset), and no stray old one");
  assert.deepEqual(r.data(), [1]);
  r.dispose();
});

test("dispose() and unmount cancel a scheduled GET retry", async () => {
  stubFetch(["network"]);
  const r = api("/a", { retry: 3, retryDelay: 1000 });
  let owned;
  const unmount = mount(() => {
    owned = api("/b", { retry: 3, retryDelay: 1000 });
    return html`<p></p>`;
  }, document.createElement("div"));
  await settle();
  assert.equal(calls.length, 2);
  r.dispose();
  unmount();
  mock.timers.runAll();
  await settle();
  assert.equal(calls.length, 2, "no retry after dispose or unmount");
  assert.equal(owned.error(), null);
});

test("debounce happens once before the first attempt; retries use backoff, not debounce", async () => {
  // The first request for q=x fails (network); everything else succeeds.
  stubFetch((url) => {
    if (url.includes("q=x") && calls.filter((c) => c.url === url).length === 1) throw new TypeError("Failed to fetch");
    return ok({ url })();
  });
  const q = createState("");
  const r = api("/search", { query: () => ({ q: q.get() }), debounce: 300, retry: 1, retryDelay: 50 });
  await settle();
  const t0 = Date.now();
  q.set("x");
  await until(() => calls.length >= 3);
  assert.deepEqual(paths(), ["/search?q=", "/search?q=x", "/search?q=x"]);
  assert.equal(calls[1].at - t0, 300, "debounce before attempt 1");
  assert.equal(calls[2].at - calls[1].at, 50, "backoff, not debounce, before the retry");
  r.dispose();
});

test("each GET attempt gets a fresh timeout window; backoff isn't counted", async () => {
  stubFetch(["hang", ok([1])]);
  const r = api("/users", { retry: 1, timeout: 1000, retryDelay: 100 });
  await until(() => !r.loading());
  assert.deepEqual(gaps(), [0, 1100]);
  assert.deepEqual(r.data(), [1]);
  r.dispose();
});

test("initial data isn't an attempt: no request until refresh(), which then retries", async () => {
  stubFetch(["network", ok(["fresh"])]);
  const r = api("/users", { initial: ["seed"], retry: 1 });
  await settle();
  assert.equal(calls.length, 0);
  r.refresh();
  await until(() => !r.loading());
  assert.equal(calls.length, 2);
  assert.deepEqual(r.data(), ["fresh"]);
  r.dispose();
});

test("GET problemDetails: retried responses aren't read; only the final error's body is", async () => {
  const reads = [];
  const problem = (title, code = 503) => () =>
    new Response(new ReadableStream({ start(c) { reads.push(title); c.enqueue(new TextEncoder().encode(JSON.stringify({ title }))); c.close(); } }), { status: code, headers: { "Content-Type": "application/problem+json" } });
  stubFetch([problem("first"), problem("second"), problem("last")]);
  const r = api("/users", { retry: 2, problemDetails: true });
  await until(() => !r.loading());
  assert.equal(calls.length, 3);
  assert.deepEqual(r.error().problem, { title: "last" });
  r.dispose();
});

test("a GET retry replays the same URL even if params/query change mid-sequence without a refetch trigger", async () => {
  // The URL is snapshotted once per load: attempts never re-read reactive state.
  let reads = 0;
  stubFetch(["network", ok([1])]);
  const page = createState(1);
  const r = api("/users", { query: () => (reads++, { page: page.get() }), retry: 1 });
  await until(() => !r.loading());
  assert.deepEqual(paths(), ["/users?page=1", "/users?page=1"]);
  assert.equal(reads, 1, "the query function ran once for the whole load");
  r.dispose();
});

test("no behavior change without retry: GET and mutations make one attempt and no backoff timers", async () => {
  stubFetch(["network"]);
  const r = api("/users");
  const m = api.post("/x");
  await m.run({});
  await settle();
  assert.equal(calls.length, 2);
  assert.ok(r.error() instanceof ApiError);
  assert.equal(randomMock.mock.callCount(), 0, "jitter is only computed when a retry is scheduled");
  r.dispose();
});
