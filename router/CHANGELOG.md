# Changelog

All notable changes to `@zoijs/router` are documented here.

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
