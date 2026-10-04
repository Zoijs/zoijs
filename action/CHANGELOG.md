# Changelog

All notable changes to `@zoijs/action` are documented here.

## Unreleased

### Added
- **`exclusive` option (SEC-10).** `action(fn, { exclusive: true })`: while a run is pending,
  `run()` returns that run's promise instead of calling `fn` again, so a double-click can't send a
  non-idempotent request twice. The lock is taken before `fn` starts and released when the run
  succeeds or fails (or on `reset()`); joined calls aren't reported to `onError`. Default unchanged.
  It doesn't prevent server-side replays — keep the endpoint idempotent.
- **Failures reach `configure({ onError })` (CORE-3).** A failed run that becomes this action's
  `error()` is also reported to the app's onError hook as `{ kind: "action" }` (original error,
  once; superseded/disposed runs aren't reported). It goes through the core's shared runtime, so
  no-build apps need no extra import-map entry, and the peer range is unchanged: with an older
  core (no shared runtime, ≤ 1.8) the error simply isn't reported, as before.

## 0.1.0 — 2026-06-24

Initial release of the tiny write/mutation helper for Zoijs.

- `action(fn)` returning `run(...args)` plus reactive `pending()`, `error()`,
  `done()`, `result()`, and `reset()`
- `run()` never rejects — failures land in `error()`; it resolves with the
  result on success or `undefined` on failure, so `await save.run(...)` is safe
- A superseded run can't overwrite a newer result (latest run wins)
- Results are ignored after the owning component is disposed (no leaks)
- Built entirely on `@zoijs/core`'s public API — the core is unchanged
