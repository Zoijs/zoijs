# Versioning Policy

Zoijs follows [Semantic Versioning 2.0.0](https://semver.org/): `MAJOR.MINOR.PATCH`.

## What is "public API"

The stability guarantee covers **only**:

1. The nine exports and their documented signatures:
   `html`, `mount`, `createState`, `computed`, `each`, `effect`, `boundary`, `configure`, `onCleanup`.
2. The shapes they return (`{ get, set, peek }`, `{ get, peek }`, `{ dispose }`, `unmount()`).
3. The documented template syntax and binding semantics (the `() =>` rule,
   event/attribute/text rules, `each` keying).
4. The documented secure-by-default behavior.

**Explicitly NOT public** (may change in any release): the internal reactive
graph, owner-scope helpers, the `html()` return shape, marker formats, the
template scanner internals, and anything under `src/` not re-exported by
`src/index.js`.

## Version bumps

- **PATCH** (`1.0.x`) — bug fixes, performance improvements, docs, internal
  refactors. No observable API change.
- **MINOR** (`1.x.0`) — backward-compatible additions: new exports (e.g. a
  public `effect`), new `configure` options, new optional parameters.
- **MAJOR** (`x.0.0`) — any breaking change to the public API, a change to
  documented semantics, or a rise in the minimum supported browser versions.

## Deprecation policy

- Deprecations are announced in a MINOR release and emit a dev-mode warning.
- Deprecated API is kept working for at least one MINOR cycle and removed only
  in the next MAJOR.
- Breaking changes are documented in `CHANGELOG.md` with a migration note.

## API changes require an RFC

Because the API is frozen at 1.0, any addition or change goes through a short
RFC (see `CONTRIBUTING.md`). This keeps the surface small and deliberate.

## Support & LTS policy

Zoijs's stability promise is unusually easy to keep: the core's public surface is a
**frozen nine functions**, so a `1.x` upgrade is always additive and never asks you to
change working code.

**`@zoijs/core` (stable, `1.x`).**

- The **current major** is actively maintained: bug fixes, performance, security, and
  additive (RFC-gated) features all land on the latest `1.x`. Upgrading within `1.x` is
  safe by definition (SemVer MINOR/PATCH).
- A new **MAJOR** ships only for a genuine breaking change (none is planned — see
  [`ROADMAP.md`](ROADMAP.md) non-goals). When one does, the **previous major receives
  security and critical-bug fixes for at least 6 months** after the new major is
  published, so you are never forced to migrate on someone else's schedule.
- **Security fixes** always land on the latest supported line and are disclosed per
  [`SECURITY.md`](SECURITY.md). Supported lines are listed there.

**Optional packages (`0.x`).** The ecosystem packages (`@zoijs/router`, `/resource`,
`/forms`, `/i18n`, `/ssr`, …) are pre-1.0 and may still refine their surface; changes
are additive where possible and always noted in each package's `CHANGELOG.md`. Each is
independent — you upgrade only what you use. They reach `1.0` once their shape has
settled in real use.

**Platform baseline.** Node **≥ 18** for tooling/tests; the runtime targets modern
evergreen browsers (Chromium, Firefox, WebKit), verified in CI. Raising the minimum
browser baseline is a MAJOR change (see above). There is **no build step** to support,
at any version — the published package *is* its source.

**Upgrading.** Within a major: `npm update`. Across a (future) major: the `CHANGELOG.md`
entry carries the migration note, and any deprecation has already warned in dev for at
least one MINOR cycle (see *Deprecation policy*). Because the surface is tiny, migrations
are correspondingly small.
