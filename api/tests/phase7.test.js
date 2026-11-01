// Phase 7 — caller-supplied idempotency keys (functions), retry status (attempt / retrying).
// Backoff uses node:test's fake setTimeout + Date; promises settle via setImmediate (never faked).

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { configure } from "@zoijs/core";
import { api, ApiError } from "../src/index.js";

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
const realFetch = globalThis.fetch;
let calls = [];
function stubFetch(script) {
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init, method: init.method, key: init.headers["Idempotency-Key"], headers: init.headers, body: init.body });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    return Promise.resolve().then(() => {
      if (step === "network") throw new TypeError("Failed to fetch");
      return step(url, init);
    });
  };
}
// Jitter (±20 %) is pinned to its midpoint so backoff times are exact; phase8.test.js covers jitter.
test.beforeEach(() => {
  mock.method(Math, "random", () => 0.5);
});
test.afterEach(() => {
  mock.restoreAll();
  globalThis.fetch = realFetch;
  mock.timers.reset();
});
const ok = (body = { ok: true }, status = 201) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const status = (code) => () => new Response("", { status: code });
const fake = () => mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
async function drive(promise) {
  let settled = false;
  promise.then(() => (settled = true));
  for (let i = 0; i < 500 && !settled; i++) {
    await settle();
    if (!settled) mock.timers.runAll();
  }
  await settle();
  assert.ok(settled);
  return promise;
}
const isConfig = (e, re) => e instanceof ApiError && e.type === "config" && (!re || re.test(e.message));

// ---- caller-supplied keys -------------------------------------------------------------------------------

test("a key function's value is sent exactly as returned", async () => {
  stubFetch([ok()]);
  for (const key of ["order-123", "a", "x".repeat(255), "!#$%&'*+-.^_`|~0189AZaz", "550e8400-e29b-41d4-a716-446655440000", "a:b/c=d;e,f"]) {
    calls = [];
    const m = api.post("/orders", { idempotencyKey: () => key });
    await m.run({});
    assert.equal(m.error(), null, key);
    assert.equal(calls[0].key, key);
  }
});

