// Phase 6 — idempotency keys and opt-in mutation retries.
// Backoff uses node:test's fake setTimeout; promises settle via setImmediate (never faked).

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { html, mount, configure } from "@zoijs/core";
import { api, ApiError } from "../src/index.js";

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
let calls = [];
// `script` answers attempt n with script[n] (the last entry repeats). An entry is a Response
// factory, "network", or "hang" (only ends when aborted).
function stubFetch(script) {
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init, method: init.method, key: init.headers["Idempotency-Key"], body: init.body, at: Date.now() });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    return Promise.resolve().then(() => {
      if (step === "network") throw new TypeError("Failed to fetch");
      if (step === "hang") return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      return step(url, init);
    });
  };
}
test.afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
});
const ok = (body = { ok: true }, status = 201) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const status = (code, headers = {}) => () => new Response("", { status: code, headers });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function timers() {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  const live = new Set();
  const st = globalThis.setTimeout, ct = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => {
    const id = st(() => (live.delete(id), fn(...a)), ms);
    live.add(id);
    return id;
  };
  globalThis.clearTimeout = (id) => (live.delete(id), ct(id));
  return { live, tick: (ms) => mock.timers.tick(ms) };
}
// Run to completion: settle, then jump fake time to the next pending timer, until it resolves.
async function drive(t, promise) {
  let settled = false;
  promise.then(() => (settled = true));
  for (let i = 0; i < 500 && !settled; i++) {
    await settle();
    if (!settled) mock.timers.runAll();
  }
  await settle();
  assert.ok(settled, "the run finished");
  return promise;
}
// Fake-time gaps between consecutive attempts.
const gaps = () => calls.map((c, i) => (i ? c.at - calls[i - 1].at : 0));

// ---- defaults and validation ----------------------------------------------------------------------

test("no retries and no key by default: one attempt, no Idempotency-Key header", async () => {
  stubFetch([status(503)]);
  const m = api.post("/orders");
  await m.run({ sku: "A" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, undefined);
  assert.deepEqual(Object.keys(calls[0].init.headers).sort(), ["Accept", "Content-Type"]);
});

test("retry needs idempotencyKey: true — for every method", () => {
  for (const make of [api.post, api.put, api.patch, api.delete]) {
    assert.throws(() => make("/x", { retry: 2 }), (e) => e instanceof TypeError && /retry needs idempotencyKey: true/.test(e.message));
    assert.throws(() => make("/x", { retry: 1, idempotencyKey: false }), /retry needs idempotencyKey/);
    make("/x", { retry: 2, idempotencyKey: true });
    make("/x", { retry: 0 });
  }
});

test("invalid retry, retryDelay and idempotencyKey values throw at the factory", () => {
  for (const bad of [-1, 1.5, NaN, Infinity, "2", true, null, {}, [], 6, 100, 2 ** 53]) {
    assert.throws(() => api.post("/x", { idempotencyKey: true, retry: bad }), /retry must be a whole number from 0 to 5/, String(bad));
  }
  for (const bad of [-1, NaN, Infinity, "250", true, null, {}, 2 ** 31]) {
    assert.throws(() => api.post("/x", { idempotencyKey: true, retry: 1, retryDelay: bad }), /retryDelay must be a finite number of milliseconds/, String(bad));
  }
  assert.throws(() => api.post("/x", { retryDelay: 100 }), /retryDelay has no effect without retry/);
  for (const bad of ["unsupported value", "my-key", () => "k", 1, {}, null]) {
    assert.throws(() => api.post("/x", { idempotencyKey: bad }), /idempotencyKey must be true or false/);
  }
  for (const opt of ["idempotencyKey", "retry", "retryDelay"]) {
    assert.throws(() => api("/x", { [opt]: 1 }), /unsupported option/, `${opt} is mutation-only`);
  }
  api.post("/x", { idempotencyKey: true, retry: 5, retryDelay: 0 });
});

// ---- idempotency keys -------------------------------------------------------------------------------

test("idempotencyKey: a v4 UUID in the Idempotency-Key header, new per run()", async () => {
  stubFetch([ok()]);
  const m = api.post("/orders", { idempotencyKey: true });
  await m.run({ a: 1 });
  await m.run({ a: 1 });
  assert.match(calls[0].key, UUID);
  assert.match(calls[1].key, UUID);
  assert.notEqual(calls[0].key, calls[1].key, "a new logical run gets a new key");
  for (const c of calls) {
    assert.ok(!c.url.includes(c.key), "not in the URL");
    assert.ok(!c.body.includes(c.key), "not in the body");
  }
});

test("keys come from crypto.randomUUID, never Math.random", async () => {
  stubFetch([ok()]);
  const uuid = mock.method(globalThis.crypto, "randomUUID");
  const rand = mock.method(Math, "random");
  try {
    await api.post("/x", { idempotencyKey: true }).run({});
    assert.equal(uuid.mock.callCount(), 1);
    assert.equal(rand.mock.callCount(), 0);
  } finally {
    uuid.mock.restore();
    rand.mock.restore();
  }
});

test("without randomUUID the key comes from getRandomValues; with neither, nothing is sent", async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    const real = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: { getRandomValues: (a) => real.getRandomValues(a) }, configurable: true });
    stubFetch([ok()]);
    const m = api.post("/x", { idempotencyKey: true });
    await m.run({});
    await m.run({});
    assert.match(calls[0].key, UUID);
    assert.notEqual(calls[0].key, calls[1].key);
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    calls = [];
    await m.run({});
    assert.equal(m.error().type, "config");
    assert.match(m.error().message, /needs crypto\.randomUUID or crypto\.getRandomValues/);
    assert.equal(calls.length, 0);
    await api.post("/x").run({}); // keys off: unaffected
    assert.equal(calls.length, 1);
  } finally {
    Object.defineProperty(globalThis, "crypto", saved);
  }
});

