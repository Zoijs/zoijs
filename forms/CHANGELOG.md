# Changelog

All notable changes to `@zoijs/forms` are documented here.

## 0.1.0 — 2026-06-25

Initial release of the tiny, native-forms-first helper for Zoijs.

- `form(initialValues, options?)` returning reactive `values` / `errors` / `touched`
  state plus per-field helpers: `value`, `set`, `error`, `setError`, `clearError`,
  `touch`, and `reset`
- `validate(rules?)` — a simple field → function rule map (no schemas, no deps),
  with optional default rules via `options.validate`
- `handleSubmit(fn)` — a thin wrapper that prevents the default reload and calls
  `fn(values)`; the network call stays yours (use `@zoijs/action`)
- Native-forms first: works with ordinary `<input>` / `<textarea>` and submission
  via `@zoijs/action`
- Built entirely on `@zoijs/core`'s public API — the core is unchanged
