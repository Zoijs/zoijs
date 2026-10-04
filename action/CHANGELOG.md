# Changelog

All notable changes to `@zoijs/action` are documented here.

## Unreleased

### Release blocker
- This version imports `@zoijs/core/internal` (onError reporting, CORE-3), which first ships in the
  next core release. Its `@zoijs/core` peer floor must be raised to that version before release;
  `npm run release:check` blocks the release until then (SEC-7).

## 0.1.0 — 2026-06-24

Initial release of the tiny write/mutation helper for Zoijs.

- `action(fn)` returning `run(...args)` plus reactive `pending()`, `error()`,
  `done()`, `result()`, and `reset()`
- `run()` never rejects — failures land in `error()`; it resolves with the
  result on success or `undefined` on failure, so `await save.run(...)` is safe
- A superseded run can't overwrite a newer result (latest run wins)
- Results are ignored after the owning component is disposed (no leaks)
- Built entirely on `@zoijs/core`'s public API — the core is unchanged
