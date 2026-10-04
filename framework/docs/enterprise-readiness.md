# Zoijs — enterprise-readiness declaration

> **Status: ready.** `@zoijs/core` 1.x is a stable, frozen, fully-typed,
> secure-by-default framework with a sharp optional ecosystem around it. This
> document is the sign-off: every criterion below is met, and each one links to
> **where it is enforced** — a CI gate, a test, an RFC, or a policy — not just a
> promise.

The guiding principle is that *enterprise-ready* here means **disciplined
completion**, not feature parity with larger frameworks: a small surface you can
fully understand, defended by automated checks, with the maturity (versioning,
security, support) a team needs to depend on it. What we deliberately *didn't* build
is part of the guarantee — see [Non-goals](#what-we-deliberately-did-not-build).

Everything marked "enforced in CI" runs on every push and pull request via
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — `npm test`,
`npm run test:types`, and `npm run test:browser`.

## The checklist

### 1. Stable, versioned API

| Requirement | ✅ | Evidence |
|---|---|---|
| Small, frozen public surface | ✅ | **Nine functions**, final for 1.x — [`VERSIONING.md`](../VERSIONING.md), [`src/index.d.ts`](../src/index.d.ts) |
| Semantic Versioning | ✅ | [`VERSIONING.md`](../VERSIONING.md) (MAJOR/MINOR/PATCH rules, deprecation policy) |
| Changes are deliberate (RFC-gated) | ✅ | [`docs/rfcs/`](rfcs/) — every addition (`effect`, `boundary`, devtools, SSR) has an accepted RFC |
| Cross-package naming consistency | ✅ | Reader-method design language, audited in Phase 1 — [`docs/scope.md`](scope.md) §8 |
| Type-checks pass | ✅ | `tsc --noEmit` for every package — enforced in CI (`test:types`) |

### 2. Security

| Requirement | ✅ | Evidence |
|---|---|---|
| Secure by default (no opt-in needed) | ✅ | Inert text, URL-scheme allowlist, function-only handlers, no raw-HTML sink — [`docs/security.md`](security.md) |
| XSS resistance is tested, not assumed | ✅ | [`tests/xss-corpus.test.js`](../tests/xss-corpus.test.js), [`tests/security.test.js`](../tests/security.test.js), [`browser-tests/security.spec.js`](../browser-tests/security.spec.js) |
| CSP / Trusted-Types compatible | ✅ | [`browser-tests/csp.spec.js`](../browser-tests/csp.spec.js) (real-browser gate) |
| One escaping implementation (server = client) | ✅ | `@zoijs/ssr` reuses core predicates — [`src/server.js`](../src/server.js), [RFC 0008](rfcs/0008-ssr.md) |
| No `eval` / `new Function` / runtime compilation | ✅ | Greppable absence; CSP gate above proves it |
| Disclosure policy + supported versions | ✅ | [`SECURITY.md`](../SECURITY.md) (private reporting, 72h ack) |

### 3. Testing

| Requirement | ✅ | Evidence |
|---|---|---|
| Unit / DOM coverage | ✅ | 150 core tests (jsdom) — enforced in CI (`npm test`) |
| Real cross-browser tests | ✅ | Chromium / Firefox / WebKit via Playwright — [`browser-tests/`](../browser-tests/), enforced in CI (`test:browser`) |
| Type tests | ✅ | [`types/type-tests.ts`](../types/type-tests.ts) |
| First-party testing tools | ✅ | [`@zoijs/testing`](../../testing/README.md) — drives the real DOM, zero deps |

### 4. Performance

| Requirement | ✅ | Evidence |
|---|---|---|
| Fine-grained updates, no Virtual DOM | ✅ | One value → one node; setup runs once — [`docs/concepts/`](concepts/) |
| Minimal DOM moves on reorder | ✅ | LIS reconciliation — [`tests/lis.test.js`](../tests/lis.test.js) (move-count gate) |
| Size budget enforced | ✅ | [`bench/size.mjs`](../../bench/size.mjs) `--check` (≤ 16 KB gz client) — enforced in CI |
| Reproducible benchmarks | ✅ | [`bench/`](../../bench/) (size + DOM micro-benchmarks) |

### 5. Supply chain

| Requirement | ✅ | Evidence |
|---|---|---|
| Zero runtime dependencies | ✅ | [`scripts/check-deps.mjs`](../../scripts/check-deps.mjs) — enforced in CI |
| Star topology (every package → only `@zoijs/core`) | ✅ | Same gate; no sideways deps |
| No build step (the package *is* its source) | ✅ | `main: src/index.js`; runs from `<script type="module">` |
| Immutable, signed-license releases | ✅ | npm version immutability; MIT — [`LICENSE`](../LICENSE) |

### 6. Documentation

| Requirement | ✅ | Evidence |
|---|---|---|
| Zero undocumented public APIs | ✅ | [`scripts/check-docs.mjs`](../../scripts/check-docs.mjs) — enforced in CI |
| Full guide, tutorials, API reference | ✅ | [zoijs.dev](https://zoijs.dev) / [`docs/`](.) |
| Cookbook of real recipes | ✅ | CRUD, search, infinite scroll, upload, data table, charts, animations, icons — on the site |
| Migration guides from other frameworks | ✅ | [`docs/migration/`](migration/) (React / Vue / Solid / Lit / vanilla) |

### 7. Platform & operability

| Requirement | ✅ | Evidence |
|---|---|---|
| Modern browser support, verified | ✅ | Chromium / Firefox / WebKit in CI |
| TypeScript definitions (with generics) | ✅ | [`src/index.d.ts`](../src/index.d.ts) + subpath types (`/server`, `/devtools`) |
| Server rendering (optional) | ✅ | [`@zoijs/ssr`](../../ssr/README.md) — SSR + static prerender, zero-dep |
| Dev tooling | ✅ | [`@zoijs/devtools`](../../devtools/README.md) reactive-graph inspector (dev-only) |
| Production-scale reference apps | ✅ | [`examples/`](../../examples/) — task-board, admin dashboard, contacts CRM |

### 8. Governance & support

| Requirement | ✅ | Evidence |
|---|---|---|
| Support & LTS policy | ✅ | [`VERSIONING.md`](../VERSIONING.md) (active line, ≥6-month security window per major) |
| Contribution process | ✅ | [`CONTRIBUTING.md`](../CONTRIBUTING.md) (incl. the RFC process) |
| Code of conduct | ✅ | [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) |
| Changelog discipline | ✅ | [`CHANGELOG.md`](../CHANGELOG.md) (Keep a Changelog + SemVer) |
| Roadmap & scope are explicit | ✅ | [`ROADMAP.md`](../ROADMAP.md), [`docs/scope.md`](scope.md) |

## What we deliberately did not build

Maturity is also what a framework *refuses* to add. These are recorded decisions, not
omissions — each keeps the surface small and the security model intact:

- **No Virtual DOM, no build step, no JSX, no global store, no providers/context.**
- **No `@zoijs/auth`, `@zoijs/query`, `@zoijs/ui`, `@zoijs/charts`, `@zoijs/http`, or
  `@zoijs/cli`** — handled by recipes or the platform ([RFC 0002](rfcs/0002-auth-package-decision.md),
  [RFC 0007](rfcs/0007-ecosystem-fill-decisions.md)).
- **No plugin system**, no runtime template compilation, no `eval`.

The full reasoning lives in [`PHILOSOPHY.md`](../PHILOSOPHY.md) and the
[RFCs](rfcs/). The discipline to say no is why the checklist above can stay short and
fully green.

## Sign-off

`@zoijs/core` 1.x: **API stable and frozen, secure by default, fully tested across
real browsers, zero-dependency, fully documented, and governed by published
versioning, support, and security policies — every item above enforced by CI or
policy.** Enterprise-ready.
