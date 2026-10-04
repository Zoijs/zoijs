# Changelog

All notable changes to `@zoijs/i18n` are documented here.

## Unreleased

### Security
- **Own-property lookups (SEC-10).** Interpolation used `key in vars`, so `{constructor}`,
  `{toString}` or `{__proto__}` resolved to `Object.prototype` members (and `t("constructor")`
  returned a function's source). Variables and dotted message keys now resolve from own properties
  only — inherited names stay as written / show the key; null-prototype objects work; an explicitly
  owned `constructor` key is still used. A dotted key no longer walks into a message string
  (`t("hi.length")` is a missing key, not `"14"`).

## 0.1.0 — 2026-06-26

Initial release — tiny, reactive internationalization for Zoijs.

- **`createI18n({ locale, fallback?, messages? })`** — a reactive i18n instance with a
  reader-method API (the same design language as `@zoijs/resource` / `@zoijs/forms`).
- **`t(key, vars?)`** — translate with `{placeholder}` interpolation and dotted keys
  (`"nav.home"`). Plural messages (`{ one, other, … }`) select via **`Intl.PluralRules`**
  for the active locale; a missing key returns the key itself.
- **`locale()` / `setLocale()`** — reactive current locale; switching it updates every
  translation/format binding in place (no re-render).
- **`n()` / `d()` / `list()`** — memoized `Intl.NumberFormat` / `DateTimeFormat` /
  `ListFormat` wrappers that follow the current locale.
- **`has()`** — key-presence check; **`add()`** — merge a lazily-loaded locale bundle
  (reactive).
- Zero runtime dependencies; built entirely on `@zoijs/core`'s `createState`. Returned
  strings are inert text when bound, so interpolation can't inject.
