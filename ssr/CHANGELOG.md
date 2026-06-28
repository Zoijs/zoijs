# Changelog

All notable changes to `@zoijs/ssr` are documented here.

## 0.3.0 — 2026-06-27

### Added
- **`serialize(value)`.** Serialize a value to a JSON string that is safe to embed in a
  `<script>` tag — escapes `<`, `>`, `&`, and the U+2028/U+2029 line terminators, so a
  `</script>` inside your data can't break out. Use it to pass server-fetched data to
  the client so a `@zoijs/resource` started with `{ initial }` doesn't refetch.

## 0.2.0 — 2026-06-27

### Added
- **Hydration — `hydrate(component, target)`.** Full SSR: the client now **adopts** the
  server-rendered DOM in place instead of re-creating it. `hydrate()` reuses the existing
  elements exactly and attaches their events + reactive attributes to those live nodes;
  dynamic content regions re-render into the existing structure with no visible change
  and no flash. It's a thin wrapper over the core's new
  `mount(..., { hydrate: true })` (requires `@zoijs/core` ^1.6.0).
- **`renderToString(component, { hydratable: true })`.** Keeps the markers the client
  needs to hydrate (slot start/anchor comments + `data-zoijs-bind`). The default output
  is unchanged — clean, marker-free HTML for static prerendering you don't hydrate.

See [RFC 0008](https://github.com/Zoijs/zoijs/blob/main/framework/docs/rfcs/0008-ssr.md).

## 0.1.0 — 2026-06-26

Initial release — render Zoijs components to an HTML string on the server.

- **`renderToString(component)`** — evaluate a component (or an `html\`…\`` result) to
  an HTML string with **no DOM and zero dependencies**. Reactive values are read once;
  nested templates, `each` lists, conditionals, and arrays all compose. For SSR (first
  paint + SEO) and static prerendering (SSG).
- **Same security as the client.** Reuses the exact predicates from
  `@zoijs/core/server` (added in core 1.5.0): text and attribute values are escaped, URL
  attributes are scheme-checked, `data:` is raster-image-only, event handlers and `ref`s
  are dropped, and `on*` / `srcdoc` names are refused — so server and client output make
  identical safety decisions.
- The same component code runs on the server and the client; on the client, `mount`
  takes over. Removing `@zoijs/ssr` leaves a working client app. Seamless DOM-adopting
  hydration is a planned future core capability (see RFC 0008).
