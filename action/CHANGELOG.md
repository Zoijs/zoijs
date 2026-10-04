# Changelog

All notable changes to `@zoijs/action` are documented here.

## Unreleased

### Added
- **`exclusive` option (SEC-10).** `action(fn, { exclusive: true })`: while a run is pending,
  `run()` returns that run's promise instead of calling `fn` again, so a double-click can't send a
  non-idempotent request twice. The lock is taken before `fn` starts and released when the run
  succeeds or fails (or on `reset()`); joined calls aren't reported to `onError`. Default unchanged.
  It doesn't prevent server-side replays — keep the endpoint idempotent.

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
