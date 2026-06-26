# Changelog

All notable changes to `@zoijs/ssr` are documented here.

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