test("the key is reused across every retry of one run, and a new run gets a new one", async () => {
  const t = timers();
  stubFetch(["network", status(503), ok(), "network", ok()]);
  const m = api.post("/orders", { idempotencyKey: true, retry: 2 });
  await drive(t, m.run({ sku: "A" }));
  await drive(t, m.run({ sku: "A" }));
  assert.equal(calls.length, 5);
  const [k1, k2, k3, k4, k5] = calls.map((c) => c.key);
  assert.ok(k1 === k2 && k2 === k3, "one key for attempts 1–3");
  assert.ok(k4 === k5, "one key for the second run's attempts");
  assert.notEqual(k1, k4);
});

test("exclusive double submit: one logical run, one key, one retry sequence, one invalidation", async () => {
  const t = timers();
  stubFetch([(u, i) => (i.method === "GET" ? ok([], 200)() : status(503)()), (u, i) => (i.method === "GET" ? ok([], 200)() : ok()())]);
  const list = api("/orders");
  await settle();
  calls = [];
  const m = api.post("/orders", { exclusive: true, idempotencyKey: true, retry: 2, invalidate: list });
  const both = Promise.all([m.run({ n: 1 }), m.run({ n: 2 })]);
  await drive(t, both);
  await settle();
  const posts = calls.filter((c) => c.method === "POST");
  assert.equal(posts.length, 2, "attempt + one retry, not two loops");
  assert.equal(new Set(posts.map((c) => c.key)).size, 1);
  assert.equal(calls.filter((c) => c.method === "GET").length, 1, "invalidated once");
  list.dispose();
});

test("the key never appears in errors, problem details or monitoring", async () => {
  const t = timers();
  const reported = [];
  configure({ onError: (e, info) => reported.push({ e, info }) });
  try {
    stubFetch([() => new Response(JSON.stringify({ title: "nope", detail: "x" }), { status: 422, headers: { "Content-Type": "application/problem+json" } })]);
    const m = api.post("/orders", { idempotencyKey: true, retry: 2, problemDetails: true });
    await drive(t, m.run({}));
    const key = calls[0].key;
    const e = m.error();
    const dump = JSON.stringify({ m: e.message, ...e, s: String(e), stack: e.stack, r: reported.map((x) => ({ ...x.e, info: x.info })) });
    assert.ok(!dump.includes(key));
    assert.ok(!(e.url || "").includes(key));
  } finally {
    configure({ onError: null });
  }
});

// ---- retry classification ------------------------------------------------------------------------------

test("retryable: network, timeout, 408, 425, 429, 500, 502, 503, 504", async () => {
  const t = timers();
  for (const first of ["network", 408, 425, 429, 500, 502, 503, 504]) {
    stubFetch([first === "network" ? "network" : status(first), ok()]);
    const m = api.post("/x", { idempotencyKey: true, retry: 1 });
    const v = await drive(t, m.run({}));
    assert.equal(calls.length, 2, String(first));
    assert.deepEqual(v, { ok: true });
    assert.equal(m.error(), null);
  }
  stubFetch(["hang", ok()]);
  const m = api.post("/x", { idempotencyKey: true, retry: 1, timeout: 1000 });
  assert.deepEqual(await drive(t, m.run({})), { ok: true });
  assert.equal(calls.length, 2, "timeout is retryable");
});

