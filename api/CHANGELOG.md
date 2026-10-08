# Changelog

All notable changes to `@zoijs/api` are documented here.

## [Unreleased]

## 0.1.0 — unreleased

Initial release: the secure GET foundation, plus safe dynamic URLs and reactive queries.

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
  `URLSearchParams.set` (replacing the URL's own value for that key); `null`/`undefined` are left
  out; objects and arrays throw. The final URL then goes through every same-origin check.
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
