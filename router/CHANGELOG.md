# Changelog

All notable changes to `@zoijs/router` are documented here.

## 0.1.0 — 2026-06-24

Initial release of the tiny optional router for Zoijs.

- `createRouter(routes)` with a `{ pattern: component }` map
- Static routes, dynamic params (`/users/:id`), and a not-found route (`"*"`)
- `router.view()`, `router.link()`, `router.go()`, `router.path()`, `router.query()`
- Back/forward (popstate) support and `aria-current` on the active link
- Cleanup of the previous page (its `onCleanup`) on every route change
- Built entirely on `@zoijs/core`'s public API — the core is unchanged
