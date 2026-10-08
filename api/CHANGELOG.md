# Changelog

All notable changes to `@zoijs/api` are documented here.

## [Unreleased]

## 0.1.0 — unreleased

Initial release: the secure GET foundation.

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
