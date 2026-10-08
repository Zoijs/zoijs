<div align="center">

# @zoijs/api

**Same-origin data access for [Zoijs](https://zoijs.dev).** Reads as a resource, writes as an action — safe URL building, reactive queries, JSON bodies, invalidation, HTTP errors and a same-origin policy built in.

[![npm](https://img.shields.io/npm/v/@zoijs/api.svg)](https://www.npmjs.com/package/@zoijs/api)
[![license](https://img.shields.io/npm/l/@zoijs/api.svg)](LICENSE)

[Documentation](https://zoijs.dev) · [Core package](https://www.npmjs.com/package/@zoijs/core) · [@zoijs/resource](../resource/README.md) · [@zoijs/action](../action/README.md)

</div>

---

`@zoijs/api` is an **optional** package. It is a thin layer over
[`@zoijs/resource`](../resource/README.md) for reads and [`@zoijs/action`](../action/README.md)
for writes:

```js
const tasks = api("/api/tasks");                                   // a resource
const addTask = api.post("/api/tasks", { invalidate: tasks });     // an action
await addTask.run({ title: "Learn Zoijs" });                       // POST JSON, then tasks refreshes
```

with no `fetch`, `res.ok` check, `JSON.stringify`, `Content-Type` header or `refresh()` call
of your own.

## Install

```bash
npm install @zoijs/core @zoijs/resource @zoijs/action @zoijs/api
```

`@zoijs/core`, `@zoijs/resource` and `@zoijs/action` are peer dependencies. With no install, from
a CDN: in an import map, point "@zoijs/core", "@zoijs/resource", "@zoijs/action" and "@zoijs/api"
at **exact-version**
jsDelivr file URLs with integrity hashes, then import by name (so every package shares one
core). See the [CDN guide](https://zoijs.dev/installation#from-a-cdn).

```js
import { api } from "@zoijs/api";
```

## Usage

```js
import { html, mount, each } from "@zoijs/core";
import { api } from "@zoijs/api";

function Tasks() {
  const tasks = api("/api/tasks");

  return html`
    ${() => {
      if (tasks.loading() && !tasks.data()) return html`<p>Loading...</p>`;
      if (tasks.error())
        return html`<p role="alert">Failed: ${tasks.error().message}
          <button onclick=${() => tasks.refresh()}>Retry</button></p>`;
      return html`<ul>
        ${each(() => tasks.data() ?? [], (task) => task.id, (task) => html`<li>${task.title}</li>`)}
      </ul>`;
    }}
  `;
}

mount(Tasks, "#app");
```

`api(url)` returns the same object `resource()` does, with the same behavior:

```js
const users = api("/api/users");

users.data();    // the parsed response, or undefined before the first success (reactive)
users.loading(); // true while a request is in flight (reactive)
users.error();   // an ApiError, or null (reactive)
users.refresh(); // request again; keeps the current data until the new response settles
```

It loads once immediately, only the latest request can update it, it stops when its component
unmounts, and failures are reported to `configure({ onError })` as `kind: "resource"` — all of
that is `resource()`. A request superseded by `refresh()`, or still in flight when the component
unmounts, is also aborted.

## Dynamic URLs: `params` and `query`

`api(url, options)` accepts exactly three options: `params`, `query` and `debounce`. Any other
option (`method`, `headers`, `body`, …) throws a `TypeError` — `api()` is always a GET. You never
call `encodeURIComponent`, build a query string, or wire up `refresh()` timers yourself.

### Path parameters

```js
const task = api("/api/tasks/:id", { params: { id: taskId } });
// taskId = "abc/123"  →  GET /api/tasks/abc%2F123
```

- A placeholder is a whole path segment: `/:name`, where `name` is letters, digits and `_`
  (`:id`, `:userId`, `:task_id`). Anything else — `:id?`, `:id*`, `:{id}`, `:id.json` — throws.
  A colon elsewhere (`/time/12:30`, `host:8443`, the query string) is ordinary text.
- Each value becomes **exactly one segment**, encoded once: `/`, `\`, `?`, `#`, `%`, `:` and
  `@` are encoded, so `"../../admin"` is the single segment `..%2F..%2Fadmin`, and `"%2e%2e"` is the
  literal text `%2e%2e` (sent as `%252e%252e`). Don't pre-encode values.
- `""`, `"."` and `".."` throw — the URL standard treats `.`/`..` (even encoded as `%2e`) as
  "this/parent directory", so they can't be one data segment.
- Values may be a string, number (finite), bigint or boolean. Objects, arrays, functions,
  symbols, `null` and `undefined` throw, so `[object Object]` can't end up in a URL.
- **Strict:** a placeholder with no param throws, and so does a param the URL doesn't use —
  `params: { userId }` for `:id` is caught immediately instead of requesting `/users/:id`.
- A plain-object `params` is read once, when `api()` is called. For a param that changes, pass a
  function — see [Reactive params and queries](#reactive-params-and-queries).

### Query parameters

```js
const users = api("/api/users", { query: { active: true, page: 2 } });
// GET /api/users?active=true&page=2
```

| Value | Sent as |
|---|---|
| `"zoijs"` | `q=zoijs` (encoded by `URLSearchParams`) |
| `2`, `10n` | `page=2`, `big=10` (finite numbers only) |
| `true` / `false` | `exact=true` / `exact=false` |
| `""` | `empty=` |
| `null` / `undefined` | left out |
| `["new", "featured"]` | `tag=new&tag=featured` — repeated keys, each value encoded on its own |
| `["a", null, "b"]` | `tag=a&tag=b` — `null`/`undefined` elements are skipped |
| `[]` | no `tag` at all (and removes any `tag` the URL had) |
| objects, nested arrays, functions, symbols, `NaN` (also as array elements) | throw a `TypeError` |

```js
const products = api("/api/products", { query: { tag: ["new", "featured"] } });
// GET /api/products?tag=new&tag=featured
```

Arrays are one level deep, never JSON-encoded or comma-joined. Caller arrays and objects are only
read — frozen ones work.

The query is applied with the platform `URLSearchParams` after the URL is resolved. A query
already in the URL is kept, and a `query` key **replaces every value** the URL had for that key
(`delete`, then `append` each value — so it moves to the end):
`api("/api/products?tag=old&page=1", { query: { tag: ["a", "b"] } })` requests
`/api/products?page=1&tag=a&tag=b`. A `null`/`undefined` value leaves the URL's own value alone.
Fragments (`#…`) are never sent.

### Reactive params and queries

Pass a **function** as `params` or `query` to make it reactive. Read state inside it with
`.get()`; when that state changes, the URL is rebuilt and the request is sent again automatically:

```js
import { html, createState, each } from "@zoijs/core";
import { api } from "@zoijs/api";

function Search() {
  const q = createState("");
  const results = api("/api/search", { query: () => ({ q: q.get() }) });

  return html`
    <input type="search" oninput=${(e) => q.set(e.target.value)} />
    <ul>${each(() => results.data() ?? [], (r) => r.id, (r) => html`<li>${r.name}</li>`)}</ul>
  `;
}
```

```js
const id = createState("1");
const user = api("/api/users/:id", { params: () => ({ id: id.get() }) });
// GET /api/users/1 — then id.set("2") → GET /api/users/2
```

Both can be reactive at once, and every Phase 2 rule still applies to what the functions return:

```js
const results = api("/api/search/:scope", {
  params: () => ({ scope: scope.get() }),
  query: () => ({ q: q.get(), tag: selectedTags.get() }),
  debounce: 250,
});
```

- The functions run inside one core `computed()`; an `effect()` calls `refresh()` when the URL
  they build changes. It's the same tracking as everywhere else in Zoijs — no polling, no
  subscriptions of its own. A change that builds the same URL (e.g. `q.get().trim()`, or a new
  array with the same values) sends nothing.
- Changes in the same synchronous block are batched: `id.set("43"); page.set(2)` sends **one**
  request with both values.
- Only the latest request can update the data; earlier ones are aborted.
- `refresh()` always uses the current values, and isn't repeated by the automatic refetch.
- A plain-object `params` or `query` is static: no `computed`, `effect` or timer is created for it.
  Passing state itself (`query: { q }`) throws — use the function form.
- If a function throws, or returns something `api()` can't send (a missing, unused or `".."`
  param, an object, a secret-looking key), no request is sent and `error()` is an `ApiError` of
  type `"config"` (a throw is kept as its `cause`). The message names the param or key, never the
  value. The next valid change recovers.

Values are read as ordinary property accesses: static `params`/`query` once, when `api()` is
called; a function's result each time it runs. Getters work and run once per read; nothing is
copied, merged or mutated.

### Debounce

```js
const q = createState("");
const results = api("/api/search", { query: () => ({ q: q.get() }), debounce: 250 });
```

Typing `a`, `ab`, `abc`, `abcd` quickly sends **one** request, for `abcd`, 250 ms after the last
change — no timer code in your component.

- `debounce` is milliseconds, a finite number from `0` to `2147483647` (the browser timer limit).
  Negative numbers, `NaN`, `Infinity`, strings and anything else throw a `TypeError`. `0` (the
  default) refetches as soon as the batched change runs, with no timer.
- The **first load is immediate**; only reactive changes wait. Changes to `params` and `query`
  share one window: each change restarts it, and one request goes out with the latest values.
  Changing back to what was last requested cancels the pending refetch.
- **`refresh()` is never debounced**: it loads now with the current values and cancels a pending
  automatic refetch, so nothing is sent twice.
- With no reactive `params`/`query`, `debounce` does nothing and costs nothing.

### Lifetime and `dispose()`

An `api()` called while a component renders belongs to that component. When it unmounts, its
request is aborted, its tracking and any pending debounce are dropped — **you don't need to call
anything**.

For an `api()` created **outside** a component (at module level, in a store, in a test), nothing
owns it, so its reactive tracking would last as long as the state it reads. Stop it yourself:

```js
const events = api("/api/events", { query: () => ({ topic: topic.get() }) });

// later
events.dispose();
```

`dispose()` aborts the in-flight request (the resource keeps the data it had and stops loading —
nothing is reported to `onError`), cancels a pending debounce, and removes the `computed`/`effect`
from the reactive graph, so later state changes send nothing. It is idempotent and safe inside a
component too (the unmount that follows is a no-op). After it — including after the owning
component unmounts — `refresh()` throws an `ApiError` of type `"config"` rather than quietly
starting again.

### Secrets don't belong in URLs

URLs are stored in browser history, server and proxy logs, analytics and monitoring. `api()`
refuses query **keys** that name a credential — in `query` and in the URL itself — with a
`TypeError` (or a `"config"` `ApiError` from a reactive query). It never looks at values.

A key is refused when, lowercased with everything but letters and digits removed, it is exactly
one of: `token`, `accesstoken`, `refreshtoken`, `idtoken`, `authtoken`, `sessiontoken`,
`bearer`, `jwt`, `password`, `passwd`, `pwd`, `secret`, `clientsecret`, `apisecret`, `apikey`,
`xapikey`, `authorization`, `auth`, `session`, `sessionid`, `credential`, `credentials`,
`privatekey`. So `token`, `TOKEN`, `access_token`, `accessToken`, `api-key` and `Authorization`
are refused, while `pageToken`, `next_page_token`, `tokenizer` and `author` are not. Send
credentials in a header or a request body — and authorize on the server.

## Mutations: `api.post`, `api.put`, `api.patch`, `api.delete`

```js
import { html, each } from "@zoijs/core";
import { api } from "@zoijs/api";

function Tasks() {
  const tasks = api("/api/tasks");
  const addTask = api.post("/api/tasks", { invalidate: tasks, exclusive: true });
  const removeTask = api.delete("/api/tasks/:id", { invalidate: tasks });

  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    await addTask.run({ title: new FormData(form).get("title") });
    if (addTask.done()) form.reset();
  }

  return html`
    <form onsubmit=${submit}>
      <input name="title" required />
      <button disabled=${() => addTask.pending()}>${() => (addTask.pending() ? "Adding..." : "Add")}</button>
      ${() => (addTask.error() ? html`<p role="alert">${addTask.error().message}</p>` : null)}
    </form>
    <ul>
      ${each(() => tasks.data() ?? [], (task) => task.id, (task) => html`
        <li>${task.title}
          <button onclick=${() => removeTask.run({ params: { id: task.id } })}>Delete</button></li>`)}
    </ul>
  `;
}
```

Each factory returns an [`@zoijs/action`](../action/README.md): `run()`, and reactive
`pending()`, `error()`, `done()`, `result()`, plus `reset()`. Nothing is sent until `run()`.
`run()` **never rejects** — it resolves with the parsed response, or `undefined` on failure, and
the failure is in `error()` (an `ApiError`, reported to `configure({ onError })` as
`kind: "action"`). No `try`/`catch` needed for normal error handling.

### What `run()` takes

The URL decides — never the shape of the argument:

| Method | URL without `/:name` | URL with `/:name` placeholders |
|---|---|---|
| `api.post` / `api.put` / `api.patch` | `run(body)` — the argument **is** the JSON body; `run()` sends none | `run({ params, body })` — `body` optional; any other key throws |
| `api.delete` | `run()` — any argument is refused | `run({ params })` — a `body` is refused |

```js
const updateTask = api.put("/api/tasks/:id");
await updateTask.run({ params: { id: task.id }, body: { title: "Updated" } });

const patchTask = api.patch("/api/tasks/:id");
await patchTask.run({ params: { id: task.id }, body: { completed: true } });

const removeTask = api.delete("/api/tasks/:id", { query: { hard: true } });
await removeTask.run({ params: { id: task.id } }); // DELETE /api/tasks/42?hard=true
```

So with `api.post("/api/raw")`, `run({ params: …, body: … })` sends that whole object as the
body; with `/:name` in the URL, params and body are always separate, so form data can't leak into
the path or vice versa. `params` follow every `api()` path rule (one encoded segment each, strict
missing/unused checks, `"."`/`".."` refused). Mistakes in `run()`'s input don't throw: no request
is sent and `error()` is a `"config"` `ApiError`.

### JSON bodies

The body is sent with `JSON.stringify` and `Content-Type: application/json` (plus the same
`Accept` header as GETs). You can't set or override headers.

- Sent: `null`, strings, finite numbers, booleans, arrays and plain objects (also
  `Object.create(null)` ones), nested freely. Objects with `toJSON` (e.g. `Date`) send their
  `toJSON()`. An `undefined` property is left out, as in JSON.
- **Refused** — no request is sent, `error()` is a `"config"` `ApiError`: `bigint` (never
  coerced), functions and symbols (JSON would silently drop them), `NaN`/`Infinity` (JSON would
  send `null`), `Map`, `Set` and class instances (JSON would send `{}`), cycles, and getters or
  `toJSON` that throw.
- Getters run once, as plain `JSON.stringify` would run them; the body is never cloned, merged
  or mutated. `__proto__`, `constructor` and `prototype` are ordinary JSON keys.
- Error messages never contain the body — not a value, not a key, not the platform's own
  serialization message.
- No body (`run()`) means no body **and** no `Content-Type` — never the text `"undefined"`.
- A `FormData` body is sent as multipart instead — see [File uploads](#file-uploads-formdata).
  Other body types (`Blob`, `ArrayBuffer`, `URLSearchParams`, streams) are refused.

Responses are parsed exactly like GETs (JSON, `204`/`205` → `null`, text as a string,
non-2xx → `"http"`, invalid JSON → `"parse"`), and every URL gets the same same-origin checks.

### Options

`api.post/put/patch/delete(url, options)` accepts only:

- **`query`** — a static object, with the same rules and secret-key refusal as `api()`. Per-call
  values go in `params`.
- **`invalidate`** — an `api()` resource, or an array of them, to refresh after success.
- **`exclusive`** — `true` makes a double submit send once: while a run is pending, `run()` returns
  that run's promise instead of sending again. Default `false`, exactly as in `@zoijs/action`.
- **`timeout`** and **`problemDetails`** — as for `api()`; see [Timeouts](#timeouts) and
  [Problem details](#problem-details).
- **`idempotencyKey`**, **`retry`** and **`retryDelay`** — see
  [Idempotency keys and retries](#idempotency-keys-and-retries). Mutation-only.

Anything else — `headers`, `method`, `credentials`, `mode`, `redirect`, `cache`, `initial`, … —
throws.

### Invalidation

```js
const tasks = api("/api/tasks");
const dashboard = api("/api/dashboard");
const save = api.post("/api/tasks", { invalidate: [tasks, dashboard] });
```

- Only after the server **succeeds**: never after an HTTP, network, parse or config failure.
- After the mutation's success state is set. **`run()` doesn't wait** for the refreshes — they
  continue on their own, so a slow list doesn't make the save slow.
- A refresh that then fails is **the resource's** failure: it shows in that resource's `error()`
  (and `onError` as `kind: "resource"`) and never marks the mutation as failed.
- Each resource refreshes once per successful run (listed twice → once; a call that joined an
  `exclusive` run doesn't refresh again). It refreshes with its current params/query and skips a
  pending debounce.
- A disposed or unmounted resource is skipped quietly — a stale view can't turn a successful
  save into an error. If the mutation's own component unmounted while the request was in
  flight, the action ignores the late result (as `@zoijs/action` does) but live resources are
  still refreshed: the server did change.
- Only real `api()` resources are accepted. An object with a `refresh()` method, a copy of a
  resource or a mutation throws a `TypeError`: resources are tracked privately, so they can't
  be spoofed. Nothing is invalidated by guessing from URLs.

### No implicit retries, no cancellation, no optimism

- **Mutations are never retried unless you opt in** with `idempotencyKey: true` and `retry` — see
  [Idempotency keys and retries](#idempotency-keys-and-retries). Repeating a POST can create a
  second order, payment or email.
- **Unmounting doesn't abort a mutation.** An in-flight request runs to completion even if its
  component unmounts. Only an explicit `timeout` aborts one — and that only stops the browser
  *waiting*: it never undoes the server operation.
- Updates aren't optimistic: the UI changes when the server answers and the invalidated
  resources reload.

Cookies are sent same-origin, as for any `fetch`. Protect state-changing endpoints against
[CSRF](https://zoijs.dev/production-security#5-protect-state-changing-requests-against-csrf) on the
server, and authorize and validate every request there — client-side checks are not access
control.

### File uploads (`FormData`)

```js
const upload = api.post("/api/users/:id/photo", { invalidate: profile, exclusive: true });

const form = new FormData();
form.append("file", file);
form.append("description", "Profile photo");
await upload.run({ params: { id }, body: form }); // or upload.run(form) for a URL without /:name
```

- A `FormData` body goes to `fetch` as-is: no `JSON.stringify` and **no `Content-Type`** — the
  browser writes `multipart/form-data` with its own boundary. (JSON bodies get
  `application/json`; no body gets no `Content-Type`.)
- It's recognized by the platform's own FormData brand check, so a FormData from another realm
  (an iframe) works, while an object that only looks like one — `append()`/`entries()`, or
  `Object.create(FormData.prototype)` — is refused. A FormData nested inside a JSON object, and
  a DELETE body, are refused.
- Invalidation, `exclusive`, `timeout` and `problemDetails` work as for JSON. The form is never
  cloned, read or enumerated, and its field names and values never appear in errors.
- Nothing about the file is checked in the browser. The **server** must authenticate, authorize,
  and enforce file type and size, scan where appropriate, and control where files are stored.

## Timeouts

```js
const users = api("/api/users", { timeout: 10_000 });
const save = api.post("/api/orders", { timeout: 15_000 });
```

- Milliseconds, a finite number from `0` to `2147483647`; anything else throws a `TypeError`.
  **`0` (the default) means no timeout.** Not reactive.
- The clock starts when the request starts — **after** any `debounce` — and covers the whole
  response. When it runs out, the request is really aborted (nothing is left running) and the
  error is an `ApiError` of **type `"timeout"`**, `status` `null`, message
  `"GET request timed out"` (no duration, no platform `AbortError` text).
- `refresh()` uses the same timeout; a request replaced by `refresh()`, a reactive change,
  `dispose()` or unmount is aborted quietly and is never reported as a timeout. Timers are
  cleared when the request ends, however it ends.
- **A mutation timeout doesn't mean the server didn't act.** The order may have been placed; the
  browser just stopped waiting. A timed-out mutation is only retried if you opted in with an
  idempotency key and `retry`; otherwise reload the data (or check with the server) before
  letting the user try again.
- With `retry`, **each attempt gets its own `timeout` window**; the backoff waits between
  attempts aren't counted.

## Idempotency keys and retries

```js
const createOrder = api.post("/api/orders", {
  idempotencyKey: true,
  retry: 2,
  timeout: 10_000,
});

await createOrder.run({ sku: "ABC-123", quantity: 1 });
```

> **The server contract.** Sending an `Idempotency-Key` header does **not** make an endpoint
> idempotent. Your server must store each key and, when it sees a key again, return the original
> outcome instead of performing the operation a second time — according to its own idempotency
> policy (how long keys are kept, what a key reused with a different body means). Zoijs can't
> prevent duplicates without that cooperation.

**Retries are off by default** — a mutation makes exactly one attempt. To retry, you opt in
twice: `idempotencyKey: true` *and* `retry`. `retry` without `idempotencyKey: true` throws, for
**every** method: PUT, PATCH and DELETE aren't assumed to be idempotent either. So: if Zoijs
retries a mutation, it always sends an idempotency key.

### Idempotency keys

- `idempotencyKey: true` sends `Idempotency-Key: <uuid>` — a v4 UUID from
  `crypto.randomUUID()` (or built from `crypto.getRandomValues()` where `randomUUID` isn't
  available). Never `Math.random`; with no cryptographic source the run fails with a `"config"`
  error and nothing is sent.
- **One key per logical `run()`**: every retry of that run reuses it, and the next `run()` gets a
  new one. A call that joins an `exclusive` run shares that run's key and attempts.
- The key goes only in that header — never in the URL, query, body, `error.message`,
  `error.url`, problem details, the console or monitoring. Treat it like a credential.
- It works without `retry` too (a single attempt with a key).

### Your own keys

When the operation already has an identity — a checkout session, a draft, a client-side
operation id — pass a **function** that returns the key for the operation being run:

```js
const save = api.post("/api/orders", {
  idempotencyKey: () => currentOperationId(),
  retry: 2,
});
```

- The function is called **once per logical `run()`** — not per retry, and only once for
  `exclusive` calls that join a run. The next independent `run()` calls it again.
- It must return **1–255 visible ASCII characters** (`!` to `~`): no spaces, no control
  characters (so no CR, LF or NUL — a key can never inject a header), no non-ASCII. Nothing is
  trimmed or normalized: what's accepted is sent byte for byte. Anything else — or a function
  that throws — fails the run with a `"config"` error before any request; neither the value nor
  the thrown message is echoed.
- A **fixed string** (`idempotencyKey: "checkout-abc"`) is refused with a `TypeError`: the same
  key would be sent by *every* `run()` of that mutation, so the server would treat a second,
  different order as a repeat of the first.
- **Each key must stand for exactly one logical server operation.** Don't return a key that was
  already used for a different operation — the server will (correctly) treat it as a repeat.
- Your keys get the same privacy as generated ones: only in the header, never in URLs, bodies,
  errors or monitoring.

### What's retried

`retry: n` means **up to n extra attempts** after the first — `retry: 2` is at most 3 requests.
`n` is a whole number from 0 to 5.

| Failure | Retried? |
|---|---|
| network error (offline, connection reset, DNS) | yes |
| `"timeout"` (the `timeout` option ran out) | yes |
| HTTP 408, 425, 429, 500, 502, 503, 504 | yes |
| any other HTTP status — e.g. 400, 401, 403, 404, 405, 409, 410, 412, 422 | no |
| `"parse"`, `"config"`, `"security"` | never |

409 Conflict isn't retried: it isn't assumed to mean "idempotency key in use".

### Backoff and `Retry-After`

- Retry *n* waits about `retryDelay × 2^(n-1)`, with **±20 % jitter** (a factor between 0.8 and
  1.2) so clients that failed at the same moment don't all retry at the same moment. With the
  default `retryDelay: 250`: 200–300 ms, 400–600 ms, 0.8–1.2 s, 1.6–2.4 s, 3.2–4.8 s. Every wait —
  jitter included — is capped at 30 s. `retryDelay` is milliseconds (validated like `timeout`)
  and needs `retry`.
- On 429 and 503, a `Retry-After` header — seconds (`Retry-After: 5`) or an HTTP-date — makes the
  wait at least that long, and is **not jittered**: never shorter than the server asked. If it
  asks for **more than 30 s**, the request stops retrying and
  fails with that response instead of retrying early — deliberately: respecting the server's
  `Retry-After` matters more than one more attempt. An unparseable value is ignored.

### One logical run

- `pending()` stays `true` through every attempt and wait; `done()` becomes `true` only when an
  attempt succeeds, and `result()` is that response.
- Failed attempts that are retried never show in `error()` and are never reported to
  `configure({ onError })`: a mutation that recovers reports nothing. If every attempt fails,
  `error()` is the **last** attempt's error and it is reported once.
- `invalidate` refreshes its resources **once**, after the run finally succeeds — never after a
  failed attempt, never after exhaustion.
- The request is built **once per run** and replayed exactly: same method, URL, query, key and
  body bytes. A JSON body is serialized once — getters and `toJSON` run once, not per attempt.
- With `problemDetails: true`, only the final error's problem body is read; retried responses are
  discarded unread.
- **When the component unmounts**, an attempt already sent may finish (its result is ignored, as
  `@zoijs/action` does), but a scheduled retry is cancelled and no new attempt starts. The same
  goes for `reset()`, and for a run superseded by a newer (non-`exclusive`) `run()`: nobody is
  waiting for its result, so it isn't retried.
- **FormData bodies can't be retried yet**: `retry > 0` with a FormData body is a `"config"` error
  and nothing is sent. Uploads can still send an idempotency key with `retry: 0`. (FormData replay
  is being verified across Chromium, Firefox and WebKit before it's enabled.)
- GET resources retry too — see [GET retries](#get-retries).

### Showing retries in the UI

```js
${() => (save.retrying() ? html`<p>Retrying request…</p>` : null)}
```

Two reactive readers sit next to the action's `pending()`, `done()`, `error()` and `result()`:

| | idle | 1st attempt | waiting after a failure | 2nd attempt | succeeded | gave up |
|---|---|---|---|---|---|---|
| `attempt()` | 0 | 1 | 1 | 2 | 2 (kept) | last attempt (kept) |
| `retrying()` | `false` | `false` | `true` | `true` | `false` | `false` |
| `pending()` | `false` | `true` | `true` | `true` | `false` | `false` |

- `attempt()` is the attempt in flight, or the last one finished; it's kept after the run ends
  until the next `run()` (which starts again at 1) or `reset()` (back to 0).
- Without `retry`, `attempt()` goes 0 → 1 and `retrying()` stays `false`; both methods exist on
  every mutation.
- `exclusive` joiners share one run, so they see the same values. Only the newest run writes them.
- They are ordinary state: changing them never reports anything to `onError`, and they keep no
  timers, bodies or keys.

## GET retries

```js
const users = api("/api/users", { retry: 2 });
```

- **Off by default.** `retry: n` (0–5) allows up to n extra attempts — `retry: 2` is at most 3
  requests — with the same table as mutations: network errors, timeouts and HTTP 408, 425, 429,
  500, 502, 503, 504; never other statuses, `"parse"`, `"config"` or `"security"`.
- No idempotency key is needed: Zoijs treats GET as read-only. **Don't attach side effects to
  GET endpoints** — a retried GET runs again on the server.
- The same backoff, jitter, `retryDelay`, 30 s cap and `Retry-After` rules apply.
  `retryDelay` without `retry` throws. `idempotencyKey`, `exclusive` and `invalidate` are
  mutation-only and refused here.
- **One logical load.** `loading()` stays `true` through every attempt and wait; retried failures
  never show in `error()` and aren't reported to `onError`. A load that recovers ends with
  `error()` `null` and the new `data()`; one that runs out reports its last error once (as
  `kind: "resource"`).
- Every attempt replays **the same URL**: params and query are read once per load. A reactive
  change or `refresh()` cancels a scheduled retry and starts a **new** load (with a fresh retry
  count) for the current URL — the old URL is never retried again. `dispose()` and unmount cancel
  it too.
- `debounce` runs once, before the first attempt; between attempts there's backoff, not debounce.
  Each attempt gets its own `timeout`; backoff isn't counted.
- `initial` isn't an attempt: no request until `refresh()` or a reactive change, which may then
  retry.
- With `problemDetails: true`, only the final error's problem body is read.
- GET resources don't have `attempt()` / `retrying()`: a resource stays one plain
  `data`/`loading`/`error` shape. Use `loading()` to show progress.

## Problem details

Error bodies are private by default: an `ApiError` never contains the response body. With
`problemDetails: true` (on `api()` or a mutation), an error response whose type is
`application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)) is read and
normalized into `error.problem`:

```js
const save = api.post("/api/users", { problemDetails: true });
await save.run({ email: "" });
save.error()?.message;         // "POST request failed: 422 Unprocessable Content" — still generic
save.error()?.problem?.detail; // "email is required"
```

- Only `type`, `title`, `detail`, `instance` (strings) and `status` (an integer) are kept, and
  only with those types; extension members are ignored. `error.problem` is a frozen plain
  object, or `null` — always `null` without the option, for other media types (even
  `application/json`), and for 2xx responses (those are data, as always).
- At most **64 KB** is read: a body declared or found to be larger is dropped, and a body that
  isn't a JSON object is ignored. Either way the error stays the ordinary `"http"` error — a bad
  problem body never turns it into a `"parse"` error.
- The values come from the server and are **untrusted**: they are never put in `error.message`
  (so they don't flow into logs by default). Render them as text, as Zoijs bindings do; don't
  treat `instance` or `type` as a link to follow.

## Server rendering: `initial`

```js
const users = api("/api/users", { initial: serverUsers });
users.data();    // serverUsers — the same value, not a copy
users.loading(); // false
users.error();   // null
```

- `initial` seeds the resource and **skips the first request**. `refresh()` fetches normally, and
  so do later reactive `params`/`query` changes — the seed stands for the URL as it was when the
  resource was created. A change that builds the same URL sends nothing.
- The key's **presence** counts: `{ initial: undefined }` and `{ initial: null }` seed too;
  leaving the key out loads normally.
- The value is kept exactly as given — never cloned, sanitized or merged — and renders with the
  usual escaping.
- **On the server**, `api(url, { initial })` creates the resource without any request, so a
  component can render with server data. `api()` still has no server networking model: without
  `initial` — or on `refresh()` — a request on the server fails with a `"security"` error, as
  there is no page origin. Fetch on the server with your own code, pass the result as
  `initial`, and serialize it for the client (see `@zoijs/ssr`'s `serialize`).
- Mutations don't take `initial`.

## Responses

| Response | `data()` | `error()` |
|---|---|---|
| 2xx with a JSON type (`application/json`, `application/json; charset=utf-8`, `application/problem+json`, any `…+json`) | the parsed value | `null` |
| 204 / 205, or a JSON type with an empty body | `null` | `null` |
| 2xx with any other type (or none) | the body as a string | `null` |
| 2xx JSON type with an invalid body | unchanged | `ApiError`, `type: "parse"` |
| any status outside 200–299 (400, 401, 403, 404, 409, 500, 503, …) | unchanged | `ApiError`, `type: "http"` |
| the request couldn't be made (offline, DNS, refused, a cross-origin redirect) | unchanged | `ApiError`, `type: "network"` |
| the URL isn't allowed (see below) — no request is sent | unchanged | `ApiError`, `type: "security"` |
| reactive params/query produced something `api()` can't send — no request is sent | unchanged | `ApiError`, `type: "config"` |
| the `timeout` ran out — the request is aborted | unchanged | `ApiError`, `type: "timeout"` |

A string body is plain data. Zoijs renders it as text — it is never parsed as HTML or run as
script. To render trusted HTML you must opt in yourself (see
[`@zoijs/sanitize`](../sanitize/README.md)).

## `ApiError`

Every failure — from `api()` and from mutations — is an `ApiError` (it extends `Error`):

```js
import { api, ApiError } from "@zoijs/api";

const users = api("/api/users");

users.error()?.type;   // "http" | "network" | "security" | "parse" | "config" | "timeout"
users.error()?.status; // 404 — the HTTP status ("http"/"parse"), otherwise null
```

| Field | Value |
|---|---|
| `name` | `"ApiError"` |
| `type` | `"http"`, `"network"`, `"security"`, `"parse"`, `"config"` or `"timeout"` |
| `status` | the HTTP status, or `null` |
| `statusText` | the HTTP status text, or `""` (HTTP/2 has none) |
| `method` | `"GET"`, `"POST"`, `"PUT"`, `"PATCH"` or `"DELETE"` |
| `url` | origin + path, e.g. `"https://app.example.com/api/users"` — no query string or fragment; `null` for an unparseable URL |
| `message` | e.g. `"GET request failed: 404 Not Found"`, `"POST request not sent: …"` — no URL path |
| `problem` | normalized problem details with `problemDetails: true`, otherwise `null` (see [Problem details](#problem-details)) |

The message is built to be **safe to log**: it never contains the URL path, query string or
fragment, URL credentials, request or response headers, cookies, the request body, or the
response body — paths
can carry identifiers or tokens (`/reset/<token>`). Only a blocked cross-origin request names
the target origin. If you need the endpoint, read `error.url` (origin + path, never the query
string or fragment) and decide yourself whether to log it — with `params`, the path includes
the param values.

## Same-origin only

`api()` only requests URLs on the page's own origin. Relative URLs are the normal case:

```js
api("/api/users");                          // ✔ same origin
api("api/users");                           // ✔ resolved against the document's base URL, like fetch()
api("https://app.example.com/api/users");   // ✔ when the page is on https://app.example.com
api("https://unknown.example/users");       // ✘ ApiError type "security" — no request is sent
```

The check runs on the **final** URL — after `params` and `query` are applied — so neither can
turn a same-origin URL into another one. The URL is resolved with the platform `URL` API and compared by origin (scheme + host + port),
so look-alikes are refused too: `//evil.example`, `/\evil.example`, `http://` on an `https://`
page, another port, `https://app.example.com.evil.example`, and non-HTTP schemes (`javascript:`,
`data:`, `blob:`). URLs with credentials (`https://user:pass@…`) are refused. With no http(s)
page origin to compare against (no `location`, a `file://` page, a sandboxed iframe), every
request is refused.

The request itself is sent with `mode: "same-origin"` and `credentials: "same-origin"`, so the
**browser** also enforces it: a same-origin URL that redirects to another origin fails.
`api()` doesn't touch CORS, CSP or any other browser protection — it adds a check on top.

This is a client-side guard against requesting the wrong place, not access control. Your
server must still authenticate and authorize every request. For cookies, credentials and CSP,
see the [production security checklist](https://zoijs.dev/production-security).

## Security at a glance

`@zoijs/api` makes the short code the safe code in the browser. It is **not** access control:

- **Your server must authenticate, authorize and validate every request.** Nothing here replaces
  that, and cookies are sent same-origin as with any `fetch` — protect writes against
  [CSRF](https://zoijs.dev/production-security#5-protect-state-changing-requests-against-csrf).
- **Cross-origin requests are blocked** — no trusted-origin list exists yet.
- **Secret-looking query keys are refused**; credentials belong in headers or bodies, not URLs.
- **Retries are opt-in and bounded** (≤ 5 extra attempts, ≤ 30 s waits); mutation retries
  require an idempotency key.
- **An `Idempotency-Key` only helps if your server stores and enforces it.**
- **A client timeout doesn't prove the server didn't act** — the operation may have completed.
- **Problem details are untrusted server text** — render them as text, never as HTML or a link.
- **FormData isn't validated** — check file type, size and content on the server.

## In this version

- **JSON and `FormData` bodies only** — no `Blob`, `ArrayBuffer`, `URLSearchParams` or streams.
- **Explicit invalidation only** — no cache, no deduplication, no URL-based invalidation.
- **No implicit retries**: retries are opt-in (`retry`) and bounded (≤ 5, ≤ 30 s waits); mutation
  retries also need an idempotency key. **No custom headers, fixed-string idempotency keys,
  FormData retries (yet) or optimistic updates.**
- **Browser requests only.** Requests need a page origin; on the server, use `initial`.

## License

MIT
