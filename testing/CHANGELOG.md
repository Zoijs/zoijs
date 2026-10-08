# Changelog

All notable changes to `@zoijs/testing` are documented here.

## 0.1.1 — 2026-10-05

### Documentation
- **The README's API table lists `bindQueries(root)`** — the export `render` and `screen` are
  built on, available since 0.1.0 but missing from the published README. No code change.
- `LICENSE` uses LF line endings (same text).

## 0.1.0 — 2026-06-26

Initial release — first-party DOM testing helpers for Zoijs.

- **`render(component, options?)`** — mount into a fresh container; returns queries
  scoped to it plus `unmount` and `debug`. Every render is tracked for `cleanup()`.
- **Queries** — `getBy` / `queryBy` / `getAllBy` / `findBy` for **Text**, **Role**
  (with an accessible-`name` filter), **TestId** (`data-testid`), and **LabelText**;
  plus a `screen` bound to `document.body` and a `bindQueries(root)` for any element.
- **`fireEvent(el, type, init?)`** (+ `.click` / `.input` / `.change` / `.submit` /
  `.keydown` / …) — dispatch real DOM events; `await` to see Zoijs's batched update.
  Pass `{ target: { value } }` to set a property first.
- **`waitFor(fn, options?)` / `tick()`** — resolve microtask-batched reactivity and
  async data.
- **`cleanup()`** — unmount and remove every container `render` created.
- **`mockRouter(init?)`** — a controllable stand-in for an `@zoijs/router` instance.
- Zero runtime dependencies; built only on `@zoijs/core`'s public API. No custom
  renderer, no virtual snapshot format, no test runner — it drives the real DOM.
