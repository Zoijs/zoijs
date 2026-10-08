# Changelog

All notable changes to `@zoijs/api` are documented here.

## [Unreleased]

## 0.1.0 — unreleased

Initial release: secure same-origin reads (`api()`) and writes (`api.post/put/patch/delete`) — safe dynamic URLs, reactive params and queries, debounce, disposal, JSON bodies and explicit invalidation.

### Added
- **`api(url)`** — GET a same-origin URL as a `resource()`: the same `data()` / `loading()` /
  `error()` / `refresh()`, initial load, latest-request-wins, cleanup on unmount and
  `configure({ onError })` reporting (`kind: "resource"`), all provided by `@zoijs/resource`.
  A superseded or unmounted request is also aborted.
- **Responses** — non-2xx statuses are failures; JSON types (`application/json` with
  parameters, `…+json`) are parsed; 204/205 and empty JSON bodies are `null`; other bodies are
  strings, never interpreted as HTML or script.
- **`ApiError`** — `name`, `type` (`"http"` / `"network"` / `"security"` / `"parse"`), `status`,
  `statusText`, `method`, `url` (origin + path) and a log-safe `message`: no URL path, query
  string, fragment, URL credentials, headers, cookies or response body.
- **Same-origin policy** — URLs are resolved with the `URL` API and must be http(s) on the page's
  origin; anything else (including credentials in the URL, or no page origin) is refused before a
  request is made. Requests use `mode: "same-origin"` and `credentials: "same-origin"`, so the
  browser also refuses cross-origin redirects.
- **`api(url, { params, query })`** — the only two options; anything else (`method`, `headers`, …)
  throws. `params` fill whole `/:name` segments, each value encoded once as exactly one segment
  (`""`, `"."` and `".."` refused); a missing or unused param, an unsupported placeholder
  (`:id?`, `:id*`, `:{id}`) or a non-primitive value throws. `query` is applied with
  `URLSearchParams` (`delete` + `append`, replacing every value the URL had for that key);
  `null`/`undefined` are left out; objects throw. The final URL then goes through every same-origin check.
- **Reactive queries** — `query: () => ({ q: search.get() })` runs in a core `computed()`; an
  `effect()` owned by the component refetches when the built query changes (batched per
  microtask, not repeated after a manual `refresh()`, disposed on unmount). Static queries create
  no computed or effect.
- **Secret-looking query keys are refused** (`token`, `access_token`, `password`, `api_key`,
  `authorization`, `session`, …, matched exactly after normalizing case and separators), in
  `query` and in the URL itself.
- `ApiError` type `"config"`: a reactive query's unsupported value or secret key (no request is
  sent); a throwing query function is kept as `cause`.
- Requires `@zoijs/core` 1.2.0 or newer (`effect`).
- **Reactive params** — `params: () => ({ id: id.get() })`, mirroring reactive queries: every
  path rule applies to each result, and a bad one (missing/unused/`".."`/non-scalar, or a throw)
  is a `"config"` `error()` with no request and no value in the message. Params and query share
  one computed, so a change to either rebuilds the URL once.
- **Query arrays** — `tag: ["a", "b"]` → `tag=a&tag=b` (repeated keys, one level deep;
  `null`/`undefined` elements skipped; `[]` removes the key). Nested arrays, objects and
  unsupported elements throw. Secret-looking keys are refused whatever the value type.
- **`debounce: ms`** — reactive changes to params and query wait for one shared quiet window (0 to
  2147483647; invalid values throw). The first load and `refresh()` are immediate; `refresh()`
  cancels a pending debounced refetch. No timer is ever created for a static `api()`.
- **`dispose()`** — aborts the in-flight request (the resource keeps its data and stops loading,
  nothing is reported), cancels a pending debounce and removes the reactive computed/effect from
  the graph. Idempotent; runs automatically on component unmount. `refresh()` afterwards throws an
  `ApiError` of type `"config"`.
- **Mutations: `api.post` / `api.put` / `api.patch` / `api.delete`** — each returns an
  `@zoijs/action` (`run`, `pending`, `error`, `done`, `result`, `reset`; `run()` never rejects;
  failures report as `kind: "action"`). The URL decides `run()`'s argument: without `/:name`
  it is the JSON body (`run(body)`), with placeholders it is `{ params, body? }`; DELETE sends no
  body. Same transport, response parser, same-origin checks and path/query rules as `api()`.
- **JSON bodies** — `JSON.stringify` with `Content-Type: application/json`; no body means no
  `Content-Type`. Refused before sending (as a `"config"` error, never echoing the body): bigint,
  functions, symbols, non-finite numbers, Map/Set/class instances, cycles, throwing getters.
- **Options** — only `query` (static), `invalidate` and `exclusive` (default `false`, as in
  `@zoijs/action`); headers, method, credentials and other transport options throw.
- **Invalidation** — `invalidate: resource | resource[]` refreshes those `api()` resources after a
  successful request, after the action's success state is set; `run()` doesn't wait for them, and
  their failures stay theirs. Deduplicated; disposed targets skipped; only real `api()` resources
  accepted (tracked privately, not by shape).
- Mutations are never retried and never aborted by `api()`.
- `ApiError.method` is now the request's method.
- Requires `@zoijs/action` 0.2.0 or newer (`exclusive`) as a peer dependency.
