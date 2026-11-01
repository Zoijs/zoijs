# Decision 0007 — Phase 7 ecosystem-fill decisions

- Status: **Decided** — `@zoijs/i18n` **shipped** ([RFC 0006](0006-i18n-package.md));
  `@zoijs/http`, `@zoijs/animations`, and an icons *package* **declined** (each
  redirected to the platform + a recipe/convention).
- Context: Phase 7 fills remaining 90%-path gaps **and only those** — every candidate
  passes the Rule of Three and the star topology, or is declined with a recorded
  reason. This record is the "recorded reason" for the three no's.

The Phase 7 candidate list was: `@zoijs/i18n`, `@zoijs/animations`, an icons
convention, and `@zoijs/http` vs. just-use-`fetch`. One shipped; the rest are
documented declines. Saying no is the work here as much as saying yes — a small,
sharp ecosystem is the strategy, not an accident.

## A. `@zoijs/http` — **Declined** (use `fetch` + `@zoijs/resource` / `@zoijs/action`)

**Rule of Three #3 fails: it isn't a capability gap.** `fetch` is the platform's HTTP
client, and the async-state problem it's usually paired with is already solved:
`@zoijs/resource` wraps reads (`loading` / `data` / `error` / `refresh`, race-safe) and
`@zoijs/action` wraps writes (`pending` / `error` / `run`). What's left — a base URL,
default headers, JSON parsing, error-on-non-2xx — is **three lines** in a project's own
`api.js`, and every app wants those three lines slightly different (auth header, error
shape, retry policy).

A wrapper would either be too thin to justify importing or would start accreting
opinions (interceptors, retries, a client object) that pull toward an axios-shaped
dependency — exactly the kind of sprawl the philosophy rejects. **Decision: no package.**
The [CRUD](https://zoijs.dev/cookbook-crud) and [Search](https://zoijs.dev/cookbook-search)
recipes show the `fetch` + `resource`/`action` pattern end to end.

## B. `@zoijs/animations` — **Declined as a package → recipe**

**The valuable part needs core changes that are out of scope; the rest is one line of
platform.** Break the space in two:

- **Enter / toggle animations** are already trivial without a package. The `ref` binding
  hands you the element, and the Web Animations API (`el.animate(...)`) or a CSS
  transition does the rest: `ref=${(el) => el.animate(keyframes, opts)}`. A package
  around that adds an import for nothing.
- **List leave / move (FLIP) animations** — the genuinely hard, genuinely useful part —
  require deferring a node's *removal* until its exit animation finishes. Zoijs's keyed
  `each` removes nodes synchronously during reconciliation and exposes no removal hook.
  Delivering leave animations would mean **adding a core lifecycle seam** to `each`,
  which is out of scope for an optional package (and a non-trivial core change we won't
  make speculatively).

A package that can only do the one-line "enter" half isn't worth importing, and the
half worth importing can't be built without touching the core. **Decision: no package**
now; ship an [animations recipe](https://zoijs.dev/cookbook-animations) covering enter
(via `ref` + WAAPI) and component-controlled presence (animate-then-remove where the
component owns the boolean). If first-class list transitions are ever wanted, that's a
future **core** RFC (a removal hook on `each`), not a bolt-on package.

## C. Icons — **Convention, not a package**

**There is no runtime problem to solve.** Icons in a no-build framework are just SVG:
inline `<svg>` in a template, a sprite sheet referenced with `<use href="#id">`, or an
`<img src="icon.svg">`. None of that needs reactivity, state, or a dependency, and a
package would only wrap static markup. **Decision: a short
[icons convention/recipe](https://zoijs.dev/cookbook-icons)** (the three patterns, when
to use each, and the security note that an external SVG `src` is treated like any other
URL) — no `@zoijs/icons`.

## D. Reaffirmed non-goals (unchanged)

For the record, the explicit "no" packages from the philosophy and prior decisions stand
and were **not** revisited in Phase 7: `@zoijs/auth` (a [recipe](https://zoijs.dev/auth);
see [Decision 0002](0002-auth-package-decision.md)), `@zoijs/query`, `@zoijs/ui`,
`@zoijs/charts` (a [recipe](https://zoijs.dev/cookbook-charts) — drop in any vanilla lib
via `ref`), `@zoijs/cli`, and any plugin system.

## Outcome

Phase 7 ships **one** package (`@zoijs/i18n`) and records **three** disciplined declines,
two of which become cookbook recipes. The ecosystem stays a star of small, single-purpose
packages around a frozen core — every node earning its place, the rest deliberately left
to the platform.