test("never retried: 400 401 403 404 405 409 410 412 422, parse, config, security", async () => {
  const t = timers();
  for (const code of [400, 401, 403, 404, 405, 409, 410, 412, 422]) {
    stubFetch([status(code), ok()]);
    const m = api.post("/x", { idempotencyKey: true, retry: 3 });
    await drive(t, m.run({}));
    assert.equal(calls.length, 1, String(code));
    assert.equal(m.error().status, code);
  }
  stubFetch([() => new Response("{bad", { status: 200, headers: { "Content-Type": "application/json" } }), ok()]);
  const parse = api.post("/x", { idempotencyKey: true, retry: 3 });
  await drive(t, parse.run({}));
  assert.equal(calls.length, 1);
  assert.equal(parse.error().type, "parse");
  stubFetch([ok()]);
  const config = api.post("/x", { idempotencyKey: true, retry: 3 });
  await drive(t, config.run({ n: 10n }));
  assert.equal(config.error().type, "config");
  const security = api.post("https://evil.example/x", { idempotencyKey: true, retry: 3 });
  await drive(t, security.run({}));
  assert.equal(security.error().type, "security");
  assert.equal(calls.length, 0);
});

// ---- retry count ---------------------------------------------------------------------------------------

test("retry: n means up to n extra attempts — exact totals for 0, 1, 2 and the maximum 5", async () => {
  const t = timers();
  for (const [retry, attempts] of [[0, 1], [1, 2], [2, 3], [5, 6]]) {
    stubFetch(["network"]);
    const m = api.post("/x", { idempotencyKey: true, retry });
    await drive(t, m.run({}));
    assert.equal(calls.length, attempts, `retry ${retry}`);
    assert.equal(m.error().type, "network");
  }
});

// ---- backoff -------------------------------------------------------------------------------------------

test("backoff: 250, 500, 1000, 2000 ms by default; retryDelay sets the base", async () => {
  const t = timers();
  stubFetch(["network"]);
  const m = api.post("/x", { idempotencyKey: true, retry: 4 });
  await drive(t, m.run({}));
  assert.deepEqual(gaps(), [0, 250, 500, 1000, 2000]);
  stubFetch(["network"]);
  const fast = api.post("/x", { idempotencyKey: true, retry: 3, retryDelay: 10 });
  await drive(t, fast.run({}));
  assert.deepEqual(gaps(), [0, 10, 20, 40]);
  assert.equal(t.live.size, 0, "no timer left after exhaustion");
});

test("backoff waits are capped at 30 s", async () => {
  const t = timers();
  stubFetch(["network"]);
  const m = api.post("/x", { idempotencyKey: true, retry: 2, retryDelay: 20_000 });
  await drive(t, m.run({}));
  assert.deepEqual(gaps(), [0, 20_000, 30_000]);
});

test("Retry-After (seconds or HTTP-date) on 429/503 lengthens the wait; too long ends the retries", async () => {
  const t = timers();
  stubFetch([status(429, { "Retry-After": "3" }), ok()]);
  const a = api.post("/x", { idempotencyKey: true, retry: 1 });
  await drive(t, a.run({}));
  assert.deepEqual(gaps(), [0, 3000]);
  stubFetch([status(503, { "Retry-After": new Date(Date.now() + 2000).toUTCString() }), ok()]);
  const b = api.post("/x", { idempotencyKey: true, retry: 1 });
  await drive(t, b.run({}));
  assert.ok(gaps()[1] >= 1000 && gaps()[1] <= 2000, `HTTP-date wait ${gaps()[1]}`);
  stubFetch([status(503, { "Retry-After": "0" }), ok()]);
  const c = api.post("/x", { idempotencyKey: true, retry: 1, retryDelay: 400 });
  await drive(t, c.run({}));
  assert.deepEqual(gaps(), [0, 400], "never shorter than the backoff");
  for (const huge of ["31", "999999999999", new Date(Date.now() + 3_600_000).toUTCString()]) {
    stubFetch([status(503, { "Retry-After": huge }), ok()]);
    const d = api.post("/x", { idempotencyKey: true, retry: 3 });
    await drive(t, d.run({}));
    assert.equal(calls.length, 1, `Retry-After ${huge}: give up rather than wait`);
    assert.equal(d.error().status, 503);
  }
  stubFetch([status(503, { "Retry-After": "soon" }), ok()]);
  const e = api.post("/x", { idempotencyKey: true, retry: 1 });
  await drive(t, e.run({}));
  assert.equal(calls.length, 2, "an unparseable Retry-After falls back to the backoff");
  stubFetch([status(500, { "Retry-After": "999999" }), ok()]);
  const f = api.post("/x", { idempotencyKey: true, retry: 1 });
  await drive(t, f.run({}));
  assert.equal(calls.length, 2, "Retry-After is only honored on 429/503");
});

