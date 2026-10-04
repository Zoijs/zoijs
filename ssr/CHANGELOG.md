# Changelog

All notable changes to `@zoijs/ssr` are documented here.

## Unreleased

### Documentation
- **`serialize()` placement is now explicit (SEC-11).** Its output belongs in a `<script>` body only —
  quotes aren't escaped, so never in an attribute, raw HTML, a URL, or `<style>`. The README now leads
  with a `<script type="application/json">` data block (no CSP allowance needed) and notes that the
  executable `window.__DATA__ = …` form needs a per-request nonce under a strict CSP. No behavior change.

### Fixed
- **Peer range now `@zoijs/core ^1.7.0` (was `^1.6.0`) (SEC-7).** ssr imports `styleObjectToCss` from
  `@zoijs/core/server`, which first shipped in core 1.7.0 — under 1.6.0 the module failed to link.

## 0.4.0 — 2026-08-06

### Added
- **Renders `<textarea>`/`<title>` content bindings** (`@zoijs/core` ≥ 1.8.0). A sole-child `${}` in
  `<textarea>`/`<title>` is emitted as the element's escaped text content, matching the client render
  (which sets it as a property). Hydratable output keeps the `data-zoijs-bind` marker so the client
  adopts the element in place.

## 0.3.1 — 2026-08-06

### Security
- **URL-sanitizer casing bypass fixed** in `serializeAttribute` (mirrors `@zoijs/core`): attribute
  names are normalized before the URL scheme check and the `value`/`checked`/`style` dispatch, so
  an uppercase/mixed-case URL attribute (`HREF`, `SRC`, …) can no longer emit a
  `javascript:`/`data:text/html` URL. Original casing is preserved when serializing, so
  case-sensitive SVG attributes are unaffected.

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
