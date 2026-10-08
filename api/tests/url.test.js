// Phase 2 — dynamic URLs: options, `params`, `query`, the secret-key policy, and the rule that the
// BUILT URL still passes every Phase 1 check. The page is https://app.example.com/dashboard/.

import test from "node:test";
import assert from "node:assert/strict";
import { configure } from "@zoijs/core";
import { api, ApiError } from "../src/index.js";

const tick = () => new Promise((resolve) => setTimeout(resolve));
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};
const realFetch = globalThis.fetch;
let calls = [];
function stubFetch(respond = () => json({})) {
  calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve().then(() => respond(url, init));
  };
}
test.afterEach(() => {
  globalThis.fetch = realFetch;
});
const json = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, ...init, headers: { "Content-Type": "application/json" } });

// The URL api() requests for (url, options), or the error it settles with.
async function requested(url, options, respond) {
  stubFetch(respond);
  const r = api(url, options);
  await settle();
  return { url: calls[0]?.url, calls: calls.length, error: r.error(), data: r.data() };
}
const throwsConfig = (fn, re) => assert.throws(fn, (e) => e instanceof TypeError && (!re || re.test(e.message)), String(re));

// ---- options ----------------------------------------------------------------------------------

test("api(url) and api(url, undefined) keep Phase 1 behavior", async () => {
  assert.equal((await requested("/api/users")).url, "https://app.example.com/api/users");
  assert.equal((await requested("/api/users", undefined)).url, "https://app.example.com/api/users");
  assert.equal((await requested("/api/users", {})).url, "https://app.example.com/api/users");
});

test("unsupported options are rejected, not ignored — api() stays GET-only", () => {
  stubFetch();
  for (const bad of [{ method: "POST" }, { headers: {} }, { body: "x" }, { credentials: "include" }, { mode: "cors" }, { signal: null }, { params: {}, cache: "no-store" }, { Query: {} }]) {
    throwsConfig(() => api("/users", bad), /unsupported option/);
  }
  for (const bad of [null, "query", 42, [], () => ({})]) throwsConfig(() => api("/users", bad), /options must be a plain object/);
  throwsConfig(() => api("/users", {}, {}), /too many arguments/);
  assert.equal(calls.length, 0);
});

// ---- params -------------------------------------------------------------------------------------

test("params fill :name segments: string, number, bigint, boolean", async () => {
  assert.equal((await requested("/api/users/:id", { params: { id: "ada" } })).url, "https://app.example.com/api/users/ada");
  assert.equal((await requested("/api/users/:id", { params: { id: 42 } })).url, "https://app.example.com/api/users/42");
  assert.equal((await requested("/api/users/:id", { params: { id: 9007199254740993n } })).url, "https://app.example.com/api/users/9007199254740993");
  assert.equal((await requested("/api/flags/:on", { params: { on: false } })).url, "https://app.example.com/api/flags/false");
  assert.equal((await requested("/api/:org/users/:userId/tasks/:task_id", { params: { org: "z", userId: 1, task_id: 2 } })).url, "https://app.example.com/api/z/users/1/tasks/2");
  assert.equal((await requested(":id/items", { params: { id: "x" } })).url, "https://app.example.com/dashboard/x/items", "a leading relative placeholder");
  assert.equal((await requested("/api/:id/:id", { params: { id: "x" } })).url, "https://app.example.com/api/x/x", "a repeated placeholder");
});

test("a param is exactly one encoded segment: delimiters and traversal stay data", async () => {
  const cases = {
    "abc/123": "abc%2F123",
    "../admin": "..%2Fadmin",
    "../../secret": "..%2F..%2Fsecret",
    "/foo": "%2Ffoo",
    "foo/bar": "foo%2Fbar",
    "%2e%2e": "%252e%252e", // encoded once — a literal "%2e%2e", not a dot segment
    "%2F": "%252F",
    "..%2fadmin": "..%252fadmin",
    "a b": "a%20b",
    "café ✓": "caf%C3%A9%20%E2%9C%93",
    "what?": "what%3F",
    "frag#x": "frag%23x",
    "100%": "100%25",
    "a\\b": "a%5Cb",
    "//evil.example": "%2F%2Fevil.example",
    "https://evil.example": "https%3A%2F%2Fevil.example",
    "user:pass@evil.example": "user%3Apass%40evil.example",
    "a;b,c=d&e+f": "a%3Bb%2Cc%3Dd%26e%2Bf",
    "...": "...",
  };
  for (const [value, encoded] of Object.entries(cases)) {
    const { url, error } = await requested("/api/files/:name/meta", { params: { name: value } });
    assert.equal(error, null, value);
    assert.equal(url, `https://app.example.com/api/files/${encoded}/meta`, value);
    assert.equal(new URL(url).pathname.split("/").length, 5, `${value}: the route keeps its shape`);
  }
});