test("pending() stays true through attempts and waits; teardown cancels a scheduled retry", async () => {
  const t = timers();
  stubFetch(["network"]);
  let m;
  const unmount = mount(() => {
    m = api.post("/x", { idempotencyKey: true, retry: 3 });
    return html`<p></p>`;
  }, document.createElement("div"));
  const p = m.run({});
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(m.pending(), true, "waiting for retry 1");
  t.tick(100);
  await settle();
  assert.equal(m.pending(), true);
  assert.equal(m.error(), null, "no intermediate error");
  assert.equal(t.live.size, 1);
  unmount();
  assert.equal(t.live.size, 0, "the backoff timer was cleared");
  await p;
  t.tick(60_000);
  await settle();
  assert.equal(calls.length, 1, "no retry for a UI that's gone");
});

test("an attempt in flight at teardown may finish, but nothing is retried after it", async () => {
  const t = timers();
  let release;
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ init });
    return new Promise((_, reject) => (release = () => reject(new TypeError("offline"))));
  };
  let m;
  const unmount = mount(() => {
    m = api.post("/x", { idempotencyKey: true, retry: 3 });
    return html`<p></p>`;
  }, document.createElement("div"));
  const p = m.run({});
  await settle();
  unmount();
  release();
  await p;
  t.tick(60_000);
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(t.live.size, 0);
});

// ---- action state, monitoring, invalidation -------------------------------------------------------------

test("recovered: done once, final result, no intermediate error, nothing reported", async () => {
  const t = timers();
  const reported = [];
  configure({ onError: (e) => reported.push(e) });
  try {
    stubFetch(["network", status(503), ok({ id: 9 })]);
    const m = api.post("/orders", { idempotencyKey: true, retry: 2 });
    const errors = [];
    const p = m.run({});
    let settled = false;
    p.then(() => (settled = true));
    for (let i = 0; i < 50 && !settled; i++) {
      await settle();
      errors.push(m.error());
      assert.equal(m.done(), settled ? true : false);
      if (!settled) assert.equal(m.pending(), true);
      t.tick(250);
    }
    assert.deepEqual(await p, { id: 9 });
    assert.ok(errors.every((e) => e === null), "error() never showed an intermediate failure");
    assert.equal(m.done(), true);
    assert.equal(m.pending(), false);
    assert.deepEqual(m.result(), { id: 9 });
    assert.deepEqual(reported, []);
  } finally {
    configure({ onError: null });
  }
});

test("exhausted: only the final error, reported once, no invalidation", async () => {
  const t = timers();
  const reported = [];
  configure({ onError: (e, info) => reported.push({ e, info }) });
  try {
    stubFetch([(u, i) => (i.method === "GET" ? ok([], 200)() : null), "network", "network", status(504)]);
    const list = api("/orders");
    await settle();
    reported.length = 0;
    const m = api.post("/orders", { idempotencyKey: true, retry: 2, invalidate: list });
    await drive(t, m.run({}));
    await settle();
    assert.equal(calls.filter((c) => c.method === "POST").length, 3);
    assert.equal(m.error().type, "http");
    assert.equal(m.error().status, 504, "the LAST attempt's error");
    assert.equal(reported.length, 1);
    assert.equal(reported[0].info.kind, "action");
    assert.equal(calls.filter((c) => c.method === "GET").length, 1, "no invalidation");
    list.dispose();
  } finally {
    configure({ onError: null });
  }
});

test("invalidate once after eventual success — never after the failed attempts; disposed skipped", async () => {
  const t = timers();
  let posts = 0;
  stubFetch([(u, i) => (i.method === "GET" ? ok([], 200)() : ++posts < 3 ? status(502)() : ok()())]);
  const list = api("/orders");
  const gone = api("/gone");
  await settle();
  gone.dispose();
  const getsBefore = calls.filter((c) => c.method === "GET").length;
  const m = api.post("/orders", { idempotencyKey: true, retry: 3, invalidate: [list, gone] });
  const p = m.run({});
  await settle();
  t.tick(250);
  await settle();
  assert.equal(calls.filter((c) => c.method === "GET").length, getsBefore, "nothing during retries");
  await drive(t, p);
  await settle();
  const gets = calls.filter((c) => c.method === "GET").slice(getsBefore);
  assert.deepEqual(gets.map((c) => new URL(c.url).pathname), ["/orders"]);
  list.dispose();
});

