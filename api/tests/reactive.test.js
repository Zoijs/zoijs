// Phase 2 — reactive queries: `query: () => ({ … })` refetches when state it reads changes.
// Tracking is core's computed() + effect(); the lifecycle stays resource()'s.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, each, createState, configure } from "@zoijs/core";
import { attachInspector } from "@zoijs/core/devtools";
import { api, ApiError } from "../src/index.js";

const tick = () => new Promise((resolve) => setTimeout(resolve));
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
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
});
const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const urls = () => calls.map((c) => c.url.replace("https://app.example.com", ""));

// Mount `setup` in a fresh owner (like a component); returns its result and an unmount.
function inComponent(setup) {
  let out;
  const unmount = mount(() => {
    out = setup();
    return html`<p></p>`;
  }, document.createElement("div"));
  return { ...out, unmount };
}

test("the first request uses the initial reactive value", async () => {
  stubFetch();
  const { results, unmount } = inComponent(() => {
    const search = createState("zoijs");
    return { results: api("/api/search", { query: () => ({ q: search.get() }) }) };
  });
  await settle();
  assert.deepEqual(urls(), ["/api/search?q=zoijs"]);
  assert.deepEqual(results.data(), { url: "https://app.example.com/api/search?q=zoijs" });
  unmount();
});

test("changing a dependency refetches automatically — no refresh() call", async () => {
  stubFetch();
  const search = createState("");
  const { results, unmount } = inComponent(() => ({ results: api("/api/search", { query: () => ({ q: search.get() }) }) }));
  await settle();
  search.set("security");
  await settle();
  assert.deepEqual(urls(), ["/api/search?q=", "/api/search?q=security"]);
  assert.equal(results.data().url, "https://app.example.com/api/search?q=security");
  unmount();
});

test("several changes in one synchronous block make ONE request with all current values", async () => {
  stubFetch();
  const q = createState("a");
  const page = createState(1);
  const { unmount } = inComponent(() => ({ r: api("/api/search", { query: () => ({ q: q.get(), page: page.get() }) }) }));
  await settle();
  q.set("b");
  page.set(2);
  q.set("bc");
  await settle();
  assert.deepEqual(urls(), ["/api/search?q=a&page=1", "/api/search?q=bc&page=2"]);
  unmount();
});

test("a change that builds the same query doesn't refetch", async () => {
  stubFetch();
  const q = createState("zoijs");
  const unrelated = createState(0);
  const { unmount } = inComponent(() => ({ r: api("/s", { query: () => ({ q: q.get().trim(), n: unrelated.get() > 10 ? 1 : null }) }) }));
  await settle();
  q.set("zoijs  ");
  unrelated.set(5);
  await settle();
  assert.equal(calls.length, 1);
  unmount();
});

test("refresh() uses the current values — and isn't followed by a duplicate request", async () => {
  stubFetch();
  const search = createState("");
  const { results, unmount } = inComponent(() => ({ results: api("/api/search", { query: () => ({ q: search.get() }) }) }));
  await settle();
  search.set("zoijs");
  results.refresh(); // before the batched effect has run
  await settle();
  assert.deepEqual(urls(), ["/api/search?q=", "/api/search?q=zoijs"]);
  results.refresh(); // same query, on purpose: requests again
  await settle();
  assert.deepEqual(urls(), ["/api/search?q=", "/api/search?q=zoijs", "/api/search?q=zoijs"]);
  unmount();
});

test("latest request wins: a → ab → abc, earlier requests aborted, late answers ignored", async () => {
  const pending = [];
  stubFetch((url) => new Promise((resolve) => pending.push({ url, resolve })));
  const q = createState("a");
  const { results, unmount } = inComponent(() => ({ results: api("/api/search", { query: () => ({ q: q.get() }) }) }));
  await tick();
  q.set("ab");
  await tick();
  q.set("abc");
  await tick();
  assert.deepEqual(urls(), ["/api/search?q=a", "/api/search?q=ab", "/api/search?q=abc"]);
  assert.deepEqual(calls.map((c) => c.init.signal.aborted), [true, true, false]);
  pending[2].resolve(json({ q: "abc" }));
  await settle();
  pending[0].resolve(json({ q: "a" }));
  pending[1].resolve(json({ q: "ab" }));
  await settle();
  assert.deepEqual(results.data(), { q: "abc" });
  assert.equal(results.error(), null);
  assert.equal(results.loading(), false);
  unmount();
});

test("after unmount, changing the query state requests nothing; tracking is disposed", async () => {
  const created = [];
  const disposed = new Set();
  const detach = attachInspector({ onCreate: (n, kind) => created.push({ n, kind }), onRun() {}, onWrite() {}, onDispose: (n) => disposed.add(n) });
  try {
    stubFetch();
    const q = createState("a");
    const { unmount } = inComponent(() => ({ r: api("/api/search", { query: () => ({ q: q.get() }) }) }));
    await settle();
    const tracking = created.filter((c) => c.kind === "computed" || c.kind === "effect").map((c) => c.n);
    assert.ok(tracking.length >= 2, "a computed and an effect track the query");
    unmount();
    for (const n of tracking) assert.ok(disposed.has(n), "disposed with the component");
    q.set("b");
    q.set("c");
    await settle();
    assert.deepEqual(urls(), ["/api/search?q=a"]);
    assert.equal(q.peek(), "c");
  } finally {
    detach();
  }
});

