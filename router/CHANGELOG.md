# Changelog

All notable changes to `@zoijs/router` are documented here.

## 0.5.0 — 2026-08-06

### Changed
- **The `view()` outlet uses a class instead of an inline style.** It now renders
  `<div class="zoijs-router-outlet">` rather than `<div style="display: contents">`. An inline
  `style=` attribute is blocked by a strict `style-src 'self'` Content-Security-Policy (and it
  shows up in prerendered HTML, so the block is visible at load); a class + external stylesheet
  rule needs no CSP exception.

  **Migration (one line of CSS):** to keep the outlet layout-transparent, add
  ```css
  .zoijs-router-outlet { display: contents; }
  ```
  to your stylesheet. Without it the outlet is a plain `<div>` wrapper — fine for most layouts,
  but flex/grid layouts that relied on the wrapper being transparent should add the rule.

## 0.4.0 — 2026-08-06

### Fixed
- **Hash/query-only navigations no longer re-mount the page.** A `popstate` or navigation that
  resolves to the same route + params updates the reactive `location` without tearing down and
  rebuilding the page — preserving form input, scroll, and focus, and no longer flickering
  `@zoijs/head` tags.
- **Scroll management.** The router sets `history.scrollRestoration = "manual"` and manages scroll
  itself (pages render after the URL changes, so the browser can't): forward navigations scroll to
  the target `#hash` or the top; Back/Forward restore the previous position.
- **Re-entrancy guard.** A component that navigates synchronously during its own render (e.g. an
  auth guard redirecting) no longer orphans the intermediate page's owner scope (a leak); the
  in-flight render picks up the newest URL.
- **`link()` ignores protocol-relative (`//host/…`) targets** and lets the browser handle them,
  instead of throwing a `SecurityError` from `pushState`.

## 0.3.0 — 2026-06-27

### Added — routed SSR
- **`createRouter(routes, { location })`.** A server-rendering-only option: the request
  URL path (e.g. `"/users/42?tab=posts"`, including any `base`) to render for, used
  instead of `window.location` when there is no browser. `view()` then renders the
  route for *this* request (previously SSR always rendered the `"/"` route). Ignored on
  the client; defaults to `"/"`.
- **`router.match(path?)`.** Resolve a path to its matched route without rendering —
  `{ component, params }`. Lets a server learn which route (and params) a request hits so
  it can load that route's data *before* `renderToString`. Defaults to the current
  location; also accepts a URL path (handles `base` + query string).

These are the primitives for per-request routed SSR + data loading. Pair them with
`@zoijs/ssr`'s `serialize` and `@zoijs/resource`'s `{ initial }` — there is no loader
API or component-signature change. No client behavior changes.

## 0.2.1 — 2026-06-26

### Fixed
- **SSR-safe.** `createRouter(...)` and `view()` no longer touch `window`/`document`
  when those don't exist, so a routed component can be passed to `@zoijs/ssr`'s
  `renderToString` without throwing. Server-side, `view()` renders the matched route's
  template directly (the `"/"` route, since no request URL is available) and
  navigation (`go`, popstate, `interceptLinks`) becomes a no-op; the client takes over
  on hydration. No API change. Per-request routed SSR remains a separate, planned step.

## 0.2.0 — 2026-06-26

### Added
- **`interceptLinks` option.** `createRouter(routes, { interceptLinks: true })` makes a
  plain left-click on **any** internal `<a>` — not just a `router.link()` — navigate
  client-side instead of doing a full page reload. This is what lets links *inside
  rendered content* (Markdown, a CMS body) feel like a single-page app without wrapping
  each one. It deliberately bows out for everything that should behave normally:
  modifier / new-tab clicks, `target`, `download`, external origins, non-HTTP schemes,
  same-page `#hash` links, links outside the configured `base`, and any
  `<a data-native>`. Off by default; the back/forward listener and this one are both
  removed on `destroy()`. No change to the public function surface.

## 0.1.0 — 2026-06-24

Initial release of the tiny optional router for Zoijs.

- `createRouter(routes)` with a `{ pattern: component }` map
- Static routes, dynamic params (`/users/:id`), and a not-found route (`"*"`)
- `router.view()`, `router.link()`, `router.go()`, `router.path()`, `router.query()`
- Back/forward (popstate) support and `aria-current` on the active link
- Cleanup of the previous page (its `onCleanup`) on every route change
- Built entirely on `@zoijs/core`'s public API — the core is unchanged
