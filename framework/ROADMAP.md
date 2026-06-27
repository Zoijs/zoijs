# Roadmap

Zoijs's roadmap protects a small, no-build core. Anything large arrives as an
**optional** package — never bolted into the core.

## 1.0 — Stable core (launch)

The frozen seven-function API, fine-grained reactivity, keyed lists, owner-scoped
cleanup, security defaults, types, and cross-browser tests. **Done — this is the
release.**

## 1.x — Additive, non-breaking

Shipped as MINOR/PATCH releases, no API breakage. **Shipped so far:** the hosted
docs site ([zoijs.dev](https://zoijs.dev)), **element refs** (a `ref` binding,
1.1.0 — no new export), a public **`effect`** (1.2.0 — RFC 0003), and an
**error boundary** (`boundary`, 1.3.0 — RFC 0004). The surface is now **nine**
functions. Still on the table:

- **Performance: shipped** — LIS move-minimization in `each` (minimal DOM moves on
  reorder), a gzipped-size budget gate (`npm test`), and a DOM micro-benchmark
  suite. See [`bench/`](../bench/README.md).
- **DX: shipped** — a dev-only devtools hook (`@zoijs/core/devtools`) to inspect the
  reactive graph, consumed by `@zoijs/devtools` (RFC 0005).
- **SSR support: shipped** — a DOM-free template compiler + a `@zoijs/core/server`
  subpath (1.5.0, RFC 0008) that lets `@zoijs/ssr` render to a string with no DOM.
- **Additive API (RFC-gated):** an optional `svg` helper — **deferred** (RFC 0003 §6:
  rooted `<svg>` already renders; only dynamic-SVG composition is affected).
- **Hardening: shipped** — XSS-corpus fuzzing, a CSP/Trusted-Types CI gate, and a
  supply-chain (zero-dependency / star-topology) gate.
- **Reach:** mobile browsers in the CI matrix — still on the table.

## Optional ecosystem — shipped

The optional packages launched as small, opt-in modules — each built entirely on
the core's public API, with **no core changes**:

- `@zoijs/router` — client-side routing (History API).
- `@zoijs/resource` / `@zoijs/action` — reading / writing async data.
- `@zoijs/head` — document title & meta.
- `@zoijs/storage` — localStorage-backed state.
- `@zoijs/forms` — form state & validation.
- `@zoijs/i18n` — reactive locale, plurals, and `Intl` formatting.
- `@zoijs/testing` — first-party DOM testing helpers (`render` / queries / `fireEvent`).
- `@zoijs/devtools` — a dev-only reactive-graph inspector.
- `@zoijs/ssr` — render to an HTML string (SSR + static prerender), no DOM, zero deps.
- `create-zoijs` — the starter CLI (`npm create zoijs@latest`).

## 2.0+ — still on the table (separate packages)

Only as opt-in modules that never compromise the no-build, small-core identity:

- **Seamless hydration** for `@zoijs/ssr` — the client adopting server-rendered DOM in
  place (needs hydration-aware core bindings; RFC 0008 §4). The string renderer ships
  today; this is the deferred next step.
- An **optional** compiler that pre-compiles templates (must be behavior-identical
  and never required).

## Explicit non-goals (core)

Router, SSR, plugin system, global store, CLI, JSX, and a mandatory build step
will **never** be part of the core. The core stays learnable in 30 minutes.

See `VERSIONING.md` for how changes map to version bumps, and `CONTRIBUTING.md`
for the RFC process.
