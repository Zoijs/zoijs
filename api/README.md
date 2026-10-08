<div align="center">

# @zoijs/api

**Same-origin GET requests for [Zoijs](https://zoijs.dev), as a resource.** Safe URL building, reactive queries, HTTP errors, JSON parsing and a same-origin policy built in.

[![npm](https://img.shields.io/npm/v/@zoijs/api.svg)](https://www.npmjs.com/package/@zoijs/api)
[![license](https://img.shields.io/npm/l/@zoijs/api.svg)](LICENSE)

[Documentation](https://zoijs.dev) · [Core package](https://www.npmjs.com/package/@zoijs/core) · [@zoijs/resource](../resource/README.md)

</div>

---

`@zoijs/api` is an **optional** package. It is a thin layer over
[`@zoijs/resource`](../resource/README.md):

```js
const tasks = api("/api/tasks");
```

does what this does, without the helper you'd otherwise write yourself:

```js
const tasks = resource(() => getJSON("/api/tasks")); // getJSON: fetch + res.ok check + res.json()
```

## Install

```bash
npm install @zoijs/core @zoijs/resource @zoijs/api
```

`@zoijs/core` and `@zoijs/resource` are peer dependencies. With no install, from a CDN: in an
import map, point "@zoijs/core", "@zoijs/resource" and "@zoijs/api" at **exact-version**
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

`api(url, options)` accepts exactly two options, `params` and `query`. Any other option
(`method`, `headers`, `body`, …) throws a `TypeError` — `api()` is always a GET. You never call
`encodeURIComponent` or build a query string yourself.

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
- `params` are read once, when `api()` is called. They are **not reactive**: for a different id,
  create a new `api()` (router pages remount on navigation, so a page's `api()` does this).

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
| objects, arrays, functions, symbols, `NaN` | throw a `TypeError` (arrays aren't supported yet) |

The query is applied with `URLSearchParams.set`, after the URL is resolved. A query already in
the URL is kept, and a `query` key **replaces** the URL's value(s) for that key:
`api("/api/users?page=1&active=true", { query: { page: 2 } })` requests
`/api/users?page=2&active=true`. A `null`/`undefined` value leaves the URL's own value alone.
Fragments (`#…`) are never sent.

### Reactive queries

Pass a **function** to make the query reactive. Read state inside it with `.get()`; when that
state changes, the request is sent again automatically:

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

- The function runs inside a core `computed()`; an `effect()` calls `refresh()` when the query
  it builds changes. It's the same tracking as everywhere else in Zoijs — no polling, no
  subscriptions of its own.
- Changes in the same synchronous block are batched: `q.set("a"); page.set(2)` sends **one**
  request with both values. A change that builds the same query (e.g. `q.get().trim()`) sends none.
- Only the latest request can update the data; earlier ones are aborted.
- `refresh()` always uses the current values, and isn't repeated by the automatic refetch.
- Tracking belongs to the component that called `api()` and stops when it unmounts.
- A plain-object `query` is static: no `computed` or `effect` is created for it. Passing state
  itself (`query: { q }`) throws — use the function form.
- There's no debounce: every committed change sends a request (stale ones are aborted).
- If the function throws, returns an unsupported value or a secret-looking key, no request is
  sent and `error()` is an `ApiError` of type `"config"` (a throw is kept as its `cause`).

Values are read as ordinary property accesses: `params` and a static `query` once, when `api()`
is called; a query function's result each time it runs. Getters work and run once per read;
nothing is copied, merged or mutated.

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
| a reactive query produced an unsupported value or a secret-looking key — no request is sent | unchanged | `ApiError`, `type: "config"` |

A string body is plain data. Zoijs renders it as text — it is never parsed as HTML or run as
script. To render trusted HTML you must opt in yourself (see
[`@zoijs/sanitize`](../sanitize/README.md)).

## `ApiError`

Every failure is an `ApiError` (it extends `Error`):

```js
import { api, ApiError } from "@zoijs/api";

const users = api("/api/users");

users.error()?.type;   // "http" | "network" | "security" | "parse" | "config"
users.error()?.status; // 404 — the HTTP status ("http"/"parse"), otherwise null
```

| Field | Value |
|---|---|
| `name` | `"ApiError"` |
| `type` | `"http"`, `"network"`, `"security"`, `"parse"` or `"config"` |
| `status` | the HTTP status, or `null` |
| `statusText` | the HTTP status text, or `""` (HTTP/2 has none) |
| `method` | `"GET"` |
| `url` | origin + path, e.g. `"https://app.example.com/api/users"` — no query string or fragment; `null` for an unparseable URL |
| `message` | e.g. `"GET request failed: 404 Not Found"` — no URL path |

The message is built to be **safe to log**: it never contains the URL path, query string or
fragment, URL credentials, request or response headers, cookies, or the response body — paths
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

## In this version

- **GET only.** `api()` accepts only `params` and `query`, and always performs a GET.
  For writes, use [`@zoijs/action`](../action/README.md).
- **Reactive queries, static params.** Only a `query` function refetches on change; `params` are
  fixed per `api()` call. Router pages remount on navigation, so a page's `api()` loads again.
- **No debounce, no arrays in queries.**
- **Browser only.** It needs a page origin; on the server every request is refused.

## License

MIT
