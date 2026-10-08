// Phase 3 — dispose(), debounce, reactive params and query arrays.
// Debounce tests use node:test's fake setTimeout; everything else settles with setImmediate, which
// is never faked, so no test waits on the wall clock.

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { html, mount, createState, configure } from "@zoijs/core";
import { attachInspector } from "@zoijs/core/devtools";
import { api, ApiError } from "../src/index.js";

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
const realFetch = globalThis.fetch;
let calls = [];
function stubFetch(respond = (url) => json({ url })) {
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve().then(() => respond(url, init));
  };
}
test.afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
});
const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const urls = () => calls.map((c) => c.url.replace("https://app.example.com", ""));
const fakeTimers = () => mock.timers.enable({ apis: ["setTimeout"] });
const isConfig = (re) => (e) => e instanceof ApiError && e.type === "config" && (!re || re.test(e.message));

function inComponent(setup) {
  let out;
  const unmount = mount(() => {
    out = setup();
    return html`<p></p>`;
  }, document.createElement("div"));
  return { ...out, unmount };
}

// Counts live reactive nodes created while `fn` runs (computed + effect), via the devtools hook.
function tracking() {
  const live = new Set();
  const detach = attachInspector({
    onCreate: (n, kind) => (kind === "computed" || kind === "effect") && live.add(n),
    onRun() {},
    onWrite() {},
    onDispose: (n) => live.delete(n),
  });
  return { live, detach };
}

// ---- dispose() --------------------------------------------------------------------------------------

test("dispose() exists and refresh() after it throws a config ApiError (no request)", async () => {
  stubFetch();
  const r = api("/api/users");
  assert.equal(typeof r.dispose, "function");
  await settle();
  r.dispose();
  assert.throws(() => r.refresh(), isConfig(/^GET request not sent: refresh\(\) was called after dispose\(\)$/));
  await settle();
  assert.equal(calls.length, 1);
  assert.deepEqual(r.data(), { url: "https://app.example.com/api/users" }, "keeps its last data");
});

