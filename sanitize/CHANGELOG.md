# Changelog

All notable changes to `@zoijs/sanitize` are documented here.

## Unreleased

### Security
- **Sanitized content can no longer clobber page globals (SEC-8).** `id` and `name` survived
  sanitization, and browsers expose both as named properties — so `<a id="__DATA__" name="config">`
  shadowed `window.__DATA__` and `window.config`. Now `name` is always removed, and every `id` is
  prefixed with `user-content-`; same-document references are rewritten to match (`href="#…"`,
  `headers`, and the ARIA id-reference attributes), so in-page links and accessibility
  relationships keep working. Empty ids are removed. `sanitize(html, { idPrefix: "" })` keeps ids
  as written (an explicit opt-out for trusted content; `name` is still removed), and a custom prefix
  can be passed. **Mild behavior change:** links into sanitized content from outside it must use the
  prefixed id (`#user-content-…`).

### Fixed
- **Peer range now `@zoijs/core ^1.5.0` (was `^1.0.0`) (SEC-7).** sanitize imports `isSafeUrl` /
  `isSafeAttributeName` from `@zoijs/core/server`, which first shipped in core 1.5.0, so 1.0–1.4
  could never load it. The README's CDN example now uses exact, integrity-pinned URLs.

## 0.1.0 — 2026-07-31

Initial release of the optional HTML sanitizer for Zoijs — the supported, tested
way to render rich HTML you broadly trust (markdown output, a CMS body) without a
raw-HTML sink.

- `sanitize(dirty)` — parses an untrusted HTML string with `DOMParser` (inert: no
  scripts run, no resources load) and returns an **array of safe DOM nodes** that
  drops straight into a Zoijs text binding
- **Allowlist-based**: only known-safe content elements and attributes survive;
  `script` / `style` / `iframe` / `object` / `embed`, foreign content (SVG/MathML),
  every `on*` handler, `srcdoc`, and unknown tags are removed
- URL attributes (`href` / `src` / `cite`) are scheme-checked with the **same**
  `isSafeUrl` predicate the core renderer uses (imported from `@zoijs/core/server`),
  so the decision can never drift from the rest of Zoijs
- `target="_blank"` links are hardened with `rel="noopener noreferrer"`
- Comments and non-element/text nodes are dropped
- Client-only (returns live nodes); throws with a clear message when called without
  a DOM. Not part of `@zoijs/ssr` string output — see the README
- Zero runtime dependencies; peer-depends only on `@zoijs/core` — the core is
  unchanged
- Verified with unit tests (jsdom) plus real-browser tests on Chromium / Firefox /
  WebKit, where a surviving handler or `javascript:` URL would actually execute
