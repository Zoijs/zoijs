// Phase 5 — timeouts, opt-in problem details, `initial` seeding, FormData bodies.
// Timer tests use node:test's fake setTimeout plus a tracker of live timers; everything else
// settles with setImmediate (never faked), so nothing waits on the wall clock.

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { html, mount, createState, configure } from "@zoijs/core";
import { api, ApiError } from "../src/index.js";

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
let calls = [];
function stubFetch(respond = () => json({ ok: true })) {
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init, method: init.method });
    return Promise.resolve().then(() => respond(url, init));
  };
}
// A fetch that only ends when its signal aborts — like a server that never answers.
const hang = (_url, init) =>
  new Promise((_, reject) => {
    if (!init.signal) return;
    init.signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
  });
test.afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
});
const json = (body, status = 200, type = "application/json") => new Response(JSON.stringify(body), { status, headers: { "Content-Type": type } });

// Fake timers, wrapped so we can see which are still pending.
function timers() {
  mock.timers.enable({ apis: ["setTimeout"] });
  const live = new Set();
  const st = globalThis.setTimeout, ct = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => {
    const id = st(() => {
      live.delete(id);
      fn(...args);
    }, ms);
    live.add(id);
    return id;
  };
  globalThis.clearTimeout = (id) => {
    live.delete(id);
    ct(id);
  };
  return { live, tick: (ms) => mock.timers.tick(ms) };
}
const isType = (e, type) => e instanceof ApiError && e.type === type;

// ---- timeouts ------------------------------------------------------------------------------------------

test("GET timeout: aborts the real request and fails with type timeout", async () => {
  const t = timers();
  stubFetch(hang);
  const r = api("/api/slow?cursor=q-secret", { timeout: 1000 });
  await settle();
  t.tick(999);
  await settle();
  assert.equal(r.error(), null);
  t.tick(1);
  await settle();
  const e = r.error();
  assert.ok(isType(e, "timeout"));
  assert.equal(e.message, "GET request timed out");
  assert.equal(e.method, "GET");
  assert.equal(e.status, null);
  assert.equal(e.statusText, "");
  assert.equal(e.url, "https://app.example.com/api/slow");
  assert.equal(calls[0].init.signal.aborted, true, "the fetch itself was aborted — no race left running");
  const dump = JSON.stringify({ m: e.message, ...e, s: String(e) });
  for (const s of ["AbortError", "aborted", "1000", "q-secret"]) assert.ok(!dump.includes(s), s);
  assert.equal(t.live.size, 0);
  r.dispose();
});

test("mutation timeouts: POST/PUT/PATCH/DELETE time out — and are never retried", async () => {
  const t = timers();
  for (const [factory, input] of [[api.post, { a: 1 }], [api.put, { a: 1 }], [api.patch, { a: 1 }], [api.delete, undefined]]) {
    stubFetch(hang);
    const m = factory("/api/orders", { timeout: 500 });
    const p = m.run(input);
    await settle();
    t.tick(500);
    assert.equal(await p, undefined);
    assert.ok(isType(m.error(), "timeout"), m.error()?.message);
    assert.match(m.error().message, /^(POST|PUT|PATCH|DELETE) request timed out$/);
    t.tick(60_000);
    await settle();
    assert.equal(calls.length, 1, "no retry after a timeout");
    assert.equal(t.live.size, 0);
  }
});

test("timeout 0 (and no timeout) means no timer at all", async () => {
  const t = timers();
  stubFetch(hang);
  const r = api("/api/x", { timeout: 0 });
  const m = api.post("/api/x", { timeout: 0 });
  m.run({});
  await settle();
  assert.equal(t.live.size, 0);
  assert.equal(calls[1].init.signal, undefined, "a mutation without timeout gets no signal");
  t.tick(MAX);
  await settle();
  assert.equal(r.error(), null);
  assert.equal(m.error(), null);
  r.dispose();
});
const MAX = 2147483647;

