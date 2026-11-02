# Changelog

All notable changes to `@zoijs/build` are documented here. This project
follows [Semantic Versioning](https://semver.org).

## [Unreleased]

## 0.2.0 — 2026-11-02

### Added
- `hydration: false` — bundle `@zoijs/core`'s lean entry without hydration (the
  `"zoijs-no-hydration"` condition, core RFC 0011): ~1 KB gzipped less for apps that never hydrate
  server HTML. Needs `@zoijs/core` 1.11.0 or later; older cores ignore it.

## 0.1.0 — 2026-11-01 (experimental)

First version: an **optional** production build for Zoijs apps, extracted from the bundled builds
of Zoijs Insight and zoijs.dev ([RFC 0010](../framework/docs/rfcs/0010-build.md)). Apps keep
running unbuilt; this only adds a way to bundle for production.

### Added
- `build(options)` — bundles entry points with esbuild (a peer dependency) into content-hashed
  files under `<outDir>/assets/`, split per dynamic `import()`, with Zoijs packages resolved to
  their production entries; optional single hashed stylesheet; `asset-manifest.json` with entries,
  modulepreload lists, sha384 integrity, cache and CSP guidance. Reproducible output.
- Checks that fail the build: no `eval`/`new Function`, nothing external, only allowed packages,
  no fully computed `import()`, no public source maps (`sourceMapsDir` for private ones), no
  machine paths, no credential files or credential-shaped strings; optional import-map
  verification (exact versions, every bundled file matches the map's integrity).
- Safe promotion: a failed build never touches the live assets or manifest; promotion replaces
  them as a pair and restores the previous pair on failure; an interrupted promotion is undone by
  the next run (`recovered`); `keepPrevious` keeps the replaced build; `buildId` ties a manifest
  to its files.
- Tested on Linux, macOS and Windows (Node.js 20+).
- `htmlTags()`, `stripImportMap()`, `inlineScripts()`, `scriptHashes()`, `IMMUTABLE`,
  `BuildError`.
