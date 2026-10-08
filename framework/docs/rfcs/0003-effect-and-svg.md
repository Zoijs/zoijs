# RFC 0003 — Public `effect`, and the `svg` helper question

- Status: **Accepted** — implemented in `@zoijs/core` 1.2.0 (2026-06-26)
- Target: `@zoijs/core` 1.2.0 (additive MINOR)
- Affects: **one new export** (`effect`). `svg`: **deferred** (no export).
- Supersedes the "public `effect` / optional `svg` helper" line in `ROADMAP.md`
  and `docs/scope.md` §7.

## 1. Problem statement

Zoijs's reactive model has three internal pieces but only exposes two:

| Primitive | Purpose | Public? |
|---|---|---|
| `createState` | a writable reactive cell | ✅ |
| `computed` | a cached derived value | ✅ |
| **`effect`** | **a side effect that re-runs when its reads change** | ❌ internal only |

The renderer uses `effect` internally to wire every binding, but there is no public
way to run a **side effect outside the template** that reacts to state. Today, to
do something imperative when state changes — persist to `localStorage`, sync
`document.title`, log analytics, drive a non-Zoijs widget, call an API on a value
change — the author must either:

- create a throwaway binding in the view (`${() => (sideEffect(), "")}`), which is
  a hack that couples a side effect to render output, or
- wrap the work in a whole component just to get a reactive scope, or
- hand-roll subscription bookkeeping that Zoijs already does internally.

This is the one gap in an otherwise complete reactive core. `effect` is the missing
third primitive, and it already exists — we are only deciding whether to **expose**
it.

The same ROADMAP line also parks an optional **`svg`** helper. §6 of this RFC
evaluates it separately and recommends **deferral**.

## 2. Rule of Three

### `effect`

1. **Explainable in under two minutes?** **Yes.** "Run a function; it re-runs
   whenever a reactive value it read changes; it cleans up with its component."
   Anyone who has met `createEffect`/`watchEffect`/`useEffect` understands it
   instantly — and unlike `useEffect`, there is no dependency array (it tracks
   automatically) and no re-render model behind it.
2. **Implementable without core changes?** It **is** the core — `effect` already
   exists in `reactivity/core.js` and is owner-scoped for cleanup. Exposing it is a
   one-line re-export plus a small, additive guarantee about per-run cleanup (§5).
   It adds **one** export, so it is RFC-gated — hence this document.
3. **Would 80–90% of apps benefit?** **Load-bearing, if not always called
   directly.** Most apps wire reactivity through template bindings and never need a
   standalone effect. But `effect` is the *primitive those bindings are made of*,
   and it is the only clean answer to "do something imperative when state changes."
   It also lets the optional packages (and user code) stop reaching for binding
   hacks. It passes as a **foundational** primitive — the completion of the trio —
   the way `createEffect` is foundational in Solid even though most components never
   call it.

**Verdict: ship.**

### `svg`

Fails Rule of Three #3 — see §6. **Verdict: defer.**

## 3. Design — `effect`

```ts
/**
 * Run a side effect that re-runs when any reactive value it reads changes.
 * Runs once immediately. The function may return a cleanup that runs before the
 * next run and on dispose (same convention as a `ref`). Auto-disposes with the
 * current component or list item; the returned handle disposes it early.
 */
export function effect(fn: () => void | (() => void)): { dispose(): void };
```

### Semantics

- **Runs immediately**, then again on a microtask after any dependency it read
  changes — batched and de-duplicated by the existing scheduler (same flush as
  bindings, same `RUNAWAY_LIMIT` protection).
- **Automatic dependency tracking.** Whatever `get()` / `data()` / `value()` it
  reads becomes a dependency. No dependency array, ever.
- **Owner-scoped cleanup.** Created inside a component or list item, it is disposed
  automatically when that scope unmounts — you rarely call `dispose()`. Created at
  module top level (no owner), it lives until you call `dispose()` yourself.
- **Per-run cleanup via return value.** If `fn` returns a function, it runs **before
  the next run** and **on dispose** — mirroring the `Ref` convention
  (`html\`<div ref=${el => { …; return () => cleanup() }}>\``), so the design
  language is consistent across refs and effects.
- **Errors are contained** (a throwing effect is logged and isolated, like bindings
  today) so one effect can't break others.
- **Not reactive to itself.** Writing a state inside an effect that the same effect
  reads follows the existing equality-gated, runaway-protected rules — no special
  cases.

### Examples

```js
import { createState, effect } from "@zoijs/core";

// Persist a value whenever it changes (no @zoijs/storage needed):
const theme = createState("light");
effect(() => localStorage.setItem("theme", theme.get()));

// Per-run cleanup (subscribe/unsubscribe a non-Zoijs source):
effect(() => {
  const id = setInterval(() => poll(query.get()), 1000);
  return () => clearInterval(id); // runs before the next run and on dispose
});

// Outside a component — manage its lifetime yourself:
const stop = effect(() => (document.title = unread.get() + " unread"));
stop.dispose();
```