test("invalid timeout values throw a TypeError at the factory", () => {
  stubFetch();
  for (const bad of [-1, NaN, Infinity, -Infinity, "1000", true, false, 10n, {}, [], null, () => 1000, 2 ** 31]) {
    for (const make of [(o) => api("/x", o), (o) => api.post("/x", o), (o) => api.delete("/x", o)]) {
      assert.throws(() => make({ timeout: bad }), (e) => e instanceof TypeError && /timeout must be a finite number of milliseconds from 0 to 2147483647/.test(e.message));
    }
  }
  for (const ok of [0, 1, 10_000, MAX, undefined]) {
    api("/x", { timeout: ok }).dispose();
    api.post("/x", { timeout: ok });
  }
});

test("the timeout timer is cleared after success, HTTP error, network failure and parse error", async () => {
  const t = timers();
  const outcomes = [() => json([1]), () => new Response("", { status: 500 }), () => { throw new TypeError("offline"); }, () => new Response("{x", { headers: { "Content-Type": "application/json" } })];
  for (const respond of outcomes) {
    stubFetch(respond);
    const r = api("/api/x", { timeout: 5000 });
    const m = api.post("/api/x", { timeout: 5000 });
    await m.run({});
    await settle();
    assert.equal(t.live.size, 0, "no timer left behind");
    t.tick(10_000);
    await settle();
    assert.ok(!isType(r.error(), "timeout") && !isType(m.error(), "timeout"));
    r.dispose();
  }
});

test("dispose() mid-flight clears the timeout and isn't a timeout", async () => {
  const t = timers();
  stubFetch(hang);
  const r = api("/api/x", { timeout: 1000 });
  await settle();
  assert.equal(t.live.size, 1);
  r.dispose();
  await settle();
  assert.equal(t.live.size, 0);
  t.tick(5000);
  await settle();
  assert.equal(r.error(), null);
  assert.equal(r.loading(), false);
});

test("a refresh that replaces a request clears its timeout; the replacement isn't a timeout", async () => {
  const t = timers();
  let n = 0;
  stubFetch((url, init) => (++n === 1 ? hang(url, init) : json({ second: true })));
  const r = api("/api/x", { timeout: 1000 });
  await settle();
  t.tick(600);
  r.refresh(); // aborts the first request
  await settle();
  assert.equal(calls[0].init.signal.aborted, true);
  assert.equal(t.live.size, 0, "first timer cleared; the second request already finished");
  t.tick(5000);
  await settle();
  assert.equal(r.error(), null);
  assert.deepEqual(r.data(), { second: true });
  r.dispose();
});

test("unmount aborts without a timeout error or report", async () => {
  const t = timers();
  const reported = [];
  configure({ onError: (e) => reported.push(e) });
  try {
    stubFetch(hang);
    let r;
    const unmount = mount(() => {
      r = api("/api/x", { timeout: 1000 });
      return html`<p></p>`;
    }, document.createElement("div"));
    await settle();
    unmount();
    await settle();
    t.tick(5000);
    await settle();
    assert.equal(r.error(), null);
    assert.deepEqual(reported, []);
    assert.equal(t.live.size, 0);
  } finally {
    configure({ onError: null });
  }
});

test("debounce time is not part of the timeout: the clock starts when fetch starts", async () => {
  const t = timers();
  let n = 0;
  stubFetch((url, init) => (++n === 1 ? json([]) : hang(url, init)));
  const q = createState("a");
  const r = api("/api/search", { query: () => ({ q: q.get() }), debounce: 250, timeout: 100 });
  await settle();
  q.set("ab");
  await settle();
  t.tick(249);
  await settle();
  assert.equal(calls.length, 1, "still debouncing — no fetch, no timeout clock");
  t.tick(1);
  await settle();
  assert.equal(calls.length, 2, "fetch starts after the debounce");
  t.tick(99);
  await settle();
  assert.equal(r.error(), null, "250 ms of debounce + 99 ms of fetch: not timed out");
  t.tick(1);
  await settle();
  assert.ok(isType(r.error(), "timeout"));
  r.dispose();
});

