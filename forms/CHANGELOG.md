# Changelog

All notable changes to `@zoijs/forms` are documented here.

## 0.1.2 — 2026-10-05

### Documentation
- **CDN guidance uses exact, integrity-pinned URLs (SEC-7).** The README's no-install example
  imported a floating `esm.sh/@zoijs/forms@0.1` URL; it now maps `@zoijs/core` and `@zoijs/forms` to
  exact-version jsDelivr files with integrity hashes in an import map and imports by name. README
  only — no code change.

## 0.1.1 — 2026-06-25

Consistency hardening — **non-breaking, additive only.**

- Added reader-style accessors that match the rest of the ecosystem
  (`data()` / `loading()` / `value(name)` …): **`all()`** (all values),
  **`allErrors()`** (all errors), **`allTouched()`** (all touched flags), and
  **`isTouched(name)`** (one field's touched flag). All reactive inside a binding.
- The raw reactive state `values` / `errors` / `touched` is **kept** for backward
  compatibility (now documented as advanced/direct access). No existing code breaks.
- Docs and the login example updated to prefer the reader methods.
- No behavior changes, no new form features, no core changes.

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