### What `effect` is **not**

- Not a lifecycle system. There is no `onMounted`/`onUpdated`/`beforeUnmount`
  family — only `effect` (react to change) and `onCleanup` (tear down). Those two
  already cover the space.
- Not a watcher with old/new values. If you need the previous value, close over it
  yourself (`let prev`). We will not add a `watch(source, (cur, prev) => …)` variant
  in 1.x; it is sugar over `effect` + a local variable and fails Rule of Three #3.
- Not for rendering. To put reactive content on screen, use a binding
  (`${() => …}`), not an effect that pokes the DOM.

## 4. `untrack`

The internal `untrack(fn)` (read without subscribing) is the natural companion, but
`peek()` already covers the common case (`state.peek()`, `computed.peek()`). To keep
the surface minimal we **do not** export `untrack` in this RFC; if a real need
appears for untracking a *helper* read that has no `peek`, it can be a follow-up.

## 5. Implementation notes (verified against `src/`)

- `effect(fn)` exists in `reactivity/core.js`: it builds an effect node, registers
  `onCleanup(() => disposeNode(node))` with the active owner, runs once, and returns
  `{ dispose }`. The public export can be a direct re-export from
  `src/index.js` (alongside the existing seven).
- **The one addition** is per-run cleanup (the returned function). The current
  internal effect does not run a user cleanup between runs; the renderer doesn't
  need it. Implementation: wrap each run so the previous run's returned cleanup (and
  any `onCleanup` registered during the run) fires before the next run and on
  dispose — a child-owner-per-run pattern the renderer's list path already models.
  This is **internal and additive**; no public binding semantics change.
- Bundle/teach cost: one export, ~10 lines of docs, zero new concepts for someone
  who knows `createState`.

## 6. The `svg` helper — evaluation and recommendation

**Recommendation: defer (do not ship in this RFC).**

### What already works

SVG is **not** broken in Zoijs today:

- A template **rooted at `<svg>`** parses with the correct SVG namespace —
  `<template>` parsing handles foreign content — so
  `` html`<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>` `` renders
  real SVG elements.
- The renderer already handles namespaced SVG attributes (`xlink:href` via
  `setAttributeNS`), confirming SVG is a supported, tested path.

### The narrow gap

The only thing that doesn't work is composing **detached SVG sub-fragments** — an
`html` template that is *not* rooted at `<svg>` but is meant to live inside one,
e.g. building a list of shapes:

```js
// Each item is parsed in HTML context → <circle> is an unknown HTML element,
// not an SVG element, so it won't draw.
html`<svg>${each(() => points, p => p.id, p => html`<circle .../>`)}</svg>`
```

An `svg` tagged template (`` svg`<circle .../>` ``) would parse such fragments in
the SVG namespace and fix this.

### Why defer

- **Fails Rule of Three #3.** Only apps that *build dynamic SVG* (charts, diagrams,
  generated icons) hit this — a clear minority, not 80–90%.
- **There is a workaround.** Keep dynamic SVG rooted in a single `<svg>` literal and
  drive its contents with bindings/attributes; or, for heavy SVG work, reach for the
  platform (`createElementNS`) or a community helper. We will **document** the
  rooted-`<svg>` pattern and the limitation.
- **It can ship later without breaking anything.** `svg` is purely additive; if
  dynamic-SVG demand proves common, a future RFC adds it (or a `@zoijs/svg`
  community package does). Deferring costs us nothing and keeps the 1.2 surface
  minimal.

`docs/scope.md` §7 is updated to record `svg` as **deferred with a documented
workaround**, and `effect` as **accepted**, so neither is relitigated.

## 7. Alternatives considered

- **Ship neither (status quo).** Rejected for `effect`: the binding-hack workaround
  is genuinely bad and the primitive already exists. Accepted for `svg`.
- **Ship both.** Rejected: `svg` doesn't clear the bar, and "finalization" means
  finalizing things *out* as readily as in.
- **A `watch(source, cb)` API.** Rejected as sugar over `effect` (#3 fail).
- **Expose `untrack` too.** Deferred (§4) — `peek()` covers the common case.

## 8. Drawbacks

- One more export on a deliberately tiny surface. Mitigated: it's the *completion*
  of the reactive model, not a new concept, and it removes worse workarounds.
- A standalone `effect` can be misused to mutate the DOM imperatively where a
  binding belongs. Mitigated by the "What `effect` is not" docs (§3).

## 9. Decision

- **`effect`** — **proposed for `@zoijs/core` 1.2.0** (additive MINOR, one export,
  per-run cleanup matching the `ref` convention).
- **`svg`** — **deferred** with a documented workaround; revisit only on real
  dynamic-SVG demand.

On acceptance: implement per-run cleanup, add the export + types + tests + a docs
page, and update `ROADMAP.md` / `docs/scope.md` to mark `effect` shipped and `svg`
deferred.