test("refresh() uses the configured timeout", async () => {
  const t = timers();
  let n = 0;
  stubFetch((url, init) => (++n === 1 ? json([]) : hang(url, init)));
  const r = api("/api/x", { timeout: 300 });
  await settle();
  r.refresh();
  await settle();
  t.tick(300);
  await settle();
  assert.ok(isType(r.error(), "timeout"));
  r.dispose();
});

// ---- problem details ------------------------------------------------------------------------------------------

const PROBLEM = { type: "https://example.com/probs/out-of-credit", title: "You do not have enough credit.", status: 403, detail: "Your balance is 30, but that costs 50.", instance: "/account/12345/msgs/abc", balance: 30, accounts: ["/account/12345"] };
const problem = (body, status = 403, type = "application/problem+json") => () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, statusText: "Forbidden", headers: { "Content-Type": type } });

test("by default an error body stays private — even problem+json", async () => {
  stubFetch(problem(PROBLEM));
  const r = api("/api/x");
  const m = api.post("/api/x");
  await m.run({});
  await settle();
  for (const e of [r.error(), m.error()]) {
    assert.ok(isType(e, "http"));
    assert.equal(e.problem, null);
    const dump = JSON.stringify({ m: e.message, ...e, s: String(e), c: String(e.cause) });
    for (const s of ["credit", "balance", "30", "12345"]) assert.ok(!dump.includes(s), s);
  }
  r.dispose();
});

test("problemDetails: true exposes only the five standard members, typed, frozen, never in the message", async () => {
  stubFetch(problem(PROBLEM));
  const r = api("/api/x", { problemDetails: true });
  await settle();
  const e = r.error();
  assert.equal(e.type, "http");
  assert.equal(e.status, 403);
  assert.equal(e.message, "GET request failed: 403 Forbidden");
  assert.deepEqual(e.problem, { type: PROBLEM.type, title: PROBLEM.title, status: 403, detail: PROBLEM.detail, instance: PROBLEM.instance });
  assert.ok(Object.isFrozen(e.problem));
  assert.equal(e.problem.balance, undefined, "extension members are ignored");
  assert.ok(!e.message.includes("credit"));
  r.dispose();
});

test("problem members with the wrong type are dropped; charset parameters are fine", async () => {
  stubFetch(problem({ type: 1, title: ["x"], status: "403", detail: { html: "<b>x</b>" }, instance: null }, 400, "Application/Problem+JSON; charset=utf-8"));
  const r = api("/api/x", { problemDetails: true });
  await settle();
  assert.deepEqual(r.error().problem, {});
  stubFetch(problem({ status: 403.5, title: "t" }, 400));
  const r2 = api("/api/x", { problemDetails: true });
  await settle();
  assert.deepEqual(r2.error().problem, { title: "t" }, "status must be an integer");
  r.dispose();
  r2.dispose();
});

test("only application/problem+json is read — not application/json or other error bodies", async () => {
  for (const type of ["application/json", "text/plain", "application/vnd.error+json", "text/html"]) {
    stubFetch(problem(PROBLEM, 400, type));
    const r = api("/api/x", { problemDetails: true });
    await settle();
    assert.equal(r.error().problem, null, type);
    r.dispose();
  }
});

