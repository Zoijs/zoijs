// Phase 12 — the auth provider's lifecycle: an AbortSignal for every call, an opt-in authTimeout,
// cancellation that never waits for a slow provider, and redaction of a token a server echoes back.

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { configure, createState, mount, html } from "@zoijs/core";
import { createApi, api } from "../src/index.js";

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
const realFetch = globalThis.fetch;
let calls = [];
function stubFetch(script) {
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init, auth: init.headers.Authorization });
    const step = script[Math.min(calls.length - 1, script.length - 1)];
    return Promise.resolve().then(() => step(url, init));
  };
}
test.afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
  globalThis.fetch = realFetch;
});
const json = (body = { ok: true }, status = 200, headers = {}) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const loaded = async (r) => {
  for (let i = 0; i < 50 && r.loading(); i++) await settle();
  return r;
};
const BASE = "https://api.example.com/v1/";
// A provider that never settles unless its signal aborts; records what it was given.
function hangingProvider() {
  const seen = [];
  const auth = ({ signal }) => {
    seen.push(signal);
    return new Promise(() => {}); // ignores the signal on purpose: the request must not depend on it
  };
  return { auth, seen };
}

// ---- the signal ------------------------------------------------------------------------------------

test("every provider call gets its own, not-yet-aborted signal; zero-argument providers still work", async () => {
  const signals = [];
  stubFetch([json()]);
  const c = createApi({ baseURL: BASE, auth: ({ signal }) => (signals.push(signal), "t") });
  await loaded(c("/a"));
  await c.post("/b").run({});
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
  assert.ok(signals.every((s) => s instanceof AbortSignal && !s.aborted));
  await loaded(createApi({ baseURL: BASE, auth: () => "plain" })("/c"));
  assert.equal(calls.at(-1).auth, "Bearer plain");
});

test("superseded GET: the old provider's signal aborts at once, and the new load proceeds without waiting for it", async () => {
  const gates = [];
  const c = createApi({
    baseURL: BASE,
    auth: ({ signal }) => {
      const g = { signal };
      gates.push(g);
      return new Promise((resolve) => (g.resolve = resolve));
    },
  });
  const id = createState(1);
  stubFetch([json()]);
  const r = c("/users/:id", { params: () => ({ id: id.get() }) });
  await settle();
  id.set(2);
  await settle();
  assert.equal(gates[0].signal.aborted, true, "the superseded provider is told to stop");
  assert.equal(gates[1].signal.aborted, false);
  gates[1].resolve("new");
  await loaded(r);
  assert.deepEqual(calls.map((x) => [x.url, x.auth]), [["https://api.example.com/v1/users/2", "Bearer new"]]);
  gates[0].resolve("old");
  await settle();
  assert.equal(calls.length, 1, "the old one never sends, even when it finally answers");
  r.dispose();
});

test("dispose(), refresh() and unmount abort a pending provider and end loading without waiting for it", async () => {
  const p = hangingProvider();
  const c = createApi({ baseURL: BASE, auth: p.auth });
  stubFetch([json()]);
  const d = c("/a");
  await settle();
  assert.equal(d.loading(), true);
  d.dispose();
  await settle();
  assert.equal(p.seen[0].aborted, true, "dispose aborts");
  assert.equal(d.loading(), false, "loading ends although the provider never answered");
  const r = c("/b");
  await settle();
  r.refresh();
  await settle();
  assert.equal(p.seen[1].aborted, true, "refresh aborts the superseded provider");
  assert.equal(p.seen[2].aborted, false);
  r.dispose();
  let owned;
  const unmount = mount(() => {
    owned = c("/c");
    return html`<p></p>`;
  }, document.createElement("div"));
  await settle();
  unmount();
  await settle();
  assert.equal(p.seen.at(-1).aborted, true, "unmount aborts");
  assert.ok(owned);
  assert.equal(calls.length, 0);
});

