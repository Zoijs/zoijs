# Changelog

All notable changes to `@zoijs/eslint-plugin` are documented here. This project
follows [Semantic Versioning](https://semver.org).

## 0.3.0

Adds two zero-dependency **security rules**, defense-in-depth on top of the runtime's
secure-by-default rendering. Both are in the `recommended` / `legacy-recommended` configs.

- **`no-target-blank-without-rel`** (error) — a link with `target="_blank"` but no
  `rel="noopener"` lets the opened page reach back through `window.opener`
  (reverse tabnabbing). Add `rel="noopener"` (or `rel="noopener noreferrer"`). Only a
  *static* `target="_blank"` is flagged; dynamic `target=${…}`/`rel=${…}` is left alone.
- **`no-dynamic-style`** (warn) — binding `style` from a dynamic value is the one
  dynamic-attribute path the runtime doesn't sanitize, so attacker-controlled CSS can
  exfiltrate data (`background:url(…)`). Prefer binding a `class` or setting individual
  properties from trusted values. A fully static `style="…"` is fine.

Both run on the same tiny template-markup scanner as the a11y rules — no HTML parser,
no dependency.

## 0.2.0

Adds a small set of zero-dependency **accessibility rules** that scan the markup inside
`html` templates. They reinforce the [accessibility guide](https://zoijs.dev/accessibility)
and are included in the `recommended` / `legacy-recommended` configs.

- **`alt-text`** (error) — an `<img>` must have an `alt` attribute; `alt=""` is accepted
  for decorative images. Only a *missing* attribute is flagged.
- **`no-positive-tabindex`** (error) — a literal `tabindex` greater than `0` forces a
  confusing tab order; use `0` or `-1`. Dynamic `tabindex=${…}` is left alone.
- **`no-static-element-interactions`** (warn) — an `onclick` on a `<div>`/`<span>` with no
  `role` isn't keyboard- or screen-reader-accessible; use a `<button>`/`<a>` (or add
  `role` + `tabindex`).

All three are deliberately narrow to keep false positives low, and run on a tiny
template-markup scanner — no HTML-parser dependency.

## 0.1.0

Initial release.

- **`require-reactive-binding`** — flags a reactive `.get()` read inside an `html`
  template that is not wrapped in an arrow function, so it would be read once
  during setup and never update. Auto-fixable (`eslint --fix` wraps it in
  `() => …`). Narrow by design: only zero-argument `.get()` calls inside `html`
  templates, never `.peek()`, never reads deferred behind a nested function.
- `recommended` (flat config) and `legacy-recommended` (`.eslintrc`) shareable
  configs.
- Zero runtime dependencies; ESLint is the only (peer-style) requirement.