test("a static query creates no computed or effect", async () => {
  const created = [];
  const detach = attachInspector({ onCreate: (n, kind) => created.push(kind), onRun() {}, onWrite() {}, onDispose() {} });
  try {
    stubFetch();
    const before = created.length;
    const r = api("/api/search", { query: { q: "zoijs", page: 1 }, });
    const states = created.slice(before);
    assert.ok(!states.includes("computed") && !states.includes("effect"), `created: ${states.join(", ")}`);
    await settle();
    assert.deepEqual(urls(), ["/api/search?q=zoijs&page=1"]);
    void r;
  } finally {
    detach();
  }
});

test("null/undefined from a reactive query omit the key", async () => {
  stubFetch();
  const tag = createState(null);
  const { unmount } = inComponent(() => ({ r: api("/api/items", { query: () => ({ tag: tag.get(), page: 1 }) }) }));
  await settle();
  tag.set("new");
  await settle();
  tag.set(undefined);
  await settle();
  assert.deepEqual(urls(), ["/api/items?page=1", "/api/items?tag=new&page=1", "/api/items?page=1"]);
  unmount();
});

test("a bad reactive query becomes a config ApiError (no request), and recovers", async () => {
  const reported = [];
  configure({ onError: (e, info) => reported.push({ e, info }) });
  try {
    stubFetch();
    const filter = createState("ok");
    const { results, unmount } = inComponent(() => ({ results: api("/api/items", { query: () => ({ filter: filter.get() }) }) }));
    await settle();
    assert.equal(calls.length, 1);

    filter.set({ active: true });
    await settle();
    assert.equal(calls.length, 1, "no request with an invalid query");
    assert.ok(results.error() instanceof ApiError);
    assert.equal(results.error().type, "config");
    assert.match(results.error().message, /^GET request not sent: query\.filter must be/);
    assert.equal(reported.length, 1);
    assert.deepEqual(reported[0].info, { kind: "resource" });

    filter.set("again");
    await settle();
    assert.equal(results.error(), null);
    assert.deepEqual(urls(), ["/api/items?filter=ok", "/api/items?filter=again"]);
    unmount();
  } finally {
    configure({ onError: null });
  }
});

test("a query function that throws is a config error carrying the original as cause", async () => {
  stubFetch();
  const boom = new Error("boom");
  const fail = createState(true);
  const { results, unmount } = inComponent(() => ({
    results: api("/api/items", {
      query: () => {
        if (fail.get()) throw boom;
        return { a: 1 };
      },
    }),
  }));
  await settle();
  assert.equal(calls.length, 0);
  assert.equal(results.error().type, "config");
  assert.equal(results.error().message, "GET request not sent: the query function threw");
  assert.equal(results.error().cause, boom);
  fail.set(false);
  await settle();
  assert.deepEqual(urls(), ["/api/items?a=1"]);
  unmount();
});

test("a secret-looking key from a reactive query is refused before any request", async () => {
  stubFetch();
  const key = createState("q");
  const { results, unmount } = inComponent(() => ({ results: api("/api/x", { query: () => ({ [key.get()]: "v" }) }) }));
  await settle();
  key.set("access_token");
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(results.error().type, "config");
  assert.match(results.error().message, /"access_token" names a secret/);
  assert.ok(!results.error().message.includes('"v"'));
  unmount();
});

test("reading state in a reactive query doesn't subscribe the surrounding binding", async () => {
  stubFetch();
  const q = createState("a");
  let bindingRuns = 0;
  const host = document.createElement("div");
  let results;
  const unmount = mount(() => {
    results = api("/api/search", { query: () => ({ q: q.get() }) });
    return html`<p>${() => { bindingRuns++; return results.loading() ? "…" : "ok"; }}</p>`;
  }, host);
  await settle();
  const runs = bindingRuns;
  q.set("b");
  await settle();
  // The binding re-runs for loading() flips only (true → false), never because q changed directly.
  assert.ok(bindingRuns - runs <= 2, `binding ran ${bindingRuns - runs}×`);
  assert.equal(host.textContent, "ok");
  unmount();
});

test("the Phase 2 search component: type → refetch, no URL or refresh boilerplate", async () => {
  stubFetch((url) => json([{ id: new URL(url).searchParams.get("q"), name: `result for ${new URL(url).searchParams.get("q")}` }]));
  const host = document.createElement("div");
  function Search() {
    const q = createState("");
    const results = api("/api/search", { query: () => ({ q: q.get() }) });
    return html`
      <input type="search" oninput=${(e) => q.set(e.target.value)} />
      <ul>${each(() => results.data() ?? [], (r) => r.id, (r) => html`<li>${r.name}</li>`)}</ul>
    `;
  }
  const unmount = mount(Search, host);
  await settle();
  const input = host.querySelector("input");
  input.value = "zoijs & co";
  input.dispatchEvent(new Event("input"));
  await settle();
  assert.equal(host.querySelector("li").textContent, "result for zoijs & co");
  assert.deepEqual(urls(), ["/api/search?q=", "/api/search?q=zoijs+%26+co"]);
  unmount();
});
