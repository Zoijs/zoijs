# Changelog

All notable changes to `@zoijs/storage` are documented here.

## 0.2.0 — 2026-10-05

### Added
- **`validate` option (SEC-10).** `storage(key, initial, { validate })` checks the value restored
  from `localStorage` (user-editable, not trusted): unless `validate(value)` returns `true` (or if it
  throws), `initial` is used and the stored item is left until the next `set()`. Writes aren't
  validated. Without `validate`, behavior is unchanged.

## 0.1.0 — 2026-06-25

Initial release of the tiny localStorage-backed persistence helper for Zoijs.

- `storage(key, initialValue)` returning the same reactive `get()` / `set()` / `peek()`
  shape as `createState` — a drop-in, persistent state value
- Reads the key on creation (JSON-parsed); falls back to `initialValue` when the key
  is missing or the stored JSON is corrupt — never throws
- `set()` updates the reactive value and writes JSON to `localStorage`
- Degrades to in-memory state when `localStorage` is unavailable, blocked, or throws
  (quota, private mode); persistence is simply disabled for that session
- Built entirely on `@zoijs/core`'s public API — the core is unchanged
