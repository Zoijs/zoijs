// Phase 4 — mutations: api.post / put / patch / delete over @zoijs/action, JSON bodies and explicit
// invalidation. The page is https://app.example.com/dashboard/.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, each, createState, configure } from "@zoijs/core";
import { api, ApiError } from "../src/index.js";

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
};
const realFetch = globalThis.fetch;
let calls = [];
// `respond(url, init)` → Response; default: GET → [], writes → 201 echoing the request.
function stubFetch(respond) {
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init, method: init.method });
    return Promise.resolve().then(() => (respond ? respond(url, init) : echo(url, init)));
  };
}
const echo = (url, init) =>
  init.method === "GET" ? json([]) : json({ method: init.method, url, body: init.body === undefined ? null : JSON.parse(init.body) }, 201);
test.afterEach(() => {
  globalThis.fetch = realFetch;
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const path = (c) => c.url.replace("https://app.example.com", "");
const writes = () => calls.filter((c) => c.method !== "GET");
const gets = () => calls.filter((c) => c.method === "GET");
const isConfig = (e, re) => e instanceof ApiError && e.type === "config" && (!re || re.test(e.message));

// ---- shape -----------------------------------------------------------------------------------------

test("api.post / put / patch / delete exist; api.get doesn't (api(url) is the GET)", () => {
  for (const m of ["post", "put", "patch", "delete"]) assert.equal(typeof api[m], "function", m);
  assert.equal(api.get, undefined);
});

test("a mutation is an action: run / pending / error / done / result / reset, nothing runs until run()", async () => {
  stubFetch();
  const add = api.post("/api/tasks");
  assert.deepEqual(Object.keys(add).sort(), ["attempt", "done", "error", "pending", "reset", "result", "retrying", "run"]);
  assert.equal(add.pending(), false);
  assert.equal(add.done(), false);
  assert.equal(add.error(), null);
  await settle();
  assert.equal(calls.length, 0);
  const p = add.run({ title: "x" });
  assert.equal(add.pending(), true);
  const value = await p;
  assert.equal(add.pending(), false);
  assert.equal(add.done(), true);
  assert.deepEqual(add.result(), value);
  add.reset();
  assert.equal(add.done(), false);
  assert.equal(add.result(), undefined);
});

// ---- POST ---------------------------------------------------------------------------------------------

test("POST serializes the body as JSON with Content-Type, on the same-origin transport", async () => {
  stubFetch();
  const add = api.post("/api/tasks");
  const result = await add.run({ title: "Learn Zoijs", done: false, tags: ["a"], n: 1.5, nested: { x: null } });
  const c = calls[0];
  assert.equal(c.method, "POST");
  assert.equal(c.url, "https://app.example.com/api/tasks");
  assert.equal(c.init.body, '{"title":"Learn Zoijs","done":false,"tags":["a"],"n":1.5,"nested":{"x":null}}');
  assert.deepEqual(c.init.headers, { Accept: "application/json, text/plain;q=0.9, */*;q=0.8", "Content-Type": "application/json" });
  assert.equal(c.init.mode, "same-origin");
  assert.equal(c.init.credentials, "same-origin");
  assert.equal(c.init.signal, undefined, "mutations are never aborted by api()");
  assert.deepEqual(result.body, { title: "Learn Zoijs", done: false, tags: ["a"], n: 1.5, nested: { x: null } });
});

test("POST bodies: array, string, number, boolean, null are all JSON", async () => {
  stubFetch();
  const add = api.post("/api/x");
  for (const [body, text] of [[[1, "a", null], '[1,"a",null]'], ["hi", '"hi"'], [42, "42"], [true, "true"], [false, "false"], [null, "null"], [{}, "{}"], [[], "[]"], ["", '""'], [0, "0"]]) {
    calls = [];
    await add.run(body);
    assert.equal(calls[0].init.body, text, JSON.stringify(body));
    assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  }
});

test("POST with no body sends no body and no Content-Type (never the text \"undefined\")", async () => {
  stubFetch();
  const add = api.post("/api/ping");
  await add.run();
  await add.run(undefined);
  for (const c of calls) {
    assert.equal(c.init.body, undefined);
    assert.deepEqual(Object.keys(c.init.headers), ["Accept"]);
  }
});

test("responses use the GET parser: 200/201/202 JSON, 204/205 null, text, empty JSON", async () => {
  const cases = [
    [() => json({ id: 1 }), { id: 1 }],
    [() => json({ id: 2 }, 201), { id: 2 }],
    [() => new Response('{"queued":true}', { status: 202, headers: { "Content-Type": "application/json; charset=utf-8" } }), { queued: true }],
    [() => new Response("accepted", { status: 202, headers: { "Content-Type": "text/plain" } }), "accepted"],
    [() => new Response(null, { status: 204 }), null],
    [() => new Response(null, { status: 205 }), null],
    [() => new Response("", { status: 200, headers: { "Content-Type": "application/json" } }), null],
    [() => new Response("<b>ok</b>", { status: 200, headers: { "Content-Type": "text/html" } }), "<b>ok</b>"],
  ];
  for (const [respond, expected] of cases) {
    stubFetch(respond);
    const add = api.post("/api/x");
    assert.deepEqual(await add.run({ a: 1 }), expected);
    assert.equal(add.done(), true);
    assert.deepEqual(add.result(), expected);
  }
});

test("HTTP, network and parse failures land in error() as ApiError; run() resolves undefined", async () => {
  const reported = [];
  configure({ onError: (e, info) => reported.push({ e, info }) });
  try {
    const cases = [
      [() => new Response('{"error":"server-secret-detail"}', { status: 422, statusText: "Unprocessable Content", headers: { "Content-Type": "application/json" } }), "http", 422, "POST request failed: 422 Unprocessable Content"],
      [() => new Response("", { status: 500 }), "http", 500, "POST request failed: 500"],
      [() => { throw new TypeError("Failed to fetch https://app.example.com/api/x?x=net-secret"); }, "network", null, "POST request failed: network error"],
      [() => new Response("{nope", { status: 201, headers: { "Content-Type": "application/json" } }), "parse", 201, "POST request failed: the response is not valid JSON"],
    ];
    for (const [respond, type, status, message] of cases) {
      stubFetch(respond);
      const add = api.post("/api/x");
      assert.equal(await add.run({ password: "body-secret" }), undefined);
      const e = add.error();
      assert.ok(e instanceof ApiError);
      assert.equal(e.type, type);
      assert.equal(e.status, status);
      assert.equal(e.method, "POST");
      assert.equal(e.message, message);
      assert.equal(e.url, "https://app.example.com/api/x");
      assert.equal(add.done(), false);
      const dump = JSON.stringify({ m: e.message, ...e, s: String(e) });
      for (const secret of ["body-secret", "password", "server-secret-detail", "net-secret"]) assert.ok(!dump.includes(secret), `${type} leaks ${secret}`);
    }
    assert.equal(reported.length, 4);
    assert.ok(reported.every((r) => r.info.kind === "action"), "reported through action's onError kind");
  } finally {
    configure({ onError: null });
  }
});

test("exclusive: a double submit sends ONE request, both calls get its result, one invalidation", async () => {
  stubFetch();
  const tasks = api("/api/tasks");
  await settle();
  const add = api.post("/api/tasks", { exclusive: true, invalidate: tasks });
  const [a, b] = await Promise.all([add.run({ title: "x" }), add.run({ title: "y" })]);
  await settle();
  assert.equal(writes().length, 1);
  assert.equal(JSON.parse(writes()[0].init.body).title, "x", "the joined call's arguments are ignored");
  assert.deepEqual(a, b);
  assert.equal(gets().length, 2, "initial load + exactly one invalidation refresh");
  await add.run({ title: "z" }); // the lock is released after settling
  assert.equal(writes().length, 2);
  tasks.dispose();
});

test("exclusive defaults to false, like @zoijs/action", async () => {
  stubFetch();
  const add = api.post("/api/tasks");
  await Promise.all([add.run({ a: 1 }), add.run({ a: 2 })]);
  assert.equal(writes().length, 2);
  assert.throws(() => api.post("/x", { exclusive: "yes" }), /exclusive must be true or false/);
});

test("the body object is read, not mutated or kept", async () => {
  stubFetch();
  const body = Object.freeze({ title: "x", tags: Object.freeze(["a"]) });
  await api.post("/api/tasks").run(body);
  assert.deepEqual(body, { title: "x", tags: ["a"] });
});

// ---- serialization ---------------------------------------------------------------------------------------

test("bodies JSON can't send faithfully are refused before any request, without echoing content", async () => {
  stubFetch();
  const cyclic = { label: "cycle-secret" };
  cyclic.self = cyclic;
  class Point { constructor() { this.x = "class-secret"; } }
  const bad = [
    [10n, /a bigint/],
    [{ amount: 10n, note: "big-secret" }, /a bigint/],
    [{ fn() {}, note: "fn-secret" }, /a function or symbol/],
    [{ s: Symbol("sym-secret") }, /a function or symbol/],
    [[1, () => 2], /a function or symbol/],
    [cyclic, /a cycle/],
    [{ n: NaN }, /a non-finite number/],
    [[Infinity], /a non-finite number/],
    [new Map([["k", "map-secret"]]), /isn't a plain object/],
    [{ set: new Set(["set-secret"]) }, /isn't a plain object/],
    [new Point(), /isn't a plain object/],
    [{ get boom() { throw new Error("getter-secret"); } }, /a cycle or a getter\/toJSON that threw/],
    [{ toJSON() { throw new Error("tojson-secret"); } }, /a cycle or a getter\/toJSON that threw/],
    [Symbol("x"), /a function or symbol/],
    [() => {}, /a function or symbol/],
  ];
  for (const [body, re] of bad) {
    const add = api.post("/api/x");
    assert.equal(await add.run(body), undefined);
    const e = add.error();
    assert.ok(isConfig(e, re), `${re}: ${e && e.message}`);
    assert.match(e.message, /^POST request not sent: the request body can't be sent as JSON: it contains /);
    for (const s of ["cycle-secret", "big-secret", "fn-secret", "sym-secret", "map-secret", "set-secret", "class-secret", "getter-secret", "tojson-secret", "label", "self", "note"]) {
      assert.ok(!e.message.includes(s), s);
    }
    assert.equal(e.cause, undefined, "no cause: it could carry body content");
  }
  assert.equal(calls.length, 0, "nothing was sent");
});

test("supported JSON semantics: Date via toJSON, undefined properties dropped, null-prototype objects ok", async () => {
  stubFetch();
  const add = api.post("/api/x");
  const bare = Object.create(null);
  bare.k = "v";
  await add.run({ when: new Date(0), skip: undefined, bare });
  assert.equal(calls[0].init.body, '{"when":"1970-01-01T00:00:00.000Z","bare":{"k":"v"}}');
});

test("__proto__ / constructor / prototype body keys are plain JSON keys", async () => {
  stubFetch();
  const body = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "prototype": 1}');
  await api.post("/api/x").run(body);
  assert.equal(calls[0].init.body, '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":1}');
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

// ---- PUT / PATCH --------------------------------------------------------------------------------------------

test("PUT/PATCH with placeholders take { params, body } with the right method", async () => {
  stubFetch();
  const put = api.put("/api/tasks/:id");
  const patch = api.patch("/api/tasks/:id");
  await put.run({ params: { id: 7 }, body: { title: "Updated" } });
  await patch.run({ params: { id: "a/b" }, body: { completed: true } });
  assert.deepEqual(calls.map((c) => [c.method, path(c), c.init.body]), [
    ["PUT", "/api/tasks/7", '{"title":"Updated"}'],
    ["PATCH", "/api/tasks/a%2Fb", '{"completed":true}'],
  ]);
  await patch.run({ params: { id: 1 } }); // no body is allowed
  assert.equal(calls[2].init.body, undefined);
  assert.deepEqual(Object.keys(calls[2].init.headers), ["Accept"]);
});

test("params are encoded by the shared encoder: traversal stays one segment", async () => {
  stubFetch();
  const patch = api.patch("/api/files/:name/meta");
  for (const [name, enc] of [["../../admin", "..%2F..%2Fadmin"], ["%2e%2e", "%252e%252e"], ["a b?#", "a%20b%3F%23"], ["//evil.example", "%2F%2Fevil.example"], ["café", "caf%C3%A9"]]) {
    calls = [];
    await patch.run({ params: { name }, body: {} });
    assert.equal(path(calls[0]), `/api/files/${enc}/meta`);
  }
});

test("bad run() input is a config error in error(), with no request", async () => {
  stubFetch();
  const patch = api.patch("/api/tasks/:id");
  const cases = [
    [{ params: {} , body: {} }, /params\.id is missing/],
    [{ params: { id: 1, userId: 2 }, body: {} }, /params\.userId isn't used/],
    [{ params: { id: ".." }, body: {} }, /can't be empty, "\." or "\.\."/],
    [{ params: { id: { secret: "obj-secret" } }, body: {} }, /params\.id must be a string/],
    [{ id: 1, title: "x" }, /run\(\) takes \{ params, body \}, not "id"/],
    [{ title: "x" }, /not "title"/],
    [undefined, /takes \{ params, body \}/],
    [{ params: { id: 1 }, body: { n: 10n } }, /a bigint/],
  ];
  for (const [input, re] of cases) {
    assert.equal(await patch.run(input), undefined);
    assert.ok(isConfig(patch.error(), re), `${re}: ${patch.error()?.message}`);
    assert.equal(patch.error().method, "PATCH");
    assert.ok(!patch.error().message.includes("obj-secret"));
  }
  assert.equal(await patch.run({ params: { id: 1 } }, "extra"), undefined);
  assert.ok(isConfig(patch.error(), /run\(\) takes one argument/));
  assert.equal(calls.length, 0);
});

test("without placeholders, PUT/PATCH use the body shorthand too — the URL decides, not the argument", async () => {
  stubFetch();
  await api.put("/api/settings").run({ theme: "dark" });
  await api.post("/api/raw").run({ params: { id: 1 }, body: "x" }); // no placeholders: this IS the body
  assert.equal(calls[0].init.body, '{"theme":"dark"}');
  assert.equal(calls[1].init.body, '{"params":{"id":1},"body":"x"}');
});

// ---- DELETE ----------------------------------------------------------------------------------------------------

test("DELETE: route param, static query, no body, 204 → null", async () => {
  stubFetch(() => new Response(null, { status: 204 }));
  const remove = api.delete("/api/tasks/:id", { query: { hard: true, tag: ["a", "b"] } });
  assert.equal(await remove.run({ params: { id: 42 } }), null);
  assert.equal(remove.done(), true);
  const c = calls[0];
  assert.equal(c.method, "DELETE");
  assert.equal(path(c), "/api/tasks/42?hard=true&tag=a&tag=b");
  assert.equal(c.init.body, undefined);
  assert.deepEqual(Object.keys(c.init.headers), ["Accept"]);
});

test("DELETE refuses a body in either form", async () => {
  stubFetch();
  const removeAll = api.delete("/api/tasks");
  await removeAll.run({ ids: [1] });
  assert.ok(isConfig(removeAll.error(), /DELETE sends no body/));
  const remove = api.delete("/api/tasks/:id");
  await remove.run({ params: { id: 1 }, body: { why: "x" } });
  assert.ok(isConfig(remove.error(), /takes \{ params \}, not "body" \(DELETE sends no body\)/));
  assert.equal(calls.length, 0);
  await removeAll.run();
  assert.equal(calls.length, 1);
});

test("DELETE: HTTP failure and traversal protection", async () => {
  stubFetch(() => new Response("", { status: 403, statusText: "Forbidden" }));
  const remove = api.delete("/api/tasks/:id");
  await remove.run({ params: { id: "../../users/1" } });
  assert.equal(path(calls[0]), "/api/tasks/..%2F..%2Fusers%2F1");
  assert.equal(remove.error().type, "http");
  assert.equal(remove.error().status, 403);
  assert.equal(remove.error().method, "DELETE");
  assert.equal(remove.error().message, "DELETE request failed: 403 Forbidden");
});

// ---- factory options ------------------------------------------------------------------------------------------

test("factory options are query, invalidate and exclusive only — transport stays the framework's", () => {
  for (const key of ["headers", "method", "credentials", "mode", "redirect", "cache", "referrer", "integrity", "body", "params", "debounce", "signal"]) {
    assert.throws(() => api.post("/x", { [key]: {} }), (e) => e instanceof TypeError && /unsupported option/.test(e.message), key);
  }
  assert.throws(() => api.delete("/x", { query: () => ({}) }), /a mutation's query is static/);
  assert.throws(() => api.post(""), TypeError);
  assert.throws(() => api.post(42), TypeError);
  assert.throws(() => api.post("/x", null), /options must be a plain object/);
});

test("secret-looking query keys are refused for mutations too (same rule)", () => {
  for (const key of ["token", "access_token", "apiKey", "Authorization", "password"]) {
    assert.throws(() => api.delete("/session", { query: { [key]: "x" } }), /names a secret/, key);
    assert.throws(() => api.post(`/session?${key}=x`), /names a secret/, key);
  }
});

test("factory-time template mistakes throw immediately", () => {
  assert.throws(() => api.patch("/tasks/:id?"), /optional params/);
  assert.throws(() => api.patch("/tasks/:{id}"), /unsupported placeholder/);
  assert.throws(() => api.post("/x", { query: { filter: { a: 1 } } }), /query\.filter must be/);
});

// ---- invalidation -------------------------------------------------------------------------------------------------

test("invalidate: one resource refreshes after success", async () => {
  stubFetch();
  const tasks = api("/api/tasks");
  await settle();
  const add = api.post("/api/tasks", { invalidate: tasks });
  await add.run({ title: "x" });
  await settle();
  assert.deepEqual(calls.map((c) => c.method), ["GET", "POST", "GET"]);
  tasks.dispose();
});

test("invalidate: several resources, deduplicated; the caller's array isn't mutated", async () => {
  stubFetch();
  const tasks = api("/api/tasks");
  const dashboard = api("/api/dashboard");
  await settle();
  const list = Object.freeze([tasks, dashboard, tasks]);
  const save = api.post("/api/tasks", { invalidate: list });
  await save.run({});
  await settle();
  assert.deepEqual(gets().map(path).sort(), ["/api/dashboard", "/api/dashboard", "/api/tasks", "/api/tasks"]);
  assert.equal(list.length, 3);
  const none = api.post("/api/x", { invalidate: [] });
  await none.run({});
  await settle();
  assert.equal(gets().length, 4, "[] invalidates nothing");
  tasks.dispose();
  dashboard.dispose();
});

test("invalidate happens only after success — never after a failure or a config error", async () => {
  let status = 500;
  stubFetch((url, init) => (init.method === "GET" ? json([]) : new Response("", { status })));
  const tasks = api("/api/tasks");
  await settle();
  const add = api.post("/api/tasks", { invalidate: tasks });
  await add.run({});
  await add.run({ n: 10n });
  await settle();
  assert.equal(gets().length, 1);
  status = 201;
  await add.run({});
  await settle();
  assert.equal(gets().length, 2);
  tasks.dispose();
});

test("invalidation runs after the action's success state is set, and run() doesn't wait for it", async () => {
  let releaseGet;
  let getsSeen = 0;
  stubFetch((url, init) => {
    if (init.method !== "GET") return json({ ok: true }, 201);
    getsSeen++;
    return getsSeen === 1 ? json([]) : new Promise((resolve) => (releaseGet = () => resolve(json(["new"]))));
  });
  const tasks = api("/api/tasks");
  await settle();
  const add = api.post("/api/tasks", { invalidate: tasks });
  const value = await add.run({});
  assert.deepEqual(value, { ok: true });
  assert.equal(add.done(), true, "success state is set when run() resolves");
  assert.equal(tasks.loading(), true, "the invalidated refresh is still running");
  releaseGet();
  await settle();
  assert.deepEqual(tasks.data(), ["new"]);
  tasks.dispose();
});

test("an invalidated refresh that fails belongs to the resource, not the mutation", async () => {
  const reported = [];
  configure({ onError: (e, info) => reported.push(info.kind) });
  try {
    let n = 0;
    stubFetch((url, init) => (init.method !== "GET" ? json({ ok: 1 }, 201) : ++n === 1 ? json([]) : new Response("", { status: 503 })));
    const tasks = api("/api/tasks");
    await settle();
    const add = api.post("/api/tasks", { invalidate: tasks });
    await add.run({});
    await settle();
    assert.equal(add.done(), true);
    assert.equal(add.error(), null);
    assert.equal(tasks.error().status, 503);
    assert.deepEqual(reported, ["resource"]);
    tasks.dispose();
  } finally {
    configure({ onError: null });
  }
});

test("a disposed or unmounted target is skipped quietly; the mutation still succeeds", async () => {
  const reported = [];
  configure({ onError: (e) => reported.push(e) });
  try {
    stubFetch();
    const gone = api("/api/gone");
    let owned;
    const unmount = mount(() => {
      owned = api("/api/owned");
      return html`<p></p>`;
    }, document.createElement("div"));
    const alive = api("/api/alive");
    await settle();
    gone.dispose();
    unmount();
    const add = api.post("/api/tasks", { invalidate: [gone, owned, alive] });
    await add.run({});
    await settle();
    assert.equal(add.done(), true);
    assert.equal(add.error(), null);
    assert.deepEqual(gets().map(path).sort(), ["/api/alive", "/api/alive", "/api/gone", "/api/owned"]);
    assert.deepEqual(reported, []);
    alive.dispose();
  } finally {
    configure({ onError: null });
  }
});

test("the invalidated refresh uses the GET's latest reactive params/query", async () => {
  stubFetch();
  const page = createState(1);
  const tasks = api("/api/tasks", { query: () => ({ page: page.get() }), debounce: 10000 });
  await settle();
  page.set(3); // debounce pending — invalidation must not wait for it, and must use page=3
  const add = api.post("/api/tasks", { invalidate: tasks });
  await add.run({});
  await settle();
  assert.deepEqual(gets().map(path), ["/api/tasks?page=1", "/api/tasks?page=3"]);
  tasks.dispose();
});

test("invalidate accepts only real api() resources — shape spoofing is refused", () => {
  const fake = { refresh() {}, data() {}, loading() {}, error() {}, dispose() {} };
  const r = api("/api/real");
  const copy = { ...r };
  for (const bad of [fake, copy, {}, null, "tasks", 1, () => {}, Object.create(r)]) {
    assert.throws(() => api.post("/x", { invalidate: bad }), /invalidate must be a resource returned by api\(\)/);
  }
  assert.throws(() => api.post("/x", { invalidate: [r, fake] }), /invalidate\[1\] must be a resource returned by api\(\)/);
  const mut = api.post("/y");
  assert.throws(() => api.post("/x", { invalidate: mut }), /must be a resource returned by api\(\)/, "a mutation isn't a GET resource");
  r.dispose();
});

test("a mutation that succeeds after its component unmounted still invalidates live targets", async () => {
  let release;
  stubFetch((url, init) => (init.method === "GET" ? json([]) : new Promise((resolve) => (release = () => resolve(json({ ok: 1 }, 201))))));
  const list = api("/api/list");
  await settle();
  let add;
  const unmount = mount(() => {
    add = api.post("/api/items", { invalidate: list });
    return html`<p></p>`;
  }, document.createElement("div"));
  const p = add.run({ name: "x" });
  await settle();
  unmount(); // the form closed while saving
  release();
  await p;
  await settle();
  assert.equal(writes().length, 1);
  assert.equal(gets().length, 2, "the server changed, so the list refreshes");
  assert.equal(add.done(), false, "the unmounted action ignores the late result (action semantics)");
  list.dispose();
});

// ---- security --------------------------------------------------------------------------------------------------

test("mutation URLs get every Phase 1 check: origin, scheme, credentials, malformed — no request", async () => {
  stubFetch();
  for (const url of ["https://evil.example/api", "//evil.example/api", "/\\evil.example/api", "http://app.example.com/api", "https://user:pw@app.example.com/api", "javascript:alert(1)", "https://[bad"]) {
    const add = api.post(url);
    await add.run({ password: "body-secret" });
    assert.equal(add.error()?.type, "security", url);
    assert.equal(add.error().method, "POST");
    assert.ok(!add.error().message.includes("body-secret"));
  }
  assert.equal(calls.length, 0);
});

test("body and params can't change the URL's origin", async () => {
  stubFetch();
  const patch = api.patch("/:a/:b");
  await patch.run({ params: { a: "https:", b: "evil.example" }, body: { url: "https://evil.example" } });
  await patch.run({ params: { a: "", b: "x" }, body: {} });
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).origin, "https://app.example.com");
});

test("cross-origin redirects are refused for mutations too", async () => {
  stubFetch(() => {
    const res = json({ leaked: true }, 200);
    Object.defineProperty(res, "redirected", { value: true });
    Object.defineProperty(res, "url", { value: "https://evil.example/collect" });
    return res;
  });
  const add = api.post("/api/x");
  await add.run({});
  assert.equal(add.error().type, "security");
  assert.match(add.error().message, /^POST request blocked: redirected to another origin$/);
});

test("mutations write nothing to the console and are never retried", async () => {
  const original = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  const logged = [];
  for (const k of Object.keys(original)) console[k] = (...a) => logged.push(a);
  try {
    stubFetch(() => new Response("", { status: 503 }));
    const add = api.post("/api/pay");
    await add.run({ card: "4111-secret" });
    await settle();
    stubFetch(() => { throw new TypeError("offline"); });
    const put = api.put("/api/x");
    await put.run({});
    await settle();
    assert.equal(calls.length, 1, "a network failure is not retried");
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(logged, []);
});

// ---- the documented CRUD component ------------------------------------------------------------------------------

test("the Phase 4 Tasks component: add + delete with invalidation, no fetch/JSON/refresh boilerplate", async () => {
  let items = [{ id: 1, title: "Write docs" }];
  let nextId = 2;
  stubFetch((url, init) => {
    const u = new URL(url);
    if (init.method === "GET") return json(items);
    if (init.method === "POST") {
      const t = { id: nextId++, title: JSON.parse(init.body).title };
      items = [...items, t];
      return json(t, 201);
    }
    if (init.method === "DELETE") {
      const id = Number(u.pathname.split("/").pop());
      items = items.filter((t) => t.id !== id);
      return new Response(null, { status: 204 });
    }
    return new Response("", { status: 405 });
  });
  const host = document.createElement("div");
  function Tasks() {
    const tasks = api("/api/tasks");
    const addTask = api.post("/api/tasks", { invalidate: tasks, exclusive: true });
    const removeTask = api.delete("/api/tasks/:id", { invalidate: tasks });
    async function submit(e) {
      e.preventDefault();
      const form = e.currentTarget;
      await addTask.run({ title: new window.FormData(form).get("title") });
      if (addTask.done()) form.reset();
    }
    return html`
      <form onsubmit=${submit}>
        <input name="title" required />
        <button disabled=${() => addTask.pending()}>${() => (addTask.pending() ? "Adding..." : "Add")}</button>
        ${() => (addTask.error() ? html`<p role="alert">${addTask.error().message}</p>` : null)}
      </form>
      <ul>${each(() => tasks.data() ?? [], (t) => t.id, (t) => html`<li>${t.title} <button class="del" onclick=${() => removeTask.run({ params: { id: t.id } })}>Delete</button></li>`)}</ul>
    `;
  }
  const unmount = mount(Tasks, host);
  await settle();
  assert.deepEqual([...host.querySelectorAll("li")].map((li) => li.firstChild.textContent.trim()), ["Write docs"]);
  host.querySelector("input").value = "Ship 1.9";
  const form = host.querySelector("form");
  form.dispatchEvent(new window.Event("submit", { cancelable: true, bubbles: true }));
  form.dispatchEvent(new window.Event("submit", { cancelable: true, bubbles: true })); // double submit
  await settle();
  assert.equal(writes().length, 1);
  assert.deepEqual([...host.querySelectorAll("li")].map((li) => li.firstChild.textContent.trim()), ["Write docs", "Ship 1.9"]);
  assert.equal(host.querySelector("input").value, "");
  host.querySelector("li .del").click();
  await settle();
  assert.deepEqual([...host.querySelectorAll("li")].map((li) => li.firstChild.textContent.trim()), ["Ship 1.9"]);
  unmount();
});
