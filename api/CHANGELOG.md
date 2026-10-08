# Changelog

All notable changes to `@zoijs/api` are documented here.

## [Unreleased]

## 0.1.0 — unreleased

Initial release: same-origin HTTP for Zoijs. `api(url)` reads as a `@zoijs/resource`;
`api.post/put/patch/delete(url)` write as a `@zoijs/action` — with safe URL building, JSON and
HTTP-error handling, and a same-origin security model built in.

### Reads — `api(url, options?)`
- A resource: `data()`, `loading()`, `error()`, `refresh()`, plus `dispose()` for one created
  outside a component. Latest request wins; superseded and unmounted requests are aborted.
- **Params and queries without string building**: `/:name` placeholders filled with one encoded
  segment each (strict: missing/unused params and `".."` refused); queries via
  `URLSearchParams`, including arrays as repeated keys.
- **Reactive refetching**: `params: () => ({ … })` / `query: () => ({ … })` refetch when the state
  they read changes, optionally `debounce`d.
- **`initial`** seeds the resource for server rendering and skips the first request.

### Writes — `api.post` / `api.put` / `api.patch` / `api.delete`
- Action state (`run`, `pending`, `error`, `done`, `result`, `reset`); `run()` never rejects.
- JSON bodies serialized for you (values JSON would silently change are refused), or `FormData`
  for uploads. DELETE sends no body.
- **`invalidate`** refreshes `api()` resources after a successful write; `exclusive` makes a
  double submit send once.

### Transport
- Non-2xx, network, timeout, parse, security and config failures as a structured `ApiError` with a
  log-safe message.
- **`timeout`** per request (type `"timeout"`), and opt-in **`problemDetails`** — normalized,
  size-limited RFC 9457 `application/problem+json` fields on `error.problem`.
- **Retries, opt-in and bounded**: `retry` (0–5 extra attempts) for transient failures only
  (network, timeout, 408/425/429/500/502/503/504), exponential backoff with ±20 % jitter capped at
  30 s, and `Retry-After` honored. GET retries replay one URL per load. Mutation retries require
  an **idempotency key** — generated (`idempotencyKey: true`) or from a function — sent as
  `Idempotency-Key`; `attempt()` / `retrying()` expose progress. FormData bodies aren't retried yet.

### Security model
- **Same-origin only**: the final URL must be http(s) on the page's origin; credentials in URLs,
  look-alike hosts and cross-origin redirects are refused. Requests use `mode` and `credentials`
  `"same-origin"`.
- Secret-looking query keys (`token`, `password`, `api_key`, …) are refused.
- Error messages never contain URL paths, query strings, bodies, headers, keys or response text;
  error bodies stay private unless `problemDetails` is enabled.
- API data is plain data: never parsed as HTML or run as script.
- Not access control: the server must still authenticate, authorize and validate every request,
  enforce idempotency keys, and validate uploaded files. A client timeout doesn't prove a
  mutation didn't happen.

Requires `@zoijs/core` ≥ 1.2.0, `@zoijs/resource` ≥ 0.3.0 and `@zoijs/action` ≥ 0.2.0 (peers).
