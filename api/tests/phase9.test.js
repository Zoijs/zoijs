// Phase 9 — FormData mutation retries, enabled after FormData replay passed in Chromium, Firefox
// and WebKit (CI, real network bytes). The same FormData object is replayed; nothing is cloned,
// serialized or given a Content-Type by api().

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { configure } from "@zoijs/core";
import { api } from "../src/index.js";

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
      if (step === "hang") return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      return step(url, init);
    });
  };
}
test.beforeEach(() => {
  mock.method(Math, "random", () => 0.5);
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_700_000_000_000 });
});
test.afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
  globalThis.fetch = realFetch;
});
const ok = (body = { ok: true }, status = 201) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const status = (code) => () => new Response("", { status: code });
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
function makeForm() {
  const form = new FormData();
  form.append("description", "Profile photo ✓");
  form.append("file", new File([new Uint8Array([0, 1, 2, 254, 255])], "photo.png", { type: "image/png" }));
  return form;
}
const snapshot = async (form) =>
  JSON.stringify(await Promise.all([...form.entries()].map(async ([k, v]) => [k, typeof v === "string" ? v : [v.name, v.type, [...new Uint8Array(await v.arrayBuffer())]]])));

test("POST, PUT and PATCH retry a FormData body: same object, same key, no Content-Type", async () => {
  for (const make of [api.post, api.put, api.patch]) {
    stubFetch(["network", ok()]);
    const form = makeForm();
    const m = make("/upload/:id", { idempotencyKey: true, retry: 2 });
    await drive(m.run({ params: { id: 7 }, body: form }));
    assert.equal(m.done(), true);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.body === form && c.url === "https://app.example.com/upload/7"));
    assert.equal(calls[0].key, calls[1].key);
    assert.ok(calls.every((c) => !("Content-Type" in c.headers)), "the browser writes the multipart boundary");
  }
});

test("timeout → FormData retry → success, and 503 → retry → success", async () => {
  for (const first of ["hang", status(503)]) {
    stubFetch([first, ok({ id: 1 })]);
    const form = makeForm();
    const m = api.post("/upload", { idempotencyKey: true, retry: 1, timeout: 1000 });
    assert.deepEqual(await drive(m.run(form)), { id: 1 });
    assert.equal(calls.length, 2);
    assert.equal(m.error(), null);
  }
});

test("the caller's FormData is unchanged after retries", async () => {
  stubFetch([status(502), status(503), ok()]);
  const form = makeForm();
  const before = await snapshot(form);
  await drive(api.post("/upload", { idempotencyKey: true, retry: 2 }).run(form));
  assert.equal(calls.length, 3);
  assert.equal(await snapshot(form), before);
});

test("FormData retry + invalidation: once after eventual success; exclusive double submit: one sequence", async () => {
  let posts = 0;
  stubFetch([(u, i) => (i.method === "GET" ? ok([], 200)() : ++posts === 1 ? status(503)() : ok()())]);
  const profile = api("/users/7");
  await settle();
  const form = makeForm();
  const up = api.post("/users/7/photo", { idempotencyKey: true, retry: 2, exclusive: true, invalidate: profile });
  await drive(Promise.all([up.run(form), up.run(form)]));
  await settle();
  const sent = calls.filter((c) => c.method === "POST");
  assert.equal(sent.length, 2, "one attempt + one retry, not two sequences");
  assert.equal(new Set(sent.map((c) => c.key)).size, 1);
  assert.equal(calls.filter((c) => c.method === "GET").length, 2, "initial load + one invalidation");
  profile.dispose();
});

test("exhausted FormData retries: one final error, no field names or values anywhere in it", async () => {
  const reported = [];
  configure({ onError: (e, info) => reported.push({ e, info }) });
  try {
    stubFetch([status(503)]);
    const form = new FormData();
    form.append("ssn-field-name", "ssn-SECRET-value");
    form.append("file", new File(["file-SECRET-bytes"], "secret-name.txt", { type: "text/plain" }));
    const m = api.post("/upload", { idempotencyKey: true, retry: 2 });
    await drive(m.run(form));
    assert.equal(calls.length, 3);
    assert.equal(m.error().status, 503);
    assert.equal(reported.length, 1);
    const dump = JSON.stringify({ m: m.error().message, ...m.error(), s: String(m.error()), r: reported.map((x) => ({ ...x.e, info: x.info })) });
    for (const s of ["ssn-field-name", "ssn-SECRET-value", "file-SECRET-bytes", "secret-name"]) assert.ok(!dump.includes(s), s);
  } finally {
    configure({ onError: null });
  }
});

test("non-retryable failures still end a FormData run at once", async () => {
  stubFetch([status(422), ok()]);
  const m = api.post("/upload", { idempotencyKey: true, retry: 3 });
  await drive(m.run(makeForm()));
  assert.equal(calls.length, 1);
  assert.equal(m.error().status, 422);
});