test("malformed, non-object or oversized problem bodies leave a plain HTTP error", async () => {
  const big = JSON.stringify({ title: "x".repeat(70 * 1024) });
  const cases = [
    problem("{not json", 422),
    problem("[1,2]", 422),
    problem("null", 422),
    problem('"just a string"', 422),
    () => new Response(big, { status: 413, headers: { "Content-Type": "application/problem+json" } }), // actual size over the limit
    () => new Response(JSON.stringify({ title: "small" }), { status: 413, headers: { "Content-Type": "application/problem+json", "Content-Length": String(1024 * 1024) } }), // declared size over the limit
  ];
  for (const respond of cases) {
    stubFetch(respond);
    const r = api("/api/x", { problemDetails: true });
    await settle();
    assert.equal(r.error().type, "http", "the HTTP failure stands — never replaced by parse");
    assert.equal(r.error().problem, null);
    r.dispose();
  }
  const atLimit = JSON.stringify({ title: "y".repeat(64 * 1024 - 20) });
  assert.ok(Buffer.byteLength(atLimit) <= 64 * 1024);
  stubFetch(() => new Response(atLimit, { status: 400, headers: { "Content-Type": "application/problem+json" } }));
  const ok = api("/api/x", { problemDetails: true });
  await settle();
  assert.equal(ok.error().problem.title.length, 64 * 1024 - 20, "up to 64 KB is read");
  ok.dispose();
});

test("problem details can't pollute prototypes or smuggle extra keys", async () => {
  stubFetch(problem('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"title":"t"}', 400));
  const r = api("/api/x", { problemDetails: true });
  await settle();
  assert.deepEqual(Object.keys(r.error().problem), ["title"]);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(r.error().problem), Object.prototype);
  r.dispose();
});

test("a 2xx problem+json response is data, as before; mutations opt in the same way", async () => {
  stubFetch(() => json({ title: "fine" }, 200, "application/problem+json"));
  const r = api("/api/x", { problemDetails: true });
  await settle();
  assert.deepEqual(r.data(), { title: "fine" });
  r.dispose();
  stubFetch(problem({ title: "Invalid email", detail: "email must contain @", status: 422 }, 422));
  const m = api.post("/api/users", { problemDetails: true });
  await m.run({ email: "x" });
  assert.deepEqual(m.error().problem, { title: "Invalid email", detail: "email must contain @", status: 422 });
  assert.equal(m.error().message.includes("email"), false);
});

test("problem detail renders as text, never HTML", async () => {
  stubFetch(problem({ detail: '<img src=x onerror="globalThis.__pwned=1">' }, 400));
  const host = document.createElement("div");
  let r;
  const unmount = mount(() => {
    r = api("/api/x", { problemDetails: true });
    return html`<p>${() => r.error()?.problem?.detail ?? ""}</p>`;
  }, host);
  await settle();
  assert.equal(host.querySelector("img"), null);
  assert.equal(host.querySelector("p").textContent, '<img src=x onerror="globalThis.__pwned=1">');
  assert.equal(globalThis.__pwned, undefined);
  unmount();
});

test("problemDetails must be a boolean", () => {
  for (const bad of ["yes", 1, {}, () => true, null]) {
    assert.throws(() => api("/x", { problemDetails: bad }), /problemDetails must be true or false/);
    assert.throws(() => api.post("/x", { problemDetails: bad }), /problemDetails must be true or false/);
  }
});

// ---- initial ---------------------------------------------------------------------------------------------------

test("initial: starts settled with the seed and sends no request; refresh() fetches", async () => {
  stubFetch(() => json(["fresh"]));
  const seed = [{ id: 1 }];
  const users = api("/api/users", { initial: seed });
  assert.equal(users.data(), seed, "the same reference — not cloned");
  assert.equal(users.loading(), false);
  assert.equal(users.error(), null);
  await settle();
  assert.equal(calls.length, 0);
  users.refresh();
  await settle();
  assert.deepEqual(users.data(), ["fresh"]);
  users.dispose();
});

test("initial: the key's presence counts — undefined and null are valid seeds", async () => {
  stubFetch();
  const a = api("/api/a", { initial: undefined });
  const b = api("/api/b", { initial: null });
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(a.data(), undefined);
  assert.equal(a.loading(), false);
  assert.equal(b.data(), null);
  const c = api("/api/c", {});
  await settle();
  assert.equal(calls.length, 1, "no initial key → loads");
  for (const r of [a, b, c]) r.dispose();
});

