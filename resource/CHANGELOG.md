# Changelog

All notable changes to `@zoijs/resource` are documented here.

## 0.2.0 — 2026-06-27

### Added
- **`resource(fetcher, { initial })`.** Start a resource already-settled with a value
  instead of auto-loading — the SSR hand-off primitive. The server renders with the
  real data and serializes it (see `@zoijs/ssr`'s `serialize`); on hydration you create
  the resource with that same `initial`, so it keeps the data and does **not** refetch
  (no flash, no double-fetch). `refresh()` still loads on demand. The presence of the
  `initial` key — not its value — skips the load, so `{ initial: null }` is valid.

## 0.1.0 — 2026-06-24

Initial release of the tiny async-data helper for Zoijs.

- `resource(fetcher)` returning reactive `data()`, `loading()`, `error()`, and `refresh()`
- Automatic initial load; manual `refresh()` keeps current data until the new load resolves
- Synchronous throws and rejected promises both surface as `error()`
- A superseded load can't overwrite a newer result
- Results are ignored after the owning component is disposed (no leaks)
- Built entirely on `@zoijs/core`'s public API — the core is unchanged
