# Changelog

All notable changes to Zoijs are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and Zoijs follows
[Semantic Versioning](https://semver.org/) (see `VERSIONING.md`).

## [1.3.0] — 2026-06-26

### Added
- **`boundary(child, fallback)`.** A render-time error boundary: it renders
  `child`, and if `child` throws **synchronously while building its markup** (a
  setup/render error that would otherwise break the whole `mount`), it disposes the
  partial work — so an `effect` created before the throw can't leak — and renders
  `fallback` (a value, or `(error) => value`) instead. Catches synchronous
  setup/render throws only; errors in reactive *updates* are already contained per
  binding, and *async* errors belong to `@zoijs/resource` / `@zoijs/action`'s
  `error()` state. Logs in dev, silent in production. The public surface is now
  **nine** functions (additive MINOR). See [RFC 0004](docs/rfcs/0004-error-boundary.md).

## [1.2.0] — 2026-06-26

### Added
- **`effect(fn)`.** A public reactive effect — runs a side effect immediately and
  re-runs whenever a reactive value it reads changes (automatic dependency
  tracking, microtask-batched). The function may return a cleanup that runs before
  the next run and on dispose (same convention as a `ref`); `effect` auto-disposes
  with its owner (component / list item) and returns `{ dispose }` for early
  teardown. This is the public completion of the reactive trio (`createState` /
  `computed` / `effect`) — the engine already used it internally for bindings. Use
  it for side effects *outside* the view (persist on change, sync `document.title`,
  drive a non-Zoijs widget); for on-screen content, keep using a binding
  (`${() => …}`). The public surface is now **eight** functions (additive MINOR per
  `VERSIONING.md`). See [RFC 0003](docs/rfcs/0003-effect-and-svg.md).

### Notes
- The **`svg`** helper considered alongside `effect` was **deferred**: templates
  rooted at `<svg>` already render correctly, and only dynamic-SVG *composition* is
  affected — a minority need. See [RFC 0003](docs/rfcs/0003-effect-and-svg.md) §6.

## [1.1.0] — 2026-06-25

### Added
- **Element refs.** A new `ref` binding gives you the rendered DOM element:
  `html\`<input ref=${(el) => el.focus()} />\``. The callback runs once, just after
  the element is inserted (so `focus`/`scroll`/`measure`/`canvas` work), is not
  reactive, and may return a cleanup function that runs on unmount or list-item
  removal. Works inside keyed `each` lists. Non-function values are ignored with a
  dev-mode warning and never become a DOM attribute. No new export — `ref` is a
  binding semantic, so the seven-function public surface is unchanged (additive
  MINOR per `VERSIONING.md`). See [Element refs](docs/concepts/refs.md) and
  [RFC 0001](docs/rfcs/0001-element-refs.md).

## [1.0.0] — 2026-06-24

First stable release. The public API is frozen at seven functions.

### Public API
- `html` — tagged-template renderer (no JSX, no build step).
- `mount(component, target)` → `unmount()`.
- `createState(value)` → `{ get, set, peek }`.
- `computed(fn)` → `{ get, peek }` — lazy, cached, value-gated.
- `each(items, keyFn, renderFn)` — keyed list reconciliation.
- `configure({ dev })` — development/production mode.
- `onCleanup(fn)` — teardown for components and list items.

### Features
- Fine-grained, direct DOM updates (no Virtual DOM); setup runs once.
- Push-pull reactive core with automatic dependency tracking and microtask batching.
- Owner-scoped cleanup; deterministic teardown on unmount and list-item removal.
- Context-aware template parser (quoted/unquoted/partial/multi-hole attributes,
  boolean/URL/aria/data attributes, SVG, nested templates and lists).
- Secure by default: inert text, URL-scheme allowlist (control-char resistant),
  `data:` raster-image rules, `on*`/`srcdoc` blocked, function-only handlers,
  no `eval`, CSP- and Trusted-Types-friendly.
- TypeScript definitions with generics for state/computed/lists.

### Tooling
- 100+ unit/DOM tests (jsdom), real-browser tests on Chromium/Firefox/WebKit
  (Playwright), and TypeScript type tests.
- No build step required at any point.

[1.1.0]: https://github.com/Zoijs/zoijs/releases/tag/core-v1.1.0
[1.0.0]: https://github.com/Zoijs/zoijs/releases/tag/core-v1.0.0