test("initial with reactive params: the seed covers the first URL; later changes fetch", async () => {
  stubFetch((url) => json({ url }));
  const id = createState("1");
  const user = api("/api/users/:id", { initial: { id: "1", seeded: true }, params: () => ({ id: id.get() }) });
  await settle();
  assert.equal(calls.length, 0);
  assert.deepEqual(user.data(), { id: "1", seeded: true });
  id.set("1"); // no change
  await settle();
  assert.equal(calls.length, 0);
  id.set("2");
  await settle();
  assert.deepEqual(calls.map((c) => c.url), ["https://app.example.com/api/users/2"]);
  id.set("1"); // back to the seeded URL: a real request now (the seed is no longer current)
  await settle();
  assert.equal(calls.length, 2);
  user.dispose();
});

test("initial with a reactive, debounced query", async () => {
  const t = timers();
  stubFetch((url) => json({ url }));
  const q = createState("");
  const r = api("/api/search", { initial: [], query: () => ({ q: q.get() }), debounce: 200 });
  await settle();
  assert.equal(calls.length, 0);
  q.set("zoijs");
  await settle();
  t.tick(200);
  await settle();
  assert.deepEqual(calls.map((c) => c.url), ["https://app.example.com/api/search?q=zoijs"]);
  r.dispose();
});

test("on the server (no page origin) an initial resource is created without fetching; refresh() is refused", async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "location");
  const reported = [];
  configure({ onError: (e) => reported.push(e) });
  try {
    Object.defineProperty(globalThis, "location", { value: undefined, configurable: true, writable: true });
    stubFetch();
    const users = api("/api/users", { initial: [{ id: 1 }] });
    await settle();
    assert.equal(calls.length, 0);
    assert.equal(users.error(), null);
    assert.deepEqual(reported, [], "nothing to report during SSR");
    users.refresh();
    await settle();
    assert.equal(users.error().type, "security");
    assert.match(users.error().message, /needs an http\(s\) page origin/);
    assert.equal(calls.length, 0);
    users.dispose();
  } finally {
    Object.defineProperty(globalThis, "location", saved);
    configure({ onError: null });
  }
});

test("initial is resource-only: every mutation factory refuses it", () => {
  for (const make of [api.post, api.put, api.patch, api.delete]) {
    assert.throws(() => make("/x", { initial: {} }), /initial is for api\(\) resources/);
  }
});

test("initial data stays ordinary data: rendered as text, never merged", async () => {
  const seed = { name: "<script>globalThis.__pwned2=1</script>" };
  const host = document.createElement("div");
  let r;
  const unmount = mount(() => {
    r = api("/api/me", { initial: seed });
    return html`<p>${() => r.data().name}</p>`;
  }, host);
  assert.equal(host.querySelector("script"), null);
  assert.equal(host.textContent, seed.name);
  assert.equal(globalThis.__pwned2, undefined);
  assert.deepEqual(Object.keys(seed), ["name"]);
  unmount();
});

// ---- FormData --------------------------------------------------------------------------------------------------

test("FormData goes to fetch as-is, with no Content-Type (the browser writes the boundary)", async () => {
  stubFetch(() => json({ ok: 1 }, 201));
  const form = new FormData();
  form.append("description", "Profile photo");
  form.append("file", new Blob(["fake-bytes"], { type: "image/png" }), "me.png");
  const upload = api.post("/upload");
  await upload.run(form);
  const c = calls[0];
  assert.equal(c.init.body, form, "the same object — not cloned or serialized");
  assert.deepEqual(Object.keys(c.init.headers), ["Accept"]);
  assert.equal(upload.done(), true);
});

test("Content-Type: JSON body → application/json; FormData → none; no body → none", async () => {
  stubFetch();
  const m = api.post("/x");
  await m.run({ a: 1 });
  await m.run(new FormData());
  await m.run();
  assert.deepEqual(calls.map((c) => c.init.headers["Content-Type"] ?? null), ["application/json", null, null]);
});

