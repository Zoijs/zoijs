<div align="center">

# @zoijs/api

**Same-origin GET requests for [Zoijs](https://zoijs.dev), as a resource.** HTTP errors, JSON parsing and a same-origin policy built in.

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

A string body is plain data. Zoijs renders it as text — it is never parsed as HTML or run as
script. To render trusted HTML you must opt in yourself (see
[`@zoijs/sanitize`](../sanitize/README.md)).

## `ApiError`

Every failure is an `ApiError` (it extends `Error`):

```js
import { api, ApiError } from "@zoijs/api";

const users = api("/api/users");

users.error()?.type;   // "http" | "network" | "security" | "parse"
users.error()?.status; // 404 — the HTTP status ("http"/"parse"), otherwise null
```

| Field | Value |
|---|---|
| `name` | `"ApiError"` |
| `type` | `"http"`, `"network"`, `"security"` or `"parse"` |
| `status` | the HTTP status, or `null` |
| `statusText` | the HTTP status text, or `""` (HTTP/2 has none) |
| `method` | `"GET"` |
| `url` | origin + path, e.g. `"https://app.example.com/api/users"` — no query string or fragment; `null` for an unparseable URL |
| `message` | e.g. `"GET request failed: 404 Not Found"` — no URL path |

The message is built to be **safe to log**: it never contains the URL path, query string or
fragment, URL credentials, request or response headers, cookies, or the response body — paths
can carry identifiers or tokens (`/reset/<token>`). Only a blocked cross-origin request names
the target origin. If you need the endpoint, read `error.url` (origin + path, never the query
string or fragment) and decide yourself whether to log it.

## Same-origin only

`api()` only requests URLs on the page's own origin. Relative URLs are the normal case:

```js
api("/api/users");                          // ✔ same origin
api("api/users");                           // ✔ resolved against the document's base URL, like fetch()
api("https://app.example.com/api/users");   // ✔ when the page is on https://app.example.com
api("https://unknown.example/users");       // ✘ ApiError type "security" — no request is sent
```

The URL is resolved with the platform `URL` API and compared by origin (scheme + host + port),
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

- **GET only.** `api(url)` takes one string and always performs a GET; it accepts no options.
  For writes, use [`@zoijs/action`](../action/README.md).
- **No automatic re-fetch.** Like `resource()`, it doesn't track state; call `refresh()`.
  Router pages remount on navigation, so a page's `api()` loads again for each new URL.
- **Browser only.** It needs a page origin; on the server every request is refused.

## License

MIT