test("mutation reset() and unmount abort a pending provider; nothing is sent or reported", async () => {
  const reported = [];
  configure({ onError: (e) => reported.push(e) });
  try {
    const p = hangingProvider();
    const c = createApi({ baseURL: BASE, auth: p.auth });
    stubFetch([json()]);
    const m = c.post("/x", { idempotencyKey: true, retry: 2 });
    const run = m.run({});
    await settle();
    m.reset();
    await run;
    assert.equal(p.seen[0].aborted, true, "reset aborts");
    assert.equal(m.pending(), false);
    let owned;
    const unmount = mount(() => {
      owned = c.post("/y");
      return html`<p></p>`;
    }, document.createElement("div"));
    owned.run({});
    await settle();
    unmount();
    await settle();
    assert.equal(p.seen[1].aborted, true, "unmount aborts");
    assert.equal(calls.length, 0);
    assert.deepEqual(reported, []);
  } finally {
    configure({ onError: null });
  }
});

test("a newer non-exclusive run doesn't abort an older run's provider (unchanged semantics)", async () => {
  const signals = [];
  const c = createApi({ baseURL: BASE, auth: ({ signal }) => (signals.push(signal), Promise.resolve("t")) });
  stubFetch([json()]);
  const m = c.post("/x");
  const a = m.run({ n: 1 });
  const b = m.run({ n: 2 });
  await Promise.all([a, b]);
  assert.ok(signals.every((s) => !s.aborted));
  assert.equal(calls.length, 2);
});

// ---- authTimeout ------------------------------------------------------------------------------------

test("authTimeout: a provider that hangs fails as type auth after the limit — signal aborted, nothing sent, not retried", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  const reported = [];
  configure({ onError: (e) => reported.push(e) });
  try {
    const p = hangingProvider();
    const c = createApi({ baseURL: BASE, auth: p.auth, authTimeout: 5000 });
    stubFetch([json()]);
    const r = c("/me", { retry: 3, timeout: 100 });
    await settle();
    mock.timers.tick(4999);
    await settle();
    assert.equal(r.loading(), true, "not before the limit");
    mock.timers.tick(1);
    await loaded(r);
    assert.equal(r.error().type, "auth");
    assert.equal(r.error().message, "GET request not sent: the auth provider timed out");
    assert.equal(r.error().url, "https://api.example.com/v1/me");
    assert.equal(p.seen[0].aborted, true);
    assert.equal(p.seen[0].reason?.name, "TimeoutError");
    mock.timers.runAll();
    await settle();
    assert.equal(p.seen.length, 1, "not retried: the provider isn't asked again");
    assert.equal(calls.length, 0);
    assert.equal(reported.length, 1);
    const m = c.post("/x", { idempotencyKey: true, retry: 3 });
    const run = m.run({});
    await settle();
    mock.timers.tick(5000);
    await run;
    assert.equal(m.error().type, "auth");
    assert.equal(m.attempt(), 0, "no attempt was made");
    assert.equal(calls.length, 0);
  } finally {
    configure({ onError: null });
  }
});

test("authTimeout: a provider that answers in time is unaffected, and its timer is cleared", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  let signal;
  const c = createApi({ baseURL: BASE, authTimeout: 1000, auth: (ctx) => ((signal = ctx.signal), new Promise((resolve) => setTimeout(() => resolve("in-time"), 999))) });
  stubFetch([json()]);
  const r = c("/me");
  await settle();
  mock.timers.tick(999);
  await loaded(r);
  assert.equal(calls[0].auth, "Bearer in-time");
  mock.timers.tick(10_000);
  await settle();
  assert.equal(signal.aborted, false, "the cleared timer never aborts a finished request");
  assert.equal(r.error(), null);
});

test("authTimeout covers only the provider: the network timeout still times each attempt", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  const c = createApi({ baseURL: BASE, authTimeout: 50, auth: () => "t" });
  globalThis.fetch = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const r = c("/slow", { timeout: 200 });
  await settle();
  mock.timers.tick(200);
  await loaded(r);
  assert.equal(r.error().type, "timeout", "a slow server is a network timeout, not an auth one");
});

test("authTimeout validation: a finite number of ms, 0 = no limit, and only together with auth", () => {
  const ok = (authTimeout) => createApi({ baseURL: BASE, auth: () => "t", authTimeout });
  ok(0);
  ok(1);
  ok(30_000);
  ok(undefined);
  for (const bad of [-1, 1.5e10, Infinity, NaN, "1000", null, true, {}]) assert.throws(() => ok(bad), /authTimeout must be a finite number/, String(bad));
  assert.throws(() => createApi({ baseURL: BASE, authTimeout: 1000 }), /needs auth/);
  assert.throws(() => createApi({ baseURL: BASE, auth: () => "t", timeout: 1000 }), /unsupported option "timeout"/);
});

