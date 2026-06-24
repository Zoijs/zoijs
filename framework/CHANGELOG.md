# Changelog

All notable changes to Zoijs are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and Zoijs follows
[Semantic Versioning](https://semver.org/) (see `VERSIONING.md`).

## [1.0.0] — Unreleased

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

[1.0.0]: https://github.com/Zoijs/zoijs/releases/tag/v1.0.0
