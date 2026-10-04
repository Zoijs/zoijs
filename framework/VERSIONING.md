# Versioning Policy

Zoijs follows [Semantic Versioning 2.0.0](https://semver.org/): `MAJOR.MINOR.PATCH`.

## What is "public API"

The stability guarantee covers **only**:

1. The nine functions exported by the main entry, `@zoijs/core`, and their documented
   signatures: `html`, `mount`, `createState`, `computed`, `each`, `effect`, `boundary`,
   `configure`, `onCleanup`.
2. The shapes they return (`{ get, set, peek }`, `{ get, peek }`, `{ dispose }`, `unmount()`).
3. The documented template syntax and binding semantics (the `() =>` rule,
   event/attribute/text rules, `each` keying).
4. The documented secure-by-default behavior (see *Security hardening* below for how it may
   tighten).
5. The public subpaths listed below, with the stability stated for each.
6. Exported TypeScript types (`src/*.d.ts` reached through `package.json` `"exports"`).

**Explicitly NOT public** (may change in any release): the internal reactive
graph, owner-scope helpers, the `html()` return shape, marker formats, the
template scanner internals, and **any file under `src/` that is not reached through a
`package.json` `"exports"` entry**. Only `"exports"` defines what can be imported;
deep imports (`@zoijs/core/src/…`) are unsupported even where a CDN can serve the file.

### Public subpaths

| Import | Status | What it is |
|---|---|---|
| `@zoijs/core` | **Public, stable (semver).** | The nine functions above. Bundlers' `"production"` condition resolves it to the production entry. |
| `@zoijs/core/prod` | **Public, stable (semver).** *Next release.* | The same API in production mode (no dev warnings, no devtools hook). Deployment-specific: use it instead of `@zoijs/core` in production. |
| `@zoijs/core/unsafe` | **Public, stable (semver), intentionally opt-in.** *Next release.* | `unsafeHTML()` — raw trusted markup, bypasses escaping. Never re-exported from the main entry. |
| `@zoijs/core/server` | **Public, stable (semver), environment-specific.** | The renderer's rules for server rendering (`isTemplateResult`, `isEachMarker`, `styleObjectToCss`, `isSafeAttributeValue`, `openerRel`, …). Used by `@zoijs/ssr`; no DOM required. Exports appear in the version that introduced them (`scripts/zoijs-compat.json`). |
| `@zoijs/core/devtools` | **Public, stable (semver), development tooling.** | The read-only inspector hook used by `@zoijs/devtools`. Inactive in production mode. |

Public subpaths participate in semver exactly like the main entry: removing one, removing
or renaming an export, or changing a documented signature is a MAJOR change; adding an
export or a subpath is MINOR. There is **no framework-internal subpath**: an unreleased
`@zoijs/core/internal` existed briefly during 1.9 development and was removed before any
release — it is not, and never was, a supported import.

**Runtime protocol (maintainers).** Starting with the next release (core 1.9.0), compatible
copies of the core in one realm share reactive state, the `onError` reporter and the `zoijs`
Trusted Types policy through `globalThis[Symbol.for("zoijs.runtime@<protocol>")]`
(`src/reactivity/runtime.js`, protocol 1). Core 1.8.0 and older don't participate. Any
change to the shape of reactive nodes, owners, or that shared runtime object, or to the
graph algorithm's semantics, MUST bump `PROTOCOL` — mixed copies otherwise run one
another's nodes with different code. The protocol object is not public API.

## Version bumps

- **PATCH** (`1.0.x`) — bug fixes, performance improvements, docs, internal
  refactors. No observable API change beyond the fix.
- **MINOR** (`1.x.0`) — backward-compatible additions: new exports (e.g. a
  public `effect`), new public subpaths, new `configure` options, new optional parameters,
  and security hardening that meets the tests in *Security hardening*.
- **MAJOR** (`x.0.0`) — any breaking change to the public API, a change to
  documented semantics, or a rise in the minimum supported browser versions.

## Security hardening

Zoijs's documented promise is that **data is inert**: text is never parsed as markup,
handlers are never strings, unsafe URL schemes are never set, raw HTML is only ever an
explicit opt-in. Hardening that keeps this promise ships in a **MINOR** release (or a
PATCH, for a fix to a guard that was meant to work already), even when it makes some code
that used to run fail. A MINOR or PATCH release may:

- **reject inputs that were never documented and are unsafe** — e.g. `html([...])` called
  as a function now throws `ZJS010`; the documented form, `` html`…` ``, is unchanged;
- **strengthen a secure default** — e.g. a bound `<base>` is refused; bound `srcset`, meta
  refresh and SVG animation values go through the URL check;
- **add security attributes automatically** — e.g. `target="_blank"` links always carry
  `rel="noopener noreferrer"`;
- **fail earlier on malformed or dangerous syntax** — e.g. Lit-style `.prop=`, `?attr=` and
  `@event=` bindings, which used to throw at render time (or silently misbehave), are now
  compile-time errors;
- **change output that was never a contract to remove a security risk** — e.g. (in the
  0.x `@zoijs/sanitize`, held to the same standard) sanitized ids are namespaced
  (`id="x"` → `id="user-content-x"`) and `name` is dropped to prevent DOM clobbering, with
  `{ idPrefix: "" }` to keep ids as written deliberately.

Every such change must meet **all** of these tests, and is reviewed against them:

1. **It closes a concrete risk** (injection, opener/referrer leaks, clobbering, …) — not a
   style preference or a cleanup.
2. **The documented, safe usage keeps working unchanged.** If code written as the docs
   show must change, it is a MAJOR change, whatever the motivation.
3. **It fails loudly, not silently** — a thrown error, a compile error or a dev warning
   that names the fix — or, for an added attribute or a refused URL, it is visible in the
   rendered DOM and documented.
4. **An explicit way remains** for legitimate use, when one exists (`unsafeHTML()`,
   `sanitize(…, { idPrefix: "" })`, a static attribute instead of a bound one).
5. **It is listed in `CHANGELOG.md` under Security/Fixed with a migration note.**

What is **not** allowed under this clause: removing or renaming a documented export,
changing a documented signature or return shape, changing documented non-security
semantics (reactivity, keying, scheduling), raising the browser baseline, or breaking
documented usage "for security". Those are MAJOR changes. When in doubt, it is MAJOR.

The Phase 1 hardening that ships in the next core release (proposed 1.9.0) meets these
tests: each item above rejects undocumented or unsafe input, keeps the documented usage
working, and carries a migration note — see *Migration notes* in [`CHANGELOG.md`](CHANGELOG.md).

## Deprecation policy

- Deprecations are announced in a MINOR release and emit a dev-mode warning.
- Deprecated API is kept working for at least one MINOR cycle and removed only
  in the next MAJOR.
- Breaking changes are documented in `CHANGELOG.md` with a migration note.

## API changes require an RFC

Because the API is frozen at 1.0, any addition or change goes through a short
RFC (see `CONTRIBUTING.md`). This keeps the surface small and deliberate.

## Support & LTS policy

Zoijs's stability promise is unusually easy to keep: the core's main entry is a
**frozen nine functions** (plus the small public subpaths above), so a `1.x` upgrade is
additive and never asks you to change code written as documented. The one exception is
security hardening of undocumented, unsafe behavior — see *Security hardening*.

**`@zoijs/core` (stable, `1.x`).**

- The **current major** is actively maintained: bug fixes, performance, security, and
  additive (RFC-gated) features all land on the latest `1.x`. Upgrading within `1.x` is
  safe for documented usage (SemVer MINOR/PATCH); read the CHANGELOG's migration notes for
  security hardening.
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