test('params "", "." and ".." are refused (a dot segment can\'t be encoded away)', () => {
  stubFetch();
  for (const v of ["", ".", ".."]) throwsConfig(() => api("/api/files/:name", { params: { name: v } }), /can't be empty, "\." or "\.\."/);
  assert.equal(calls.length, 0);
});

test("a missing param fails immediately — the literal :id is never requested", () => {
  stubFetch();
  throwsConfig(() => api("/users/:id", { params: {} }), /the URL has :id but params\.id is missing/);
  throwsConfig(() => api("/users/:id"), /params\.id is missing/);
  throwsConfig(() => api("/users/:id", { params: { id: undefined } }), /params\.id must be/);
  throwsConfig(() => api("/users/:constructor", { params: {} }), /params\.constructor is missing/, "inherited keys don't count");
  throwsConfig(() => api("/users/:toString", { params: {} }), /params\.toString is missing/);
  assert.equal(calls.length, 0);
});

test("an unused param is rejected (catches params: { userId } for :id)", () => {
  stubFetch();
  throwsConfig(() => api("/users/:id", { params: { id: 123, unused: "value" } }), /params\.unused isn't used/);
  throwsConfig(() => api("/users/:id", { params: { userId: 1 } }), /params\.id is missing/);
  throwsConfig(() => api("/users", { params: { id: 1 } }), /params\.id isn't used/);
  assert.equal(calls.length, 0);
});

test("malformed or unsupported placeholders are refused, not guessed", () => {
  stubFetch();
  for (const tpl of ["/users/:user?", "/users/:id*", "/users/:{id}", "/users/:", "/users/:1id", "/users/:id.json", "/users/:id-x", "/users/:id+"]) {
    throwsConfig(() => api(tpl, { params: { user: 1, id: 1 } }), /unsupported placeholder/);
  }
  assert.equal(calls.length, 0);
  // A colon that doesn't start a segment is ordinary path text.
});

test("colons that don't start a segment are left alone", async () => {
  assert.equal((await requested("/api/time/12:30")).url, "https://app.example.com/api/time/12:30");
  assert.equal((await requested("https://app.example.com:443/api")).url, "https://app.example.com/api");
  assert.equal((await requested("/api/search?at=:now")).url, "https://app.example.com/api/search?at=:now", "a query string isn't templated");
});

test("unsupported param values are refused — no [object Object] in URLs", () => {
  stubFetch();
  for (const v of [{}, [], ["a"], () => 1, Symbol("s"), null, undefined, NaN, Infinity, new Date(0), new String("x")]) {
    throwsConfig(() => api("/users/:id", { params: { id: v } }), /params\.id must be a string, number, bigint or boolean/);
  }
  throwsConfig(() => api("/users/:id", { params: { id: "\uD800" } }), /not valid Unicode/);
  for (const bad of [null, [], "id", 1]) throwsConfig(() => api("/users/:id", { params: bad }), /params must be a plain object/);
  assert.equal(calls.length, 0);
});

test("params are read once, never mutated, and __proto__ keys are only keys", async () => {
  const params = Object.freeze({ id: "a/b" });
  assert.equal((await requested("/u/:id", { params })).url, "https://app.example.com/u/a%2Fb");
  let reads = 0;
  const counted = { get id() { reads++; return "x"; } };
  const r = await requested("/u/:id", { params: counted });
  assert.equal(r.url, "https://app.example.com/u/x");
  assert.equal(reads, 1, "a getter runs once");
  const evil = JSON.parse('{"__proto__": "p", "constructor": "c", "prototype": "q"}');
  assert.equal((await requested("/u/:__proto__/:constructor/:prototype", { params: evil })).url, "https://app.example.com/u/p/c/q");
  assert.equal({}.p, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.throws(() => api("/u/:id", { params: { get id() { throw new Error("getter side effect"); } } }), /getter side effect/, "a throwing getter surfaces as-is");
});

// ---- query -----------------------------------------------------------------------------------------

test("query values: string, number, bigint, boolean, '' kept; null/undefined omitted", async () => {
  const { url } = await requested("/api/search", { query: { q: "zoijs", page: 2, big: 10n, exact: true, off: false, empty: "", missing: null, other: undefined } });
  assert.equal(url, "https://app.example.com/api/search?q=zoijs&page=2&big=10&exact=true&off=false&empty=");
});

test("query values are encoded by URLSearchParams (Unicode, reserved characters)", async () => {
  const q = "a b&c=d?e#f/g%h+i ✓ \"<x>\"";
  const { url } = await requested("/api/search", { query: { q, "we ird&key": "1" } });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("q"), q, "round-trips exactly");
  assert.equal(parsed.searchParams.get("we ird&key"), "1");
  assert.equal(parsed.hash, "");
  assert.equal([...parsed.searchParams.keys()].length, 2, "no injected parameters");
  assert.ok(!url.includes("#"));
});

test("an existing query string is kept; option keys replace the template's", async () => {
  assert.equal((await requested("/api/users?active=true", { query: { page: 2 } })).url, "https://app.example.com/api/users?active=true&page=2");
  assert.equal((await requested("/api/users?page=1", { query: { page: 2 } })).url, "https://app.example.com/api/users?page=2");
  assert.equal((await requested("/api/users?page=1&page=3&x=1", { query: { page: 2 } })).url, "https://app.example.com/api/users?x=1&page=2", "every duplicate is replaced (delete + append)");
  assert.equal((await requested("/api/users?page=1", { query: { page: null } })).url, "https://app.example.com/api/users?page=1", "null contributes nothing");
  assert.equal((await requested("/api/users?", { query: { a: 1 } })).url, "https://app.example.com/api/users?a=1");
});

test("fragments are never requested and never reach errors", async () => {
  assert.equal((await requested("/api/users#section")).url, "https://app.example.com/api/users");
  assert.equal((await requested("/api/users/:id#frag-secret", { params: { id: 1 }, query: { a: 1 } })).url, "https://app.example.com/api/users/1?a=1");
  const { error } = await requested("/api/x?y=1#frag-secret", { query: { a: 1 } }, () => new Response("", { status: 404 }));
  assert.ok(!JSON.stringify({ ...error, m: error.message }).includes("frag-secret"));
  assert.equal(error.url, "https://app.example.com/api/x");
});

test("unsupported query values are refused with a hint toward the function form", () => {
  stubFetch();
  for (const v of [{ active: true }, () => "x", Symbol("s"), NaN, -Infinity, new Date(0)]) {
    throwsConfig(() => api("/api/search", { query: { filter: v } }), /query\.filter must be a string, number, bigint, boolean, null or undefined/);
  }
  throwsConfig(() => api("/api/search", { query: { q: { get: () => "" } } }), /pass a function: \(\) => \(\{ … \}\)/);
  for (const bad of [null, "q=1", [], 5]) throwsConfig(() => api("/api/search", { query: bad }), /query must be a plain object/);
  assert.equal(calls.length, 0);
});

test("the query object is read once, not mutated; __proto__ keys can't pollute", async () => {
  const query = Object.freeze({ q: "x", page: 1 });
  assert.equal((await requested("/s", { query })).url, "https://app.example.com/s?q=x&page=1");
  const evil = JSON.parse('{"__proto__": {"polluted": 1}, "constructor": "c", "prototype": "p"}');
  assert.throws(() => api("/s", { query: evil }), /query\.__proto__ must be/, "an object value is refused like any other");
  const keys = JSON.parse('{"__proto__": "a", "constructor": "c", "prototype": "p"}');
  assert.equal((await requested("/s", { query: keys })).url, "https://app.example.com/s?__proto__=a&constructor=c&prototype=p");
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  let reads = 0;
  const r = api("/s", { query: { get q() { reads++; return "x"; } } });
  await settle();
  r.refresh();
  await settle();
  assert.equal(reads, 1, "a static query's getter runs once, at api()");
});

// ---- secret-looking query keys ------------------------------------------------------------------

test("secret-looking query keys are refused (exact match after normalizing case and separators)", () => {
  stubFetch();
  const refused = ["token", "TOKEN", "Token", "access_token", "accessToken", "ACCESS-TOKEN", "refresh_token", "id_token", "apiKey", "apikey", "api_key", "API-KEY", "x-api-key",
    "password", "Password", "passwd", "secret", "client_secret", "clientSecret", "Authorization", "auth", "session", "session_id", "sessionId", "credential", "credentials", "jwt", "private_key"];
  for (const key of refused) {
    throwsConfig(() => api("/api/reset", { query: { [key]: "x" } }), /names a secret/);
    throwsConfig(() => api(`/api/reset?${encodeURIComponent(key)}=x`), /names a secret/, "in the template too");
  }
  throwsConfig(() => api("/api/reset", { query: { token: null } }), /names a secret/, "by key name only — even with no value");
  assert.equal(calls.length, 0);
});

test("look-alike but non-secret keys are allowed (no guessing, no value inspection)", async () => {
  for (const key of ["pageToken", "next_page_token", "tokenizer", "sessions", "author", "secretary", "keyword", "q"]) {
    const { url, error } = await requested("/api/search", { query: { [key]: "Bearer abc.def.ghi" } });
    assert.equal(error, null, key);
    assert.ok(url.includes(`${encodeURIComponent(key)}=`), key);
  }
});

test("the secret-key message names the key, never its value", () => {
  stubFetch();
  try {
    api("/api/reset", { query: { token: "tok-SECRET-123" } });
    assert.fail("should throw");
  } catch (e) {
    assert.match(e.message, /"token"/);
    assert.ok(!e.message.includes("tok-SECRET-123"));
  }
});

// ---- the built URL still passes Phase 1 -------------------------------------------------------------

test("params/query can't turn a same-origin template into another origin, scheme or credentials", async () => {
  const values = ["//evil.example", "https://evil.example", "evil.example", "javascript:alert(1)", "user:pw@evil.example", "\\\\evil.example", "@evil.example", "..", "%2F%2Fevil.example"];
  for (const v of values) {
    for (const tpl of ["/:p/x", ":p/x", "/api/:p"]) {
      let r;
      try {
        r = await requested(tpl, { params: { p: v } });
      } catch (e) {
        assert.ok(e instanceof TypeError && /can't be empty/.test(e.message), `${tpl} ${v}`);
        continue;
      }
      if (r.url) assert.equal(new URL(r.url).origin, "https://app.example.com", `${tpl} with ${v} → ${r.url}`);
      else assert.equal(r.error?.type, "security");
    }
    const q = await requested("/api/search", { query: { q: v, next: v } });
    assert.equal(new URL(q.url).origin, "https://app.example.com");
    assert.equal(new URL(q.url).pathname, "/api/search");
  }
});

test("the final URL is validated: a cross-origin template with params is still blocked", async () => {
  const r = await requested("https://evil.example/users/:id", { params: { id: 1 }, query: { a: 1 } });
  assert.equal(r.calls, 0);
  assert.equal(r.error.type, "security");
  const c = await requested("https://user:pw@app.example.com/users/:id", { params: { id: 1 } });
  assert.equal(c.calls, 0);
  assert.equal(c.error.type, "security");
  const p = await requested("//evil.example/:id", { params: { id: 1 } });
  assert.equal(p.calls, 0);
  assert.equal(p.error.type, "security");
});

test("params can't climb out of the route: /api/files/:name never resolves to /admin", async () => {
  for (const name of ["../../admin", "..\\..\\admin", "%2e%2e/%2e%2e/admin", "./../admin", "..;/admin"]) {
    const { url } = await requested("/api/files/:name", { params: { name } });
    assert.ok(new URL(url).pathname.startsWith("/api/files/"), `${name} → ${url}`);
    assert.equal(new URL(url).pathname.split("/").length, 4, name);
  }
});

// ---- error hygiene ---------------------------------------------------------------------------------------

test("built URLs keep error messages and monitoring data free of path, query and values", async () => {
  const reported = [];
  configure({ onError: (error, info) => reported.push({ error, info }) });
  try {
    const { error } = await requested("/api/reset/:code", { params: { code: "reset-SECRET" }, query: { email: "ada@example.com" } }, () => new Response("", { status: 404, statusText: "Not Found" }));
    assert.equal(error.message, "GET request failed: 404 Not Found");
    assert.equal(error.url, "https://app.example.com/api/reset/reset-SECRET", "url keeps origin + path (documented), never the query");
    const dump = JSON.stringify(reported.map((r) => ({ m: r.error.message, ...r.error, info: r.info })));
    for (const s of ["ada@example.com", "email", "?"]) assert.ok(!dump.includes(s), s);
    assert.ok(!error.message.includes("reset-SECRET"));
  } finally {
    configure({ onError: null });
  }
});

test("error() stays an ApiError for every Phase 2 failure", async () => {
  const r = await requested("https://evil.example/:id", { params: { id: 1 } });
  assert.ok(r.error instanceof ApiError);
});
