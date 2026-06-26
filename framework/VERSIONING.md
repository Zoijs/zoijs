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
