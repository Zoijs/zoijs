# Changelog

All notable changes to `@zoijs/action` are documented here.

## 0.1.0 — unreleased

Initial release of the tiny write/mutation helper for Zoijs.

- `action(fn)` returning `run(...args)` plus reactive `pending()`, `error()`,
  `done()`, `result()`, and `reset()`
- `run()` never rejects — failures land in `error()`; it resolves with the
  result on success or `undefined` on failure, so `await save.run(...)` is safe
- A superseded run can't overwrite a newer result (latest run wins)
- Results are ignored after the owning component is disposed (no leaks)
- Built entirely on `@zoijs/core`'s public API — the core is unchanged
