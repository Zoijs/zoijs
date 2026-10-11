# Changelog

All notable changes to `@zoijs/api` are documented here.

## [Unreleased]

Proposed as **0.2.0** (additive). `api()` is unchanged.

### Added — `createApi({ baseURL })`: explicit clients for external APIs
- A client is the same request surface as `api` — `client(url)` reads, `client.post/put/patch/delete(url)`
  write, with every existing option — over the same engine, locked to **one trusted origin**.
  Nothing global: `api()` stays same-origin-only and clients don't affect each other.
- `baseURL` must be an absolute `https:` URL (`http:` only for `localhost`, `*.localhost`,
  `127.x.x.x` and `[::1]`) with no credentials, query string, fragment, backslashes or dot
  segments, and a host already in canonical form — no spelling the URL parser would silently
  rewrite (percent-encoding, non-ASCII, `127.1`-style IP forms). It is the only option —
  `headers`, `credentials` and anything else are refused.
- Paths start with `/` and resolve **under** the base path (`/users` on `…/v1/` → `…/v1/users`).
  Full URLs, `//host`, relative paths, backslashes and (encoded) dot segments are refused before
  any request; the final URL must keep the client's exact origin and base path.
- Requests are `mode: "cors"` (CORS is not bypassed), `credentials: "omit"` (no cookies go to
  the external origin) and `redirect: "manual"` (a redirect is a `"security"` error, never
  followed or retried), with `referrerPolicy: "strict-origin-when-cross-origin"` so the page's
  path and query never reach the external API. No authentication is added.
- Clients are frozen; `client.baseURL` is read-only. In a non-browser environment the
  configuration is validated but requests are refused — no server-side networking.
- Invalidation works across clients and `api()`, by resource reference.

### Release tooling
- `release-check` fails a tag when current docs pin a stale version of the package (older than
  npm's `latest`, or newer than the release); `npm run docs:pins` re-checks every pin against npm
  after publishing, including the website's docs — and recomputes every Zoijs integrity hash in
  the docs' import maps from the published tarballs. `--offline` checks structure only (floating
  CDN URLs, malformed maps); an unreachable registry is an error, never a silent pass.

## 0.1.0 — 2026-10-08

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
  `Idempotency-Key`; `attempt()` / `retrying()` expose progress. FormData bodies are retried by
  replaying the same FormData (verified in Chromium, Firefox and WebKit; the multipart boundary may
  differ between attempts).

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