test("no authTimeout (the default): a slow provider is waited for, as in 0.3.0", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
  const c = createApi({ baseURL: BASE, auth: () => new Promise((resolve) => setTimeout(() => resolve("slow"), 600_000)) });
  stubFetch([json()]);
  const r = c("/me");
  await settle();
  mock.timers.tick(599_999);
  await settle();
  assert.equal(r.loading(), true);
  mock.timers.tick(1);
  await loaded(r);
  assert.equal(calls[0].auth, "Bearer slow");
});

// ---- redaction of an echoed token -------------------------------------------------------------------

test("a token the server echoes back is redacted from problem details and the status text", async () => {
  const T = "tok.ECHOED-4f1a";
  const reported = [];
  configure({ onError: (e) => reported.push(e) });
  try {
    stubFetch([
      () =>
        new Response(JSON.stringify({ type: `https://errors.example/${T}`, title: `Bearer ${T} rejected`, detail: `token ${T} expired; ${T}`, instance: `/sessions/${T}`, status: 401 }), {
          status: 401,
          statusText: `Unauthorized ${T}`,
          headers: { "Content-Type": "application/problem+json" },
        }),
    ]);
    const c = createApi({ baseURL: BASE, auth: () => T });
    const r = await loaded(c("/me", { problemDetails: true }));
    const e = r.error();
    assert.deepEqual({ ...e.problem }, { type: "https://errors.example/[redacted]", title: "Bearer [redacted] rejected", detail: "token [redacted] expired; [redacted]", instance: "/sessions/[redacted]", status: 401 });
    assert.equal(e.statusText, "Unauthorized [redacted]");
    assert.equal(e.message, "GET request failed: 401 Unauthorized [redacted]");
    const dump = JSON.stringify({ m: e.message, s: e.stack, ...e, problem: { ...e.problem }, r: reported.map((x) => ({ m: x.message, ...x, problem: { ...x.problem } })) });
    assert.ok(!dump.includes(T), "the echoed token reached a public surface");
  } finally {
    configure({ onError: null });
  }
});

test("redaction touches only the request's own token: other text, anonymous requests and api() are unchanged", async () => {
  const body = { title: "Bad request", detail: "field tok.OTHER is invalid", status: 422 };
  const answer = () => new Response(JSON.stringify(body), { status: 422, headers: { "Content-Type": "application/problem+json" } });
  stubFetch([answer]);
  const authed = await loaded(createApi({ baseURL: BASE, auth: () => "tok.MINE" })("/x", { problemDetails: true }));
  assert.equal(authed.error().problem.detail, "field tok.OTHER is invalid");
  stubFetch([answer]);
  const anon = await loaded(createApi({ baseURL: BASE, auth: () => null })("/x", { problemDetails: true }));
  assert.equal(anon.error().problem.detail, "field tok.OTHER is invalid");
  stubFetch([answer]);
  const local = await loaded(api("/x", { problemDetails: true }));
  assert.equal(local.error().problem.detail, "field tok.OTHER is invalid");
});

test("SSR: the provider still isn't called, so no signal or timer is created", async () => {
  const saved = globalThis.location;
  globalThis.location = undefined;
  try {
    let n = 0;
    const c = createApi({ baseURL: BASE, auth: () => (n++, "t"), authTimeout: 1000 });
    stubFetch([json()]);
    const r = await loaded(c("/a"));
    assert.equal(r.error().type, "security");
    assert.equal(n, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.location = saved;
  }
});

test("the client exposes neither the provider nor authTimeout", () => {
  const c = createApi({ baseURL: BASE, auth: () => "t", authTimeout: 1000 });
  assert.deepEqual(Object.keys(c).sort(), ["baseURL", "delete", "patch", "post", "put"]);
  assert.equal(c.authTimeout, undefined);
  assert.throws(() => (c.authTimeout = 1), TypeError);
});