// ---- timeout per attempt ----------------------------------------------------------------------------------

test("each attempt gets a fresh timeout: timeout → backoff → success", async () => {
  const t = timers();
  stubFetch(["hang", ok()]);
  const m = api.post("/x", { idempotencyKey: true, retry: 1, timeout: 1000 });
  await drive(t, m.run({}));
  assert.deepEqual(gaps(), [0, 1000 + 250], "timeout window, then the backoff");
  assert.equal(m.done(), true);
  assert.equal(t.live.size, 0);
});

test("timeout → backoff → timeout ends as a timeout error; all timers cleaned up", async () => {
  const t = timers();
  stubFetch(["hang"]);
  const m = api.post("/x", { idempotencyKey: true, retry: 1, timeout: 500 });
  await drive(t, m.run({}));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.signal.aborted, true);
  assert.equal(calls[1].init.signal.aborted, true);
  assert.equal(m.error().type, "timeout");
  assert.equal(t.live.size, 0);
});

// ---- replay stability ----------------------------------------------------------------------------------------

test("JSON is serialized once per run: toJSON/getters run once, every attempt sends identical bytes", async () => {
  const t = timers();
  let toJSONCalls = 0, getterCalls = 0;
  const body = {
    toJSON() {
      toJSONCalls++;
      return { sku: "ABC-123", quantity: 1, at: "fixed" };
    },
  };
  stubFetch(["network", status(500), ok()]);
  const m = api.post("/orders/:id", { idempotencyKey: true, retry: 2, query: { src: "web" } });
  await drive(t, m.run({ params: { id: 7 }, body }));
  assert.equal(toJSONCalls, 1);
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls.map((c) => c.body)).size, 1);
  assert.equal(new Set(calls.map((c) => c.url)).size, 1);
  assert.equal(new Set(calls.map((c) => c.method)).size, 1);
  assert.equal(new Set(calls.map((c) => c.key)).size, 1);
  stubFetch(["network", ok()]);
  await drive(t, api.post("/x", { idempotencyKey: true, retry: 1 }).run({ get n() { getterCalls++; return 1; } }));
  assert.equal(getterCalls, 1);
});

test("FormData can't be retried (config error, nothing sent); with retry 0 it still gets a key", async () => {
  stubFetch([ok()]);
  const form = new FormData();
  form.append("secret-field", "secret-value");
  const r = api.post("/upload", { idempotencyKey: true, retry: 2 });
  await r.run(form);
  assert.equal(r.error().type, "config");
  assert.match(r.error().message, /a FormData body can't be retried/);
  assert.ok(!r.error().message.includes("secret"));
  assert.equal(calls.length, 0);
  const once = api.post("/upload", { idempotencyKey: true });
  await once.run(form);
  assert.equal(calls.length, 1);
  assert.match(calls[0].key, UUID);
  assert.equal(calls[0].body, form);
});

test("problem details: skipped for attempts that will be retried, read for the final error", async () => {
  const t = timers();
  const reads = [];
  const problem = (title) => () => {
    const body = new ReadableStream({ start(c) { reads.push(title); c.enqueue(new TextEncoder().encode(JSON.stringify({ title }))); c.close(); } });
    return new Response(body, { status: 503, headers: { "Content-Type": "application/problem+json" } });
  };
  stubFetch([problem("first"), problem("second"), problem("last")]);
  const m = api.post("/x", { idempotencyKey: true, retry: 2, problemDetails: true });
  await drive(t, m.run({}));
  assert.equal(calls.length, 3);
  assert.deepEqual(m.error().problem, { title: "last" });
  stubFetch([() => new Response(JSON.stringify({ title: "bad input" }), { status: 422, headers: { "Content-Type": "application/problem+json" } })]);
  const n = api.post("/x", { idempotencyKey: true, retry: 2, problemDetails: true });
  await drive(t, n.run({}));
  assert.deepEqual(n.error().problem, { title: "bad input" }, "a non-retryable error is final: read");
});

test("every attempt goes through the same-origin transport", async () => {
  const t = timers();
  stubFetch(["network", ok()]);
  const m = api.post("/x", { idempotencyKey: true, retry: 1 });
  await drive(t, m.run({}));
  for (const c of calls) {
    assert.equal(c.init.mode, "same-origin");
    assert.equal(c.init.credentials, "same-origin");
    assert.equal(new URL(c.url).origin, "https://app.example.com");
  }
});