test("dispose() aborts the in-flight request; it settles quietly with the data it had", async () => {
  const reported = [];
  configure({ onError: (e) => reported.push(e) });
  try {
    stubFetch((_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const r = api("/api/slow");
    await settle();
    assert.equal(r.loading(), true);
    r.dispose();
    assert.equal(calls[0].init.signal.aborted, true);
    await settle();
    assert.equal(r.loading(), false);
    assert.equal(r.error(), null);
    assert.equal(r.data(), undefined);
    assert.deepEqual(reported, []);
  } finally {
    configure({ onError: null });
  }
});

test("a response that lands after dispose() doesn't update the data", async () => {
  let resolveIt;
  stubFetch(() => new Promise((resolve) => (resolveIt = resolve)));
  const r = api("/api/x");
  await settle();
  r.dispose();
  resolveIt(json({ late: true }));
  await settle();
  assert.equal(r.data(), undefined);
});

test("dispose() stops query and params tracking — later state changes request nothing", async () => {
  const t = tracking();
  try {
    stubFetch();
    const q = createState("a");
    const id = createState("1");
    const r = api("/api/users/:id", { params: () => ({ id: id.get() }), query: () => ({ q: q.get() }) });
    await settle();
    assert.ok(t.live.size >= 3, "scope + computed + tracker");
    r.dispose();
    assert.equal(t.live.size, 0, "every computed/effect api() created left the graph");
    q.set("b");
    id.set("2");
    await settle();
    assert.deepEqual(urls(), ["/api/users/1?q=a"]);
  } finally {
    t.detach();
  }
});

test("dispose() twice is safe; dispose() inside a component, then unmount, is safe", async () => {
  stubFetch();
  const q = createState("a");
  const r = api("/s", { query: () => ({ q: q.get() }) });
  r.dispose();
  r.dispose();
  const errors = [];
  configure({ onError: (e) => errors.push(e) });
  const originalError = console.error;
  console.error = (...a) => errors.push(a);
  try {
    const c = inComponent(() => ({ r: api("/s", { query: () => ({ q: q.get() }) }) }));
    await settle();
    c.r.dispose();
    c.unmount();
    c.r.dispose();
    q.set("z");
    await settle();
    assert.deepEqual(errors, []);
    assert.deepEqual(urls(), ["/s?q=a", "/s?q=a"]);
  } finally {
    console.error = originalError;
    configure({ onError: null });
  }
});

test("component cleanup still disposes everything without dispose()", async () => {
  const t = tracking();
  try {
    stubFetch();
    const q = createState("a");
    const c = inComponent(() => ({ r: api("/s", { query: () => ({ q: q.get() }), debounce: 50 }) }));
    await settle();
    assert.ok(t.live.size > 0);
    c.unmount();
    assert.equal(t.live.size, 0);
    q.set("b");
    await settle();
    assert.equal(calls.length, 1);
  } finally {
    t.detach();
  }
});

test("a static api() creates no computed or effect, even with debounce", async () => {
  const t = tracking();
  try {
    stubFetch();
    fakeTimers();
    const r = api("/api/users", { params: undefined, query: { page: 1, tag: ["a"] }, debounce: 250 });
    assert.equal(t.live.size, 0);
    await settle();
    assert.deepEqual(urls(), ["/api/users?page=1&tag=a"]);
    r.refresh();
    await settle();
    assert.equal(calls.length, 2, "refresh() isn't debounced");
    r.dispose();
  } finally {
    t.detach();
  }
});

// ---- debounce ---------------------------------------------------------------------------------------

test("debounce: the first request is immediate; later changes wait for quiet", async () => {
  fakeTimers();
  stubFetch();
  const q = createState("");
  const r = api("/api/search", { query: () => ({ q: q.get() }), debounce: 250 });
  await settle();
  assert.deepEqual(urls(), ["/api/search?q="], "initial load isn't debounced");
  q.set("a");
  await settle();
  mock.timers.tick(100);
  q.set("ab");
  await settle();
  mock.timers.tick(100);
  q.set("abc");
  await settle();
  mock.timers.tick(100);
  q.set("abcd");
  await settle();
  mock.timers.tick(249);
  await settle();
  assert.equal(calls.length, 1, "still quiet-waiting");
  mock.timers.tick(1);
  await settle();
  assert.deepEqual(urls(), ["/api/search?q=", "/api/search?q=abcd"], "one request, latest value");
  assert.equal(r.data().url, "https://app.example.com/api/search?q=abcd");
  r.dispose();
});

test("debounce: a single change fires after the interval", async () => {
  fakeTimers();
  stubFetch();
  const q = createState("x");
  const r = api("/s", { query: () => ({ q: q.get() }), debounce: 500 });
  await settle();
  q.set("y");
  await settle();
  mock.timers.tick(499);
  await settle();
  assert.equal(calls.length, 1);
  mock.timers.tick(1);
  await settle();
  assert.deepEqual(urls(), ["/s?q=x", "/s?q=y"]);
  r.dispose();
});

test("debounce: returning to the requested value cancels the pending refetch", async () => {
  fakeTimers();
  stubFetch();
  const q = createState("a");
  const r = api("/s", { query: () => ({ q: q.get() }), debounce: 250 });
  await settle();
  q.set("ab");
  await settle();
  q.set("a");
  await settle();
  mock.timers.tick(1000);
  await settle();
  assert.equal(calls.length, 1);
  r.dispose();
});

test("debounce: params and query share one window and one request", async () => {
  fakeTimers();
  stubFetch();
  const id = createState("42");
  const page = createState(1);
  const r = api("/users/:id/activity", { params: () => ({ id: id.get() }), query: () => ({ page: page.get() }), debounce: 250 });
  await settle();
  id.set("43");
  await settle();
  mock.timers.tick(200);
  page.set(2);
  await settle();
  mock.timers.tick(200);
  await settle();
  assert.equal(calls.length, 1, "the window restarted on the second change");
  mock.timers.tick(50);
  await settle();
  assert.deepEqual(urls(), ["/users/42/activity?page=1", "/users/43/activity?page=2"]);
  r.dispose();
});

test("debounce: 0 refetches without a timer, like no debounce", async () => {
  fakeTimers();
  stubFetch();
  const q = createState("a");
  const r = api("/s", { query: () => ({ q: q.get() }), debounce: 0 });
  await settle();
  q.set("b");
  await settle();
  assert.deepEqual(urls(), ["/s?q=a", "/s?q=b"], "no tick needed");
  r.dispose();
});

test("debounce: invalid values throw a TypeError at api()", () => {
  stubFetch();
  for (const bad of [-1, -0.5, NaN, Infinity, -Infinity, "250", { ms: 250 }, [250], null, true, 2 ** 31, 10n]) {
    assert.throws(() => api("/s", { query: () => ({}), debounce: bad }), (e) => e instanceof TypeError && /debounce must be a finite number of milliseconds/.test(e.message), String(bad));
  }
  for (const ok of [0, 1, 250, 0.5, 2147483647, undefined]) api("/s", { debounce: ok }).dispose();
});

test("debounce: refresh() bypasses it, uses the latest values, and cancels the pending refetch", async () => {
  fakeTimers();
  stubFetch();
  const q = createState("a");
  const r = api("/s", { query: () => ({ q: q.get() }), debounce: 250 });
  await settle();
  q.set("ab");
  await settle(); // a refetch is now pending
  r.refresh();
  await settle();
  assert.deepEqual(urls(), ["/s?q=a", "/s?q=ab"], "immediately, with the latest value");
  mock.timers.tick(1000);
  await settle();
  assert.equal(calls.length, 2, "the pending automatic refetch was cancelled — no duplicate");
  q.set("abc");
  r.refresh(); // before the tracker even ran
  await settle();
  mock.timers.tick(1000);
  await settle();
  assert.deepEqual(urls(), ["/s?q=a", "/s?q=ab", "/s?q=abc"]);
  r.dispose();
});

test("debounce: unmount and dispose() clear the pending timer; no timer after disposal", async () => {
  fakeTimers();
  stubFetch();
  const q = createState("a");
  const c = inComponent(() => ({ r: api("/s", { query: () => ({ q: q.get() }), debounce: 250 }) }));
  const r = api("/t", { query: () => ({ q: q.get() }), debounce: 250 });
  await settle();
  q.set("b");
  await settle(); // both have a pending timer
  c.unmount();
  r.dispose();
  mock.timers.tick(1000);
  await settle();
  q.set("c");
  await settle();
  mock.timers.tick(1000);
  await settle();
  assert.deepEqual(urls().sort(), ["/s?q=a", "/t?q=a"]);
});

test("debounce: a stale response can't overwrite the current data", async () => {
  fakeTimers();
  const pending = [];
  stubFetch((url) => new Promise((resolve) => pending.push({ url, resolve })));
  const q = createState("a");
  const r = api("/s", { query: () => ({ q: q.get() }), debounce: 100 });
  await settle();
  q.set("b");
  await settle();
  mock.timers.tick(100);
  await settle();
  assert.equal(pending.length, 2);
  assert.equal(calls[0].init.signal.aborted, true);
  pending[1].resolve(json({ q: "b" }));
  await settle();
  pending[0].resolve(json({ q: "a" }));
  await settle();
  assert.deepEqual(r.data(), { q: "b" });
  r.dispose();
});

// ---- reactive params ----------------------------------------------------------------------------------------

test("reactive params: initial value, then a change refetches with the new path", async () => {
  stubFetch();
  const id = createState("1");
  const user = api("/users/:id", { params: () => ({ id: id.get() }) });
  await settle();
  id.set("2");
  await settle();
  assert.deepEqual(urls(), ["/users/1", "/users/2"]);
  assert.equal(user.data().url, "https://app.example.com/users/2");
  user.dispose();
});

test("reactive params: values are encoded exactly like static ones", async () => {
  stubFetch();
  const v = createState("plain");
  const r = api("/api/files/:name/meta", { params: () => ({ name: v.get() }) });
  await settle();
  const cases = [[42, "42"], [7n, "7"], [true, "true"], ["café ✓", "caf%C3%A9%20%E2%9C%93"], ["abc/123", "abc%2F123"], ["../../admin", "..%2F..%2Fadmin"], ["%2e%2e", "%252e%252e"], ["a?b#c", "a%3Fb%23c"]];
  for (const [value] of cases) {
    v.set(value);
    await settle();
  }
  assert.deepEqual(urls(), ["/api/files/plain/meta", ...cases.map(([, enc]) => `/api/files/${enc}/meta`)]);
  for (const c of calls) assert.ok(new URL(c.url).pathname.startsWith("/api/files/") && new URL(c.url).pathname.split("/").length === 5);
  r.dispose();
});

test("reactive params: an invalid value later is a config error — no request, no value in the message, recovers", async () => {
  const reported = [];
  configure({ onError: (e, info) => reported.push({ e, info }) });
  try {
    stubFetch();
    const id = createState("1");
    const r = api("/users/:id", { params: () => ({ id: id.get() }) });
    await settle();
    for (const bad of ["..", ".", "", { secret: "obj-SECRET" }, null, undefined, NaN, ["a"]]) {
      id.set(bad);
      await settle();
      assert.ok(isConfig()(r.error()), String(bad));
      assert.match(r.error().message, /^GET request not sent: params\.id /);
      assert.ok(!r.error().message.includes("obj-SECRET") && !r.error().message.includes("[object"));
    }
    assert.equal(calls.length, 1, "no request with an invalid param");
    assert.ok(reported.every((x) => x.info.kind === "resource" && x.e.type === "config"));
    id.set("2");
    await settle();
    assert.equal(r.error(), null);
    assert.deepEqual(urls(), ["/users/1", "/users/2"]);
    r.dispose();
  } finally {
    configure({ onError: null });
  }
});

test("reactive params: missing and extra keys, and a throwing function, are config errors", async () => {
  stubFetch();
  const mode = createState("ok");
  const boom = new Error("boom");
  const r = api("/users/:id", {
    params: () => {
      const m = mode.get();
      if (m === "throw") throw boom;
      return m === "missing" ? {} : m === "extra" ? { id: 1, userId: 1 } : { id: 1 };
    },
  });
  await settle();
  mode.set("missing");
  await settle();
  assert.ok(isConfig(/params\.id is missing/)(r.error()));
  mode.set("extra");
  await settle();
  assert.ok(isConfig(/params\.userId isn't used/)(r.error()));
  mode.set("throw");
  await settle();
  assert.ok(isConfig(/the params function threw/)(r.error()));
  assert.equal(r.error().cause, boom);
  assert.equal(calls.length, 1);
  r.dispose();
});

test("reactive params: refresh() uses the current value", async () => {
  stubFetch();
  const id = createState("1");
  const r = api("/users/:id", { params: () => ({ id: id.get() }) });
  await settle();
  id.set("9");
  r.refresh();
  await settle();
  assert.deepEqual(urls(), ["/users/1", "/users/9"], "current value, no duplicate from the tracker");
  r.dispose();
});

test("reactive params + query: either change rebuilds the URL; one batch → one request", async () => {
  stubFetch();
  const id = createState("42");
  const page = createState(1);
  const r = api("/users/:id/activity", { params: () => ({ id: id.get() }), query: () => ({ page: page.get() }) });
  await settle();
  page.set(2);
  await settle();
  id.set("43");
  await settle();
  id.set("44");
  page.set(3);
  await settle();
  assert.deepEqual(urls(), ["/users/42/activity?page=1", "/users/42/activity?page=2", "/users/43/activity?page=2", "/users/44/activity?page=3"]);
  r.dispose();
});

test("reactive params with static query, and static params with reactive query", async () => {
  stubFetch();
  const id = createState("1");
  const q = createState("x");
  const a = api("/u/:id", { params: () => ({ id: id.get() }), query: { tab: "home" } });
  const b = api("/u/:id", { params: { id: "fixed" }, query: () => ({ q: q.get() }) });
  await settle();
  id.set("2");
  q.set("y");
  await settle();
  assert.deepEqual(urls().sort(), ["/u/1?tab=home", "/u/2?tab=home", "/u/fixed?q=x", "/u/fixed?q=y"]);
  a.dispose();
  b.dispose();
});

test("static params still throw at api(); the template's placeholder syntax is checked once, up front", () => {
  stubFetch();
  assert.throws(() => api("/users/:id", { params: {} }), TypeError);
  assert.throws(() => api("/users/:id?", { params: () => ({ id: 1 }) }), /unsupported placeholder/);
  assert.throws(() => api("/x?token=1", { params: () => ({}) }), /names a secret/);
  assert.equal(calls.length, 0);
});

test("unmount stops reactive params tracking", async () => {
  stubFetch();
  const id = createState("1");
  const c = inComponent(() => ({ r: api("/users/:id", { params: () => ({ id: id.get() }) }) }));
  await settle();
  c.unmount();
  id.set("2");
  await settle();
  assert.deepEqual(urls(), ["/users/1"]);
});

// ---- query arrays ---------------------------------------------------------------------------------------------

async function query(q, url = "/p") {
  stubFetch();
  const r = api(url, { query: q });
  await settle();
  r.dispose();
  return urls()[0];
}

test("arrays are repeated keys: strings, '', numbers, booleans, bigints; null/undefined skipped", async () => {
  assert.equal(await query({ tag: ["security", "javascript"] }), "/p?tag=security&tag=javascript");
  assert.equal(await query({ tag: [""] }), "/p?tag=");
  assert.equal(await query({ n: [1, 2] }), "/p?n=1&n=2");
  assert.equal(await query({ b: [true, false] }), "/p?b=true&b=false");
  assert.equal(await query({ big: [1n, 2n] }), "/p?big=1&big=2");
  assert.equal(await query({ tag: ["a", null, "b", undefined] }), "/p?tag=a&tag=b");
  assert.equal(await query({ tag: [], page: 1 }), "/p?page=1", "[] contributes no value");
  assert.equal(await query({ tag: [null, undefined] }), "/p");
  // eslint-disable-next-line no-sparse-arrays
  assert.equal(await query({ tag: ["a", , "b"] }), "/p?tag=a&tag=b", "holes read as undefined");
});

test("arrays replace every existing value for the key; [] clears it; null leaves it", async () => {
  assert.equal(await query({ tag: ["a", "b"] }, "/products?tag=old"), "/products?tag=a&tag=b");
  assert.equal(await query({ tag: ["a"] }, "/products?tag=old&x=1&tag=older"), "/products?x=1&tag=a");
  assert.equal(await query({ tag: [] }, "/products?tag=old&x=1"), "/products?x=1");
  assert.equal(await query({ tag: null }, "/products?tag=old"), "/products?tag=old");
});

test("array elements are encoded individually — delimiters can't inject parameters", async () => {
  const values = ["a&b=c", "x,y", "1;2", "?#", "a b", "✓", "%2C", "tag=evil"];
  const url = await query({ tag: values, other: "1" });
  const parsed = new URL(url, "https://app.example.com");
  assert.deepEqual(parsed.searchParams.getAll("tag"), values);
  assert.deepEqual([...new Set(parsed.searchParams.keys())], ["tag", "other"]);
  assert.ok(!url.includes("#"));
});

test("nested arrays, objects and unsupported elements are refused", () => {
  stubFetch();
  const bad = [[["a"]], [{ name: "a" }], [NaN], [Infinity], [Symbol("s")], [() => 1], [new Date(0)], [[]]];
  bad.forEach((value, i) => {
    assert.throws(() => api("/p", { query: { filter: value } }), (e) => e instanceof TypeError && /query\.filter\[\d+\]/.test(e.message), `case ${i}`);
  });
  assert.equal(calls.length, 0);
});

test("secret-looking keys are refused whatever the value type", () => {
  stubFetch();
  for (const key of ["token", "TOKEN", "access_token", "apiKey", "password", "client_secret", "Authorization"]) {
    assert.throws(() => api("/x", { query: { [key]: ["a", "b"] } }), /names a secret/, key);
    assert.throws(() => api("/x", { query: { [key]: [] } }), /names a secret/, key);
  }
  assert.equal(calls.length, 0);
});

test("frozen caller arrays are read, not mutated", async () => {
  const tags = Object.freeze(["a", "b"]);
  const q = Object.freeze({ tag: tags });
  assert.equal(await query(q), "/p?tag=a&tag=b");
  assert.deepEqual(tags, ["a", "b"]);
});

test("reactive arrays: changing the selection refetches; a bad element is a config error", async () => {
  stubFetch();
  const tags = createState(["a"]);
  const r = api("/p", { query: () => ({ tag: tags.get() }) });
  await settle();
  tags.set(["a", "b"]);
  await settle();
  tags.set(["a", "b"]); // a new array with the same values: same URL, no request
  await settle();
  tags.set([{ x: 1 }]);
  await settle();
  assert.ok(isConfig(/query\.tag\[0\]/)(r.error()));
  assert.ok(!r.error().message.includes("[object"));
  tags.set([]);
  await settle();
  assert.deepEqual(urls(), ["/p?tag=a", "/p?tag=a&tag=b", "/p"]);
  r.dispose();
});

test("arrays with __proto__-like values and keys stay plain data", async () => {
  const q = JSON.parse('{"__proto__": ["x"], "constructor": ["y"]}');
  assert.equal(await query(q), "/p?__proto__=x&constructor=y");
  assert.equal(Object.prototype.x, undefined);
  assert.equal([].x, undefined);
});

// ---- the target example ----------------------------------------------------------------------------------------

test("the Phase 3 target: reactive scope + q + tags, debounced, disposed", async () => {
  fakeTimers();
  stubFetch();
  const scope = createState("docs");
  const q = createState("");
  const selectedTags = createState([]);
  const results = api("/api/search/:scope", {
    params: () => ({ scope: scope.get() }),
    query: () => ({ q: q.get(), tag: selectedTags.get() }),
    debounce: 250,
  });
  await settle();
  q.set("sec");
  selectedTags.set(["security", "web"]);
  await settle();
  mock.timers.tick(100);
  scope.set("blog");
  q.set("security");
  await settle();
  mock.timers.tick(250);
  await settle();
  assert.deepEqual(urls(), ["/api/search/docs?q=", "/api/search/blog?q=security&tag=security&tag=web"]);
  results.dispose();
  q.set("after");
  await settle();
  mock.timers.tick(1000);
  await settle();
  assert.equal(calls.length, 2);
});