test("FormData in { params, body } with the same strict params rules; PUT/PATCH too", async () => {
  stubFetch();
  const form = new FormData();
  form.append("f", "1");
  const upload = api.post("/users/:id/photo");
  await upload.run({ params: { id: "a/b" }, body: form });
  assert.equal(calls[0].url, "https://app.example.com/users/a%2Fb/photo");
  assert.equal(calls[0].init.body, form);
  await upload.run({ params: { id: ".." }, body: form });
  assert.equal(upload.error().type, "config");
  assert.equal(calls.length, 1);
  await api.put("/files/:n").run({ params: { n: 1 }, body: form });
  await api.patch("/files").run(form);
  assert.deepEqual(calls.slice(1).map((c) => [c.method, c.init.body === form]), [["PUT", true], ["PATCH", true]]);
});

test("FormData uploads invalidate and stay exclusive without cloning the form", async () => {
  stubFetch((url, init) => (init.method === "GET" ? json({ photo: calls.length }) : json({ ok: 1 }, 201)));
  const profile = api("/users/:id", { params: { id: 7 } });
  await settle();
  const upload = api.post("/users/:id/photo", { invalidate: profile, exclusive: true });
  const form = new FormData();
  const [a, b] = await Promise.all([upload.run({ params: { id: 7 }, body: form }), upload.run({ params: { id: 7 }, body: form })]);
  await settle();
  const posts = calls.filter((c) => c.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].init.body, form);
  assert.deepEqual(a, b);
  assert.equal(calls.filter((c) => c.method === "GET").length, 2, "one invalidation refresh");
  profile.dispose();
});

test("look-alike, spoofed and other body types are refused before any request", async () => {
  stubFetch();
  const m = api.post("/x");
  class FakeForm { append() {} entries() { return [][Symbol.iterator](); } has() { return false; } }
  const bad = [
    Object.create(FormData.prototype), // passes instanceof, fails the brand check
    new FakeForm(),
    { append() {}, entries() {} },
    new Blob(["x"]),
    new ArrayBuffer(4),
    new Uint8Array(4),
    new URLSearchParams("a=1"),
    new ReadableStream(),
    { file: new FormData() }, // a FormData nested in JSON
    [new FormData()],
  ];
  for (const body of bad) {
    calls = [];
    await m.run(body);
    assert.ok(isType(m.error(), "config"), Object.prototype.toString.call(body));
    assert.match(m.error().message, /can't be sent as JSON/);
  }
  assert.equal(calls.length, 0);
  const del = api.delete("/x/:id");
  await del.run({ params: { id: 1 }, body: new FormData() });
  assert.ok(isType(del.error(), "config"), "DELETE still sends no body");
});

test("FormData failures are ordinary http/network/timeout errors that never mention fields", async () => {
  const t = timers();
  const form = new FormData();
  form.append("ssn-field", "ssn-secret-value");
  for (const [respond, type] of [[() => new Response("", { status: 413, statusText: "Payload Too Large" }), "http"], [() => { throw new TypeError("network ssn-field"); }, "network"], [hang, "timeout"]]) {
    stubFetch(respond);
    const upload = api.post("/upload", { timeout: 1000 });
    const p = upload.run(form);
    await settle();
    t.tick(1000);
    await p;
    assert.equal(upload.error().type, type);
    const dump = JSON.stringify({ m: upload.error().message, ...upload.error() });
    assert.ok(!dump.includes("ssn-field") && !dump.includes("ssn-secret-value"), type);
  }
});

test("a FormData from a different implementation (jsdom) is not trusted — real cross-realm is a browser test", async () => {
  const { JSDOM } = await import("jsdom");
  // Node's FormData is the one fetch uses; a jsdom realm's FormData is a different class, and
  // fails our brand check — as it should: only FormData the platform fetch accepts is sent as-is.
  const other = new JSDOM("").window;
  stubFetch();
  const m = api.post("/x");
  await m.run(new other.FormData());
  assert.equal(m.error()?.type, "config", "a foreign-implementation FormData isn't trusted");
  assert.equal(calls.length, 0);
});