test("fixed string keys are refused at the factory — they'd be reused for every run()", () => {
  for (const key of ["checkout-abc", "", "a b"]) {
    for (const make of [api.post, api.put, api.patch, api.delete]) {
      assert.throws(() => make("/x", { idempotencyKey: key }), (e) => e instanceof TypeError && /can't be a fixed string/.test(e.message) && !e.message.includes(key || "\u0000"));
    }
  }
});

test("invalid keys from the function fail before any request, without echoing the value", async () => {
  stubFetch([ok()]);
  const SECRET = "SECRET-KEY-MARKER";
  const bad = [
    "",
    "x".repeat(256),
    `${SECRET}\r`,
    `${SECRET}\n`,
    `${SECRET}\r\nX-Injected: 1`,
    `${SECRET}\u0000`,
    `${SECRET}\t`,
    `${SECRET}\u001b`,
    `${SECRET}\u007f`,
    ` ${SECRET}`,
    `${SECRET} `,
    `${SECRET} x`,
    `${SECRET}é`,
    `${SECRET}✓`,
    `${SECRET} `,
    42,
    null,
    undefined,
    { toString: () => SECRET },
    ["k"],
  ];
  for (const value of bad) {
    const m = api.post("/x", { idempotencyKey: () => value });
    await m.run({});
    assert.ok(isConfig(m.error(), /the idempotencyKey function must return 1–255 visible ASCII characters/), JSON.stringify(String(value)));
    assert.ok(!m.error().message.includes(SECRET));
  }
  assert.equal(calls.length, 0, "no request with an invalid key — no header injection possible");
});

test("a throwing key function is a config error that doesn't carry the thrown message", async () => {
  const reported = [];
  configure({ onError: (e, info) => reported.push({ e, info }) });
  try {
    stubFetch([ok()]);
    const m = api.post("/x", {
      idempotencyKey: () => {
        throw new Error("vault token SECRET-in-error");
      },
    });
    await m.run({});
    assert.ok(isConfig(m.error(), /^POST request not sent: the idempotencyKey function threw$/));
    assert.equal(m.error().cause, undefined);
    assert.ok(!JSON.stringify({ ...m.error(), m: m.error().message, s: m.error().stack }).includes("SECRET"));
    assert.equal(calls.length, 0);
    assert.equal(reported.length, 1, "reported like any config error from run() (kind action)");
    assert.equal(reported[0].info.kind, "action");
  } finally {
    configure({ onError: null });
  }
});

test("the key function runs once per logical run — not per retry; a new run calls it again", async () => {
  fake();
  stubFetch(["network", status(503), ok(), "network", ok()]);
  let n = 0;
  const m = api.post("/orders", { idempotencyKey: () => `op-${++n}`, retry: 2 });
  await drive(m.run({}));
  await drive(m.run({}));
  assert.equal(n, 2);
  assert.deepEqual(calls.map((c) => c.key), ["op-1", "op-1", "op-1", "op-2", "op-2"]);
});

test("exclusive joined calls share one key-function call, one key and one sequence", async () => {
  fake();
  stubFetch(["network", ok()]);
  let n = 0;
  const m = api.post("/orders", { exclusive: true, idempotencyKey: () => `op-${++n}`, retry: 1 });
  await drive(Promise.all([m.run({}), m.run({}), m.run({})]));
  assert.equal(n, 1);
  assert.deepEqual(calls.map((c) => c.key), ["op-1", "op-1"]);
});

test("a caller key never leaks into URLs, bodies, errors, problem details or monitoring", async () => {
  fake();
  const reported = [];
  configure({ onError: (e, info) => reported.push({ e, info }) });
  try {
    const KEY = "caller-secret-key-0001";
    stubFetch([() => new Response(JSON.stringify({ title: "denied", detail: "no" }), { status: 422, headers: { "Content-Type": "application/problem+json" } })]);
    const m = api.post("/orders/:id", { idempotencyKey: () => KEY, retry: 2, problemDetails: true, query: { a: 1 } });
    await drive(m.run({ params: { id: 1 }, body: { x: 1 } }));
    assert.equal(calls[0].key, KEY);
    assert.ok(!calls[0].url.includes(KEY) && !calls[0].body.includes(KEY));
    const e = m.error();
    const dump = JSON.stringify({ m: e.message, ...e, s: String(e), stack: e.stack, r: reported.map((x) => ({ ...x.e, info: x.info })) });
    assert.ok(!dump.includes(KEY));
  } finally {
    configure({ onError: null });
  }
});

test("idempotencyKey: () => key without retry sends the key once; false sends none", async () => {
  stubFetch([ok()]);
  await api.post("/x", { idempotencyKey: () => "k1" }).run({});
  await api.post("/x", { idempotencyKey: false }).run({});
  assert.deepEqual(calls.map((c) => c.key), ["k1", undefined]);
});

// ---- retry status ------------------------------------------------------------------------------------------

test("attempt() / retrying() through a run that recovers on the second attempt", async () => {
  fake();
  let release;
  const gate = () => new Promise((resolve) => (release = resolve));
  stubFetch(["network", () => gate().then(() => ok()())]);
  const m = api.post("/orders", { idempotencyKey: true, retry: 2 });
  assert.deepEqual([m.attempt(), m.retrying(), m.pending()], [0, false, false], "idle");
  const p = m.run({});
  assert.deepEqual([m.attempt(), m.retrying(), m.pending()], [1, false, true], "first attempt in flight");
  await settle();
  assert.deepEqual([m.attempt(), m.retrying(), m.pending()], [1, true, true], "waiting to retry: attempt stays 1");
  mock.timers.runAll();
  await settle();
  assert.deepEqual([m.attempt(), m.retrying(), m.pending()], [2, true, true], "second attempt in flight");
  release();
  await p;
  assert.deepEqual([m.attempt(), m.retrying(), m.pending(), m.done()], [2, false, false, true], "success: attempt kept");
  assert.equal(m.error(), null);
});

test("attempt() / retrying() after exhaustion, then a fresh run resets them", async () => {
  fake();
  stubFetch(["network", "network", "network", ok()]);
  const m = api.post("/x", { idempotencyKey: true, retry: 2 });
  await drive(m.run({}));
  assert.deepEqual([m.attempt(), m.retrying(), m.pending(), m.done(), m.error()?.type], [3, false, false, false, "network"]);
  const p = m.run({});
  assert.deepEqual([m.attempt(), m.retrying()], [1, false], "a new run starts counting again");
  await drive(p);
  assert.deepEqual([m.attempt(), m.done()], [1, true]);
});

test("a mutation without retry: attempt 0 → 1 → stays 1; retrying() is always false", async () => {
  stubFetch([status(503)]);
  const m = api.post("/x");
  assert.equal(m.attempt(), 0);
  const p = m.run({});
  assert.equal(m.attempt(), 1);
  assert.equal(m.retrying(), false);
  await p;
  assert.deepEqual([m.attempt(), m.retrying(), m.error()?.status], [1, false, 503]);
});

test("a config failure before sending leaves attempt() at 0", async () => {
  stubFetch([ok()]);
  const m = api.post("/x", { idempotencyKey: true, retry: 1 });
  await m.run({ n: 10n });
  assert.deepEqual([m.attempt(), m.retrying(), m.error()?.type], [0, false, "config"]);
  assert.equal(calls.length, 0);
});

test("reset(): idle → 0/false; during a backoff wait it also cancels the scheduled retry", async () => {
  fake();
  stubFetch(["network", ok()]);
  const m = api.post("/x", { idempotencyKey: true, retry: 3 });
  await drive(m.run({}).then(() => {}));
  m.reset();
  assert.deepEqual([m.attempt(), m.retrying(), m.done()], [0, false, false]);
  stubFetch(["network", ok()]);
  const p = m.run({});
  await settle();
  assert.deepEqual([m.attempt(), m.retrying()], [1, true]);
  m.reset();
  assert.deepEqual([m.attempt(), m.retrying(), m.pending()], [0, false, false]);
  await p;
  mock.timers.runAll();
  await settle();
  assert.equal(calls.length, 1, "no retry is sent after reset()");
  assert.deepEqual([m.attempt(), m.retrying(), m.error(), m.done()], [0, false, null, false], "the abandoned run writes nothing");
});

test("exclusive joined callers see the same attempt() / retrying() / pending()", async () => {
  fake();
  stubFetch(["network", ok()]);
  const m = api.post("/x", { exclusive: true, idempotencyKey: true, retry: 1 });
  const a = m.run({ n: 1 });
  const b = m.run({ n: 2 });
  await settle();
  assert.deepEqual([m.attempt(), m.retrying(), m.pending()], [1, true, true]);
  await drive(Promise.all([a, b]));
  assert.deepEqual([m.attempt(), m.retrying(), m.pending(), m.done()], [2, false, false, true]);
  assert.equal(calls.length, 2);
});

test("a superseded (non-exclusive) run doesn't write the status and isn't retried; the newest run owns it", async () => {
  fake();
  let releaseFirst;
  let n = 0;
  stubFetch([() => (++n === 1 ? new Promise((resolve) => (releaseFirst = () => resolve(new Response("", { status: 503 })))) : ok()())]);
  const m = api.post("/x", { idempotencyKey: true, retry: 2 });
  const first = m.run({ n: 1 });
  await settle();
  const second = m.run({ n: 2 });
  await settle();
  assert.deepEqual([m.attempt(), m.retrying(), m.done()], [1, false, true], "the second run succeeded on attempt 1");
  releaseFirst(); // the old run fails retryably…
  await drive(first);
  await second;
  assert.equal(calls.length, 2, "…and isn't retried: nobody is waiting for a superseded run");
  assert.deepEqual([m.attempt(), m.retrying(), m.done()], [1, false, true], "the status still belongs to the second run");
});

test("retry status changes aren't errors: nothing is reported for a recovered run", async () => {
  fake();
  const reported = [];
  configure({ onError: (e) => reported.push(e) });
  try {
    stubFetch([status(503), status(502), ok()]);
    const m = api.post("/x", { idempotencyKey: true, retry: 2 });
    await drive(m.run({}));
    assert.equal(m.attempt(), 3);
    assert.deepEqual(reported, []);
  } finally {
    configure({ onError: null });
  }
});

test("invalidation stays once on success, zero on failure, with status tracking in place", async () => {
  fake();
  stubFetch([(u, i) => (i.method === "GET" ? ok([], 200)() : status(503)()), (u, i) => (i.method === "GET" ? ok([], 200)() : ok()())]);
  const list = api("/orders");
  await settle();
  const m = api.post("/orders", { idempotencyKey: true, retry: 1, invalidate: list });
  await drive(m.run({}));
  await settle();
  assert.equal(calls.filter((c) => c.method === "GET").length, 2);
  stubFetch([(u, i) => (i.method === "GET" ? ok([], 200)() : status(503)())]);
  await drive(m.run({}));
  await settle();
  assert.equal(calls.filter((c) => c.method === "GET").length, 0);
  list.dispose();
});

test("Retry-After over the cap still fails rather than retrying early (Phase 6 rule kept)", async () => {
  fake();
  stubFetch([() => new Response("", { status: 503, headers: { "Retry-After": "120" } }), ok()]);
  const m = api.post("/x", { idempotencyKey: true, retry: 3 });
  await drive(m.run({}));
  assert.equal(calls.length, 1);
  assert.deepEqual([m.attempt(), m.retrying(), m.error()?.status], [1, false, 503]);
});

test("FormData retries reuse the caller key function's single value (Phase 9: FormData retries enabled)", async () => {
  fake();
  let n = 0;
  stubFetch([status(503), ok()]);
  const form = new FormData();
  const m = api.post("/upload", { idempotencyKey: () => `upload-${++n}`, retry: 1 });
  await drive(m.run(form));
  assert.equal(n, 1);
  assert.deepEqual(calls.map((c) => c.key), ["upload-1", "upload-1"]);
  assert.ok(calls.every((c) => c.body === form));
  assert.deepEqual([m.attempt(), m.done()], [2, true]);
});
