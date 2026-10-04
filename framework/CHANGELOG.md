# Changelog

All notable changes to Zoijs are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and Zoijs follows
[Semantic Versioning](https://semver.org/) (see `VERSIONING.md`).

## [Unreleased]

### Added
- **Production entry: `@zoijs/core/prod` (SEC-4).** Same API as `@zoijs/core`, but a page that loads
  it starts in production mode — no development warnings, and the devtools hook never attaches.
  Bundlers' production builds select it automatically through a new `"production"` export condition
  on `@zoijs/core`; no-build apps point their import map at `src/prod.js` (or the CDN `/prod`
  subpath) when deploying. Previously every app ran in development mode unless it remembered
  `configure({ dev: false })`. `configure({ dev })` still overrides on either entry. The mode stays one
  setting per realm: the first loaded copy chooses it, later copies join without resetting it.
  In development mode on a non-`localhost` host, Zoijs now warns once that it is running in
  development mode. Security and correctness checks are unaffected by the mode.

### Fixed
- **Multiple copies of `@zoijs/core` on one page now share one reactive runtime (CORE-2).** The
  tracking context, owner scope, effect queue, dev flag and devtools inspector were per-module-copy,
  so a second copy (CDN + bundled, an import-map duplicate, a UI kit bundling its own core) silently
  split the graph: state from one copy never updated bindings or effects from the other, and its
  cleanups never ran. They now live on one runtime object per JavaScript realm, keyed by
  `Symbol.for("zoijs.runtime@1")` (the runtime protocol): every compatible copy joins it, the first
  copy's object is never replaced, and `configure({ dev })` is a single realm-wide setting. A copy with
  a different runtime protocol keeps its own runtime and logs `ZJS201` in dev mode instead of mixing.
  No API changes.
- **A conditionally shown component no longer rebuilds when state read during its setup changes (CORE-1).**
  A live binding can now return a component **uncalled** — `${() => show.get() ? Child : null}`, or
  `() => Child(props)` for props. Zoijs constructs it once, untracked, under the binding's owner, so
  the child's setup reads stay the child's: unrelated writes no longer dispose and re-create it (losing
  local state, DOM identity, focus, in-flight resources). Its own bindings stay live; when the
  condition changes it is disposed and a new one is set up. Previously a returned function rendered as
  its source text. Calling the component *inside* the binding (`? Child() : null`) can't be fixed this
  way — `Child()` then runs as part of the condition and its reads are indistinguishable from the
  condition's — so it is documented as the pattern to avoid. `@zoijs/ssr` renders the new form identically
  (previously it emitted the function's source text).

### Security
- **`html` now only compiles tagged-template literals (SEC-2).** Calling it as a function —
  `html(["<img src=x onerror=alert(1)>"])` — compiled the array as markup: a hidden `innerHTML` that
  also passed the `zoijs` Trusted Types policy, on the client and under `@zoijs/ssr`. `html` now requires
  the exact strings object the engine passes a tag (a frozen array with an own, non-enumerable, frozen
  `raw`), checked once per call site before parsing, and throws `ZJS010` otherwise. Arrays from data or
  ordinary code (JSON, `split`, spread, hand-assigned `raw`, frozen copies) can't pass. A template object
  rebuilt deliberately with `Object.defineProperty` is indistinguishable at runtime, so the new
  `@zoijs/eslint-plugin` rule `no-html-call` (in `recommended`, error) flags any direct call. Documented
  `html\`…\`` usage is unchanged.
- **Template results and `each()` markers can no longer be forged by data (SEC-1).** Zoijs
  recognized its own result objects by string properties (`__zoijsTemplate: true`,
  `__zoijsEach: true`), which JSON from an API, database, or storage can reproduce. Under
  `@zoijs/ssr` a forged object in a text slot had its `__staticHTML` emitted verbatim —
  stored XSS (`JSON.parse('{"__zoijsTemplate":true,"__staticHTML":"<img src=x onerror=…>"}')`
  rendered a live `<img onerror>`); on the client it crashed the binding. Results are now
  branded with `Symbol.for("zoijs.template")` / `Symbol.for("zoijs.each")`, which no JSON can
  produce, so such objects render as ordinary data (`[object Object]`), on the client and
  server alike. `Symbol.for` keeps results interoperable between compatible copies of the core.
  `mount()` and `each()` render functions now reject a non-template with a clear `TypeError`
  instead of trusting its fields. No documented API changed; code that read the private
  `__zoijsTemplate` / `__zoijsEach` fields should use `isTemplateResult` / `isEachMarker` from
  `@zoijs/core/server`.

## [1.8.0] — 2026-08-06

### Added
- **`${}` inside `<textarea>` and `<title>` now works** when it's the element's sole child.
  `html\`<textarea>${text}</textarea>\`` and `html\`<title>${pageTitle}</title>\`` bind the value as
  the element's content (`<textarea>`'s `value`, `<title>`'s `textContent`) and update reactively when
  the value is a function. Previously any interpolation inside a raw-text element threw.

  A comment marker can't live inside raw text, so this is a property/content binding under the hood,
  which is why it's limited to a **single interpolation with no surrounding text** — mixed content
  (`<textarea>Hi ${x}</textarea>`) still throws with a clear message. `<script>` and `<style>` continue
  to reject interpolation entirely (an injection surface). `@zoijs/ssr` renders the bound content as
  escaped text, so server output and client render match.

## [1.7.0] — 2026-08-06

### Security
- **URL-sanitizer casing bypass fixed.** HTML attribute names are case-insensitive, but the
  URL scheme check (and the `value`/`checked`/`xlink:`/`style` dispatch) compared names
  case-sensitively — so `<a HREF=${url}>` / `<img SRC=${url}>` skipped `isSafeUrl` entirely and
  could set a `javascript:` URL. Attribute names are now normalized for every security/dispatch
  decision; the original casing is preserved for `setAttribute`, so case-sensitive SVG attributes
  (`viewBox`, …) are unaffected. Mirrored in `@zoijs/ssr`.

### Fixed
- **Effect/computed runs are scoped per run.** `onCleanup`, and any `computed()` / `effect()`
  created inside an effect body, are now torn down before the next run (and on dispose) instead
  of accumulating on the enclosing owner for the node's whole lifetime — fixing a leak (e.g. a
  `setInterval` + `onCleanup` inside an effect started a new timer every run). This also makes
  reactive `@zoijs/head` `title()`/`meta()` behave correctly.
- **Disposing a computed unlinks its observers**, so a longer-lived effect can no longer read a
  frozen, stale value from a disposed computed.
- **`onCleanup` under an already-disposed owner** (an async callback that resolves after unmount)
  runs the cleanup immediately instead of leaking it into a drained scope.
- **A runaway effect is disposed** at the flush limit in every mode, instead of being left frozen
  (never re-running yet never updating).
- **`each()` duplicate keys are skipped in production**, not only warned about in dev —
  previously a duplicate key orphaned the first record's DOM node and owner scope (a leak).

No public API changes.

## [1.6.0] — 2026-06-27

### Added
- **Hydration — `mount(component, target, { hydrate: true })`.** The client now
  **adopts** server-rendered DOM in place instead of re-creating it: with `hydrate`,
  `mount` reuses the existing elements inside `target` exactly — never cloning or
  replacing them — and attaches event handlers and reactive attribute bindings to
  those live nodes. Each dynamic child slot's server content is cleared (back to the
  `<!--zoijs:[-->` start marker that [`@zoijs/ssr`](https://www.npmjs.com/package/@zoijs/ssr)
  emits) and re-rendered in place; since the values match the server, there is no
  visible change and no flash. This is the client half of full SSR — pair it with
  `renderToString(component, { hydratable: true })`. The default `mount` path is
  byte-for-byte unchanged (the option is additive), and the nine-function main surface
  is the same. `@zoijs/ssr` re-exports this as `hydrate()`. See
  [RFC 0008](docs/rfcs/0008-ssr.md).

## [1.5.0] — 2026-06-26

### Added
- **DOM-free template compiler + a `@zoijs/core/server` subpath.** `html\`…\`` now
  compiles to a static HTML string + part descriptors **without touching the DOM**;
  the `<template>` element is built lazily on first client render. This means a
  component can be evaluated on a server (no DOM) so [`@zoijs/ssr`](https://www.npmjs.com/package/@zoijs/ssr)
  can render it to a string. The new subpath exposes the building blocks a server
  renderer needs — the static HTML/parts of a result, template/list markers, and the
  **same** security predicates the client uses (`escapeText`, `escapeAttr`,
  `isSafeUrl`, `isSafeAttributeName`, `URL_ATTRS`) so server and client make
  identical safety decisions. Client rendering is byte-for-byte unchanged; the
  learnable nine-function main surface is unchanged. See
  [RFC 0008](docs/rfcs/0008-ssr.md).

## [1.4.0] — 2026-06-26

### Added
- **Devtools inspection hook** (`@zoijs/core/devtools`). A new, dev-only, read-only
  seam that lets an inspector — [`@zoijs/devtools`](https://www.npmjs.com/package/@zoijs/devtools)
  or a browser extension — observe the reactive graph: states, computeds, effects,
  the edges between them, and **which DOM node each binding updates**. It's reached
  through a dedicated subpath (`import { attachInspector } from "@zoijs/core/devtools"`),
  so the learnable **nine-function** main surface is unchanged. The hook is off by
  default (a single null check until something attaches), never instruments the hot
  read path (`.get()`), and is a no-op under `configure({ dev: false })` — so a
  production app pays no measurable cost and exposes nothing. See
  [RFC 0005](docs/rfcs/0005-devtools-hook.md).

## [1.3.2] — 2026-06-26

### Fixed
- **Focus is preserved across a keyed reorder.** The 1.3.1 minimal-move change can
  move the subtree that holds the focused element, which blurs it in browsers.
  `each` now captures focus + caret position before reordering and restores them
  after, so reordering a list never steals focus or selection — whichever nodes
  happen to move. Verified in Chromium, Firefox, and WebKit
  (`browser-tests/regression.spec.js`).

## [1.3.1] — 2026-06-26

### Performance
- **Minimal DOM moves in `each`.** Keyed-list reconciliation now uses a
  longest-increasing-subsequence pass, so a reorder moves the **fewest nodes
  possible** — moving one item across a list is a single DOM move (it could be up
  to N before). No API or behavior change; the final order is identical and reused
  nodes keep their identity (focus, input values, and scroll survive reorders).
  Proven by move-count tests (`tests/lis.test.js`); numbers in `bench/`.

## [1.3.0] — 2026-06-26

### Added
- **`boundary(child, fallback)`.** A render-time error boundary: it renders
  `child`, and if `child` throws **synchronously while building its markup** (a
  setup/render error that would otherwise break the whole `mount`), it disposes the
  partial work — so an `effect` created before the throw can't leak — and renders
  `fallback` (a value, or `(error) => value`) instead. Catches synchronous
  setup/render throws only; errors in reactive *updates* are already contained per
  binding, and *async* errors belong to `@zoijs/resource` / `@zoijs/action`'s
  `error()` state. Logs in dev, silent in production. The public surface is now
  **nine** functions (additive MINOR). See [RFC 0004](docs/rfcs/0004-error-boundary.md).

## [1.2.0] — 2026-06-26

### Added
- **`effect(fn)`.** A public reactive effect — runs a side effect immediately and
  re-runs whenever a reactive value it reads changes (automatic dependency
  tracking, microtask-batched). The function may return a cleanup that runs before
  the next run and on dispose (same convention as a `ref`); `effect` auto-disposes
  with its owner (component / list item) and returns `{ dispose }` for early
  teardown. This is the public completion of the reactive trio (`createState` /
  `computed` / `effect`) — the engine already used it internally for bindings. Use
  it for side effects *outside* the view (persist on change, sync `document.title`,
  drive a non-Zoijs widget); for on-screen content, keep using a binding
  (`${() => …}`). The public surface is now **eight** functions (additive MINOR per
  `VERSIONING.md`). See [RFC 0003](docs/rfcs/0003-effect-and-svg.md).

### Notes
- The **`svg`** helper considered alongside `effect` was **deferred**: templates
  rooted at `<svg>` already render correctly, and only dynamic-SVG *composition* is
  affected — a minority need. See [RFC 0003](docs/rfcs/0003-effect-and-svg.md) §6.

## [1.1.0] — 2026-06-25

### Added
- **Element refs.** A new `ref` binding gives you the rendered DOM element:
  `html\`<input ref=${(el) => el.focus()} />\``. The callback runs once, just after
  the element is inserted (so `focus`/`scroll`/`measure`/`canvas` work), is not
  reactive, and may return a cleanup function that runs on unmount or list-item
  removal. Works inside keyed `each` lists. Non-function values are ignored with a
  dev-mode warning and never become a DOM attribute. No new export — `ref` is a
  binding semantic, so the seven-function public surface is unchanged (additive
  MINOR per `VERSIONING.md`). See [Element refs](docs/concepts/refs.md) and
  [RFC 0001](docs/rfcs/0001-element-refs.md).

## [1.0.0] — 2026-06-24

First stable release. The public API is frozen at seven functions.

### Public API
- `html` — tagged-template renderer (no JSX, no build step).
- `mount(component, target)` → `unmount()`.
- `createState(value)` → `{ get, set, peek }`.
- `computed(fn)` → `{ get, peek }` — lazy, cached, value-gated.
- `each(items, keyFn, renderFn)` — keyed list reconciliation.
- `configure({ dev })` — development/production mode.
- `onCleanup(fn)` — teardown for components and list items.

### Features
- Fine-grained, direct DOM updates (no Virtual DOM); setup runs once.
- Push-pull reactive core with automatic dependency tracking and microtask batching.
- Owner-scoped cleanup; deterministic teardown on unmount and list-item removal.
- Context-aware template parser (quoted/unquoted/partial/multi-hole attributes,
  boolean/URL/aria/data attributes, SVG, nested templates and lists).
- Secure by default: inert text, URL-scheme allowlist (control-char resistant),
  `data:` raster-image rules, `on*`/`srcdoc` blocked, function-only handlers,
  no `eval`, CSP- and Trusted-Types-friendly.
- TypeScript definitions with generics for state/computed/lists.

### Tooling
- 100+ unit/DOM tests (jsdom), real-browser tests on Chromium/Firefox/WebKit
  (Playwright), and TypeScript type tests.
- No build step required at any point.

[1.1.0]: https://github.com/Zoijs/zoijs/releases/tag/core-v1.1.0
[1.0.0]: https://github.com/Zoijs/zoijs/releases/tag/core-v1.0.0
