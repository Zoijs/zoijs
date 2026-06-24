# Changelog

All notable changes to `@zoijs/resource` are documented here.

## 0.1.0 — 2026-06-24

Initial release of the tiny async-data helper for Zoijs.

- `resource(fetcher)` returning reactive `data()`, `loading()`, `error()`, and `refresh()`
- Automatic initial load; manual `refresh()` keeps current data until the new load resolves
- Synchronous throws and rejected promises both surface as `error()`
- A superseded load can't overwrite a newer result
- Results are ignored after the owning component is disposed (no leaks)
- Built entirely on `@zoijs/core`'s public API — the core is unchanged
