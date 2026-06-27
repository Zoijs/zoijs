# Changelog

All notable changes to `@zoijs/head` are documented here.

## 0.1.1 — 2026-06-26

### Fixed
- **SSR-safe.** `title()`, `description()`, and `meta()` are now no-ops when there is
  no `document` (server-side), instead of throwing. A component that sets the head can
  be passed to `@zoijs/ssr`'s `renderToString`; put the initial `<title>`/`<meta>` in
  your HTML shell and `head` updates them on the client after hydration. No API change.

## 0.1.0 — 2026-06-24

Initial release of the tiny optional head helper for Zoijs.

- `title(value)` sets `document.title`
- `description(value)` sets `<meta name="description">` (creates it if missing)
- `meta(name, content)` sets any `name`-based meta tag (creates it if missing)
- Restore-on-cleanup: when a component unmounts, its title/meta revert (or the
  created tag is removed), so per-page head data doesn't leak across routes
- Built entirely on `@zoijs/core`'s public API (`onCleanup`) — the core is unchanged
