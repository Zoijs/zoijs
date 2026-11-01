# RFC 0004 — Error boundary (`boundary`)

- Status: **Accepted** — implemented in `@zoijs/core` 1.3.0 (2026-06-26)
- Target: `@zoijs/core` 1.3.0 (additive MINOR)
- Affects: **one new export** (`boundary`). Resolves the "optional error-boundary
  helper" line in `ROADMAP.md` and `docs/scope.md` §7.

## 1. Problem statement

Zoijs already contains errors in **reactive updates**: if a binding or `effect`
throws while re-running, the core logs it and isolates it — other bindings keep
working (`runComputation` catches; tested in `safety.test.js`). Async errors have
a home too (`@zoijs/resource` / `@zoijs/action` expose `error()`).

The **one** uncontained case is a **synchronous throw during a component's setup /
render** — the component function itself throwing while it builds its markup:

```js
function Widget() {
  const data = JSON.parse(props.raw); // throws on bad input
  return html`…`;
}
mount(() => html`<main>${Widget()}</main>`, "#app"); // ← the whole mount breaks
```

Because `mount` runs the component once and inserts the result, a throw there
propagates out of `mount` and **nothing renders** — one bad widget or one bad API
payload blanks the entire page. There is no way today to say "if this subtree fails
to build, show a fallback instead."

## 2. Rule of Three

1. **Explainable in under two minutes?** **Yes.** "Render this; if it throws while
   building, show a fallback instead." It's the one idea everyone means by "error
   boundary," minus the class-component machinery.
2. **Implementable without core changes?** **No** — and that's why it belongs in
   the core. A correct boundary must dispose the **partial** work a failed setup
   created (a `createState` is inert, but an `effect` created before the throw has
   already run and would re-run forever — a zombie). Tearing that down needs the
   internal **owner scopes** (`createOwner` / `runWithOwner` / `disposeOwner`),
   which are explicitly non-public. So it cannot live in an external package; it is
   an additive, RFC-gated core export (the standard `effect`/`ref` bar).
3. **Would 80–90% of apps benefit?** **Production apps, yes.** Any app that renders
   third-party widgets, user-authored content, or data it didn't shape wants one
   subtree's failure to be contained rather than fatal. It's a resilience
   primitive, on the ROADMAP as planned hardening.

**Verdict: ship.**

## 3. Design

```ts
export function boundary<C, F>(
  child: (() => C) | C,
  fallback: ((error: unknown) => F) | F
): C | F;
```

Render `child` (a component function or a value). If it **throws synchronously
while building its markup**, dispose anything the failed setup created and render
`fallback` (a value, or `(error) => value`) instead. Place the call in a template
slot:

```js
html`<section>
  ${boundary(
    () => RiskyWidget(),
    (err) => html`<p class="error">Couldn't load this section.</p>`
  )}
</section>`
```

### Semantics

- **Owner-scoped cleanup.** `child` runs inside a child owner scope. On success the
  scope nests under the surrounding component/list-item and is disposed with it; on
  failure it is disposed immediately, so an `effect`/`computed` created before the
  throw cannot leak or re-run.
- **What it catches:** a **synchronous** throw while `child` builds its result
  (setup + template construction) — exactly the case that breaks `mount` today.
- **What it does *not* catch (by design, documented):**
  - Errors in **reactive updates** inside the rendered subtree — already contained
    per binding by the core (the subtree keeps working; the boundary does not swap
    to the fallback for these).
  - **Async** errors (rejected promises, `setTimeout`) — use `@zoijs/resource` /
    `@zoijs/action`'s `error()` state.
- **Not reactive / no reset.** It renders once. There is no `retry()` — re-mount
  the subtree (e.g. via a keyed `each` or a router navigation) to try again. A
  `retry` would be sugar over re-mounting and fails Rule of Three #3.
- **Dev logs, prod quiet.** In dev it logs the caught error (with the fallback
  notice); in production (`configure({ dev: false })`) it's silent — same policy as
  the rest of the core.

### What it is *not*

Not a lifecycle hook, not a global handler, not a class component. Two tools cover
errors in Zoijs: the core's automatic per-binding containment (reactive updates)
and `boundary` (setup/render throws). Together they're the whole story.

## 4. Implementation notes (verified against `src/`)

- New file `src/core/boundary.js`; uses `createOwner` / `runWithOwner` /
  `disposeOwner` (owner.js) and `isDev` (env.js). `runWithOwner` already restores
  `currentOwner` in a `finally`, so `currentOwner` is correct in the `catch`.
- `${boundary(...)}` evaluates during the surrounding component's execution, where
  `currentOwner` is the right scope (mount root, a nested render, or an `each`
  item) — so the child scope nests correctly in every case.
- Transparent to the value type: whatever `child`/`fallback` return (a
  `TemplateResult`, `null`, a string, a `Node`) flows straight into the slot.
- One export, ~15 lines, no new concept for anyone who has met an error boundary.
  The public surface becomes **nine** functions.

## 5. Alternatives considered

- **A userland `try/catch`.** Catches the setup throw, but leaves the partial
  work's zombie `effect` running and has no scope to dispose — incorrect for
  anything that created reactive state before throwing. Rejected.
- **A wrapper component / boundary *element*** (`<boundary>`). More syntax for the
  same behavior; a plain function in a slot is smaller and composes anywhere.
- **Catching reactive-update errors too** (swap to fallback on any subtree error).
  Needs the boundary to monitor its subtree's effects — much larger, and the core
  already contains those errors. Deferred; not in this minimal version.

## 6. Drawbacks

- A ninth export on a deliberately tiny surface. Mitigated: it's a well-understood
  resilience primitive, additive, and it removes a real failure mode (a fatal mount).
- Could mask bugs if overused. Mitigated by the dev-mode log and docs steering it at
  *untrusted* subtrees (third-party widgets, foreign data), not as a blanket wrap.

## 7. Decision

**Accepted for `@zoijs/core` 1.3.0** (additive MINOR, one export). On acceptance:
implement `boundary`, add the export + types + tests + a docs page, and update
`ROADMAP.md` / `docs/scope.md` to mark it shipped.
