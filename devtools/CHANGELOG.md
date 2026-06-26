# Changelog

All notable changes to `@zoijs/devtools` are documented here.

## 0.1.0 — 2026-06-26

Initial release — a reactive-graph inspector for Zoijs.

- **`inspect(options?)`** — attach an inspector and mount a floating, dev-only
  panel. It lists every **state**, **computed**, and **effect**; shows each value
  and run/write counters; flashes a node when it updates; and, for binding effects,
  names **which DOM node** it updates — hover a row to outline that one node on the
  page. Returns `{ inspector, model, close }`. `corner` docks it left or right.
- **`createInspector()`** — the headless model behind the panel: `attach()` /
  `detach()`, `subscribe()` to graph changes, and a `model` you can query
  (`nodes()`, `sources()`, `observers()`, `stats()`). Use it to build a custom UI,
  drive a browser extension, or assert on the graph in a test.
- Built entirely on the public, read-only core hook
  (`@zoijs/core/devtools`, RFC 0005). **Dev-only** — a no-op under
  `configure({ dev: false })` — **read-only**, and zero runtime dependencies. The
  panel uses plain DOM (no Zoijs reactivity), so it never pollutes the graph it
  inspects.
