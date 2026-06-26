# Changelog

All notable changes to Zoijs are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and Zoijs follows
[Semantic Versioning](https://semver.org/) (see `VERSIONING.md`).

## [1.5.0] — 2026-06-26

### Added
- **DOM-free template compiler + a `@zoijs/core/server` subpath.** `html\`…\`` now
  compiles to a static HTML string + part descriptors **without touching the DOM**;
  the `<template>` element is built lazily on first client render. This means a
  component can be evaluated on a server (no DOM) so [`@zoijs/ssr`](https://www.npmjs.com/package/@zoijs/ssr)
  can render it to a string. The new subpath exposes the building blocks a server
  renderer needs — the static HTML/parts of a result, template/list markers, and the
  **same** security predicates the client uses (`escapeText`, `escapeAttr`,
  `isSafeUrl`, `isSafeAttributeName`, `URL_ATTRS`) so server and client make
  identical safety decisions. Client rendering is byte-for-byte unchanged; the
  learnable nine-function main surface is unchanged. See
  [RFC 0008](docs/rfcs/0008-ssr.md).

## [1.4.0] — 2026-06-26

### Added
- **Devtools inspection hook** (`@zoijs/core/devtools`). A new, dev-only, read-only
  seam that lets an inspector — [`@zoijs/devtools`](https://www.npmjs.com/package/@zoijs/devtools)
  or a browser extension — observe the reactive graph: states, computeds, effects,
  the edges between them, and **which DOM node each binding updates**. It's reached
  through a dedicated subpath (`import { attachInspector } from "@zoijs/core/devtools"`),
  so the learnable **nine-function** main surface is unchanged. The hook is off by
  default (a single null check until something attaches), never instruments the hot
  read path (`.get()`), and is a no-op under `configure({ dev: false })` — so a
  production app pays no measurable cost and exposes nothing. See
  [RFC 0005](docs/rfcs/0005-devtools-hook.md).

## [1.3.2] — 2026-06-26

### Fixed
- **Focus is preserved across a keyed reorder.** The 1.3.1 minimal-move change can
  move the subtree that holds the focused element, which blurs it in browsers.
  `each` now captures focus + caret position before reordering and restores them
  after, so reordering a list never steals focus or selection — whichever nodes
  happen to move. Verified in Chromium, Firefox, and WebKit
  (`browser-tests/regression.spec.js`).

## [1.3.1] — 2026-06-26

### Performance
- **Minimal DOM moves in `each`.** Keyed-list reconciliation now uses a
  longest-increasing-subsequence pass, so a reorder moves the **fewest nodes
  possible** — moving one item across a list is a single DOM move (it could be up
  to N before). No API or behavior change; the final order is identical and reused
  nodes keep their identity (focus, input values, and scroll survive reorders).
  Proven by move-count tests (`tests/lis.test.js`); numbers in `bench/`.

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
