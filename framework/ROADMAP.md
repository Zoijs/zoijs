# Roadmap

Zoijs's roadmap protects a small, no-build core. Anything large arrives as an
**optional** package — never bolted into the core.

## 1.0 — Stable core (launch)

The frozen seven-function API, fine-grained reactivity, keyed lists, owner-scoped
cleanup, security defaults, types, and cross-browser tests. **Done — this is the
release.**

## 1.x — Additive, non-breaking

Shipped as MINOR/PATCH releases, no API breakage:

- **Performance:** LIS move-minimization in `each`; automated perf thresholds in CI.
- **DX:** hosted, interactive docs site; a recipes/patterns section; a small
  devtools hook to inspect the reactive graph.
- **Additive API (RFC-gated):** a public `effect`, an optional `svg` helper,
  custom `equals` documented for `computed`.
- **Hardening:** XSS-corpus fuzzing; optional error-boundary helper.
- **Reach:** mobile browsers added to the CI matrix.

## 2.0+ — Optional ecosystem (separate packages)

Only as opt-in modules that never compromise the no-build, small-core identity:

- `@easy/router` — client-side routing (History API).
- `@easy/forms` — form helpers/validation.
- `@easy/ssr` — server rendering + hydration.
- An **optional** compiler that pre-compiles templates (must be behavior-identical
  and never required).

## Explicit non-goals (core)

Router, SSR, plugin system, global store, CLI, JSX, and a mandatory build step
will **never** be part of the core. The core stays learnable in 30 minutes.

See `VERSIONING.md` for how changes map to version bumps, and `CONTRIBUTING.md`
for the RFC process.
