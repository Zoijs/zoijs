# Zoijs scope definition

An engineering record of what each capability **is**, what it **is not**, and where
its responsibility ends. Its purpose is to let any contributor answer one question
before adding anything:

> **"Does this belong in Zoijs?"**

If a capability starts solving problems outside its stated purpose, it should stop.
Zoijs stays small, understandable, predictable, loosely coupled, and composable —
or it isn't Zoijs.

## 1. Executive summary

The ecosystem is **highly cohesive and loosely coupled.** It is one frozen
nine-function core plus seven small optional packages and a zero-dependency starter
CLI. Verified facts behind that claim:

- Every optional package's source imports **only** from `@zoijs/core`'s public API
  (`createState`, `onCleanup`, `html`, `mount`). No package imports another; no
  package reaches into another's internals. (Grep-verified across all `src/`.)
- The core is a closed set: `html`, `mount`, `createState`, `computed`, `each`,
  `configure`, `onCleanup` — plus the `ref` binding (1.1.0, **no new export**).
- There is no provider, context, global store, dependency injection, event bus,
  hook system, or build step anywhere in the ecosystem.

The single thing to keep watching: `@zoijs/forms` exposes its `values` / `errors` /
`touched` as raw state objects while every other package exposes reader functions —
a minor design-language inconsistency (see §4), not a coupling or scope problem.

**Conclusion:** clear boundaries, low coupling, high cohesion, sustainable. Evidence
throughout.

## 2. Package scope matrix

| Capability | Purpose (one responsibility) | Responsibilities | Non-responsibilities (by design) |
|---|---|---|---|
| **@zoijs/core** | Reactive rendering of templates to the DOM | Tagged-template parsing (once, cached); fine-grained reactivity (`createState`/`computed`/`each`); direct DOM updates (no VDOM); owner-scoped cleanup; `ref`; secure-by-default rendering | Routing, HTTP, forms, auth, storage, CLI, global store, DI, SSR, a build step |
| **@zoijs/router** | Map a URL to a component | URL pattern matching, `:params`, `base` path, history navigation (`pushState`/`popstate`), active-link `aria-current` | Auth, authorization, loaders, data fetching, nested routing/outlets, SSR, transitions, middleware/guards, layouts |
| **@zoijs/resource** | Read async data | Reactive `loading`/`data`/`error`, `refresh`, race-safety (a stale request can't clobber a newer one), auto initial load | Caching, retries, optimistic updates, a query client, mutations, invalidation |
| **@zoijs/action** | Write async data | Reactive `pending`/`error`/`done`/`result`, `run()` (never throws), `reset`, race-safety | Retries, optimistic UI, transactions, queues, offline support, cache invalidation |
| **@zoijs/storage** | Persist one simple reactive value | `createState`-shaped value backed by `localStorage` (JSON), graceful degrade to in-memory | Encryption, IndexedDB, cross-tab/session sync, schema validation, a persistence engine, custom serializers, TTL |
| **@zoijs/forms** | Hold native-form state | Reactive `values`/`errors`/`touched`, per-field helpers, manual synchronous `validate`, `handleSubmit` (prevents reload) | Field registration, providers/context, schema validation, async validation, form builders, UI components, the network call |
| **@zoijs/head** | Set document metadata from a component | `title`/`description`/`meta`, restore-on-cleanup | SSR, SEO engines, head reconciliation/dedup, a document-manager abstraction |
| **@zoijs/testing** | Drive the real DOM in tests | `render` into a container, scoped queries (text/role/test-id/label), `fireEvent`, `waitFor`/`tick`, `cleanup`, `mockRouter` | A custom renderer, a virtual snapshot format, a test runner, assertion matchers, network mocking, a real browser |
| **create-zoijs** | Copy a starter template | Copy a template, substitute the app name, validate the name, refuse a non-empty dir | Code generation, framework config, build setup, plugins, upgrades/migrations, interactive wizards |

## 3. Responsibility boundaries

Where each capability **ends** and where **user code** begins:

- **core** ends at "your data is in the DOM and stays in sync." Application logic,
  data flow between components, and any I/O are yours.
- **router** ends at "the matched component is rendered for this URL." *Whether* a
  user may see it (auth/authz), *what data* it needs (fetching), and *how* it
  animates (transitions) are yours — compose `resource`, `head`, and guards in user
  code (see the auth recipe).
- **resource** ends at "the latest read settled into `data`/`error`." Caching,
  deduping, and retry policy are yours (usually you don't need them).
- **action** ends at "the write settled; `error` holds any failure." Retry,
  rollback, and refetch-after-write are yours (call `resource.refresh()`).
- **storage** ends at "this value persists across reloads in this tab." Anything
  bigger (large/binary data, cross-tab, encryption) is a different tool, in your code.
- **forms** ends at "values/errors/touched are tracked and `validate()` ran." The
  network submit is `@zoijs/action`; schemas/async validation are yours.
- **head** ends at "the tag is set now and restored on unmount." SEO for crawlers
  that don't run JS needs server rendering — that's [`@zoijs/ssr`](../../ssr/README.md)
  (head is SSR-safe: put the initial tags in your HTML shell), not head itself.
- **create-zoijs** ends at "files were written." Everything after `cd` is a normal
  project you own; the CLI never runs again.

### Refs

**Purpose:** imperative access to a *rendered DOM element* — `focus()`,
`scrollIntoView()`, `getBoundingClientRect()`, canvas, and handing the node to a
third-party DOM library. A `ref` is a callback that receives the element after
insertion and may return a cleanup.

**Use a ref when** you need the real element for something the platform does
imperatively (focus, measure, draw, integrate a widget).

**Do NOT use a ref for:** component communication (use arguments + callbacks),
state management (use `createState`), or as a lifecycle/`useEffect` replacement
(setup is the call; teardown is the returned function — nothing more).

### Authentication recipes

**Purpose:** documentation **examples only** showing how to compose existing
packages (`resource` for the current user, `forms`+`action` for login). They are
**not** a security feature and there is no `@zoijs/auth`.
- **Client responsibilities:** ask the server "who am I?", reflect the answer in the
  UI, send credentials over HTTPS, keep no long-lived secrets in JS-readable storage.
- **Server responsibilities:** authenticate the session and **enforce** it on every
  request. The server is the source of truth.

### Authorization recipes

**Purpose:** examples showing role-based **UI visibility** via `computed()`. They
**control what's shown, not what's allowed.** Hiding a button is cosmetic; the
server must authorize every action. A client role check can be flipped in DevTools.

### Component communication

**Preferred model:**
- **Parent → child:** function parameters (plain data, or `() => value` readers for
  data that changes).
- **Child → parent:** callbacks the parent passes in; the parent owns the state and
  performs the mutation.
- **Shared state:** a plain module exporting a `createState`, **only when multiple
  distant components genuinely share it.**

**Intentionally avoided:** event buses, providers, dependency injection, context
trees. They hide who talks to whom; Zoijs keeps the data flow visible in one place.

### Website (zoijs.dev)

**Purpose:** documentation, examples, tutorials, and API reference — a static,
prerendered, searchable docs site (built with Zoijs itself).
**It is not:** a live playground/REPL, a package manager, a CMS, or a hosted
learning platform. (A playground would require a bundler/runtime — against the
no-build identity.)

### Starter templates

**Purpose:** demonstrate **one** clean, idiomatic project shape (plain files, no
build). They are a starting point and a teaching tool — **not the only valid
structure.** Users are expected to delete, rename, and restructure freely.

## 4. Coupling analysis

**Hidden dependencies: none found.** Evidence:

- Grep across every `src/`: each optional package imports **only** `@zoijs/core`
  (the `@zoijs/router`/`@zoijs/action`/… strings elsewhere are JSDoc comment
  examples, not imports). router also imports the type-only `TemplateResult`.
- **No optional package imports another.** Notably, `@zoijs/forms` does **not**
  import `@zoijs/action` — they're paired only in documentation/usage, a convention,
  not a code dependency.
- `create-zoijs` has **zero** runtime dependencies (Node built-ins only); it merely
  *generates* apps that depend on `@zoijs/core`.
- All dependence on the core is through its **public API** (`createState`,
  `onCleanup`, `html`, `mount`). No package reaches into core internals (the
  reactive graph, owner scopes, the `__zoijsEach` marker, the scanner) — those are
  explicitly non-public (`VERSIONING.md`).

**Enforced, not just observed.** `scripts/check-deps.mjs` (run by the root
`npm test`) fails the build if any package ships a runtime dependency, if an
optional package peer-depends on anything but `@zoijs/core`, or if any package's
source imports a sibling `@zoijs/*` package. The star is a CI gate.

**Recommendation:** none required. The dependency graph is a star: everything points
at the public core, nothing points sideways. Keep it that way — a package needing
another package's internals is the signal to stop.

## 5. Scope-creep risks (where we could accidentally become React/Vue/Angular)

| Area | The tempting feature | Why it's out |
|---|---|---|
| core | hooks, context/provider, a global store, a public scheduler, JSX/compiler | Recreates the abstractions Zoijs exists to avoid; the frozen, RFC-gated API is the guardrail |
| router | loaders/route-actions, nested outlets, middleware/guards, transitions, layouts | This is the Remix/Next/Angular-router surface; routing is "URL → component," nothing more |
| resource | cache + dedupe + invalidation | That's a query client (React Query); resource is a *reader*, not a cache |
| action | optimistic updates + rollback + queues | That's a mutation engine; action is a *writer* |
| forms | provider + resolver + schema + field arrays + async engine | That's React Hook Form / Formik; forms is *native form state*, flat and manual. (Highest-risk package — also the one with the minor reader-shape inconsistency.) |
| storage | a Redux-persist-style sync/migration engine | storage persists *one value*; anything more is a different tool |
| head | reconciliation + SSR | That's react-helmet; head is *set + restore* |
| create-zoijs | generators, config, plugins, upgrades | That's Vue-CLI/Angular-CLI/Nx; create-zoijs *copies files once* |
| refs | using refs for communication or as a lifecycle hook | Refs are imperative DOM access only |
| website | a live playground/REPL | Requires a bundler/runtime; violates no-build |

## 6. Long-term guardrails (the "Does this belong in Zoijs?" checklist)

### The Rule of Three (start here)

Before any new capability enters Zoijs, it must satisfy **all three** — any "no"
means it does not go in the framework:

1. **Can most developers explain it in under two minutes?** If not, it's too complex.
2. **Can it be implemented without modifying the core?** If yes → an optional
   package (core changes are RFC-gated and additive only — `ref` is the bar: real
   capability, zero new exports).
3. **Would 80–90% of Zoijs applications benefit?** If not → user code or a community
   package.

See [`PHILOSOPHY.md`](../PHILOSOPHY.md) for the rationale behind these. The fuller
maintainer checklist:

Before accepting any addition, a maintainer should be able to answer **yes** to all:

1. **No build step.** It works with a `<script type="module">` and an import map;
   no bundler, compiler, or JSX transform is required.
2. **No core API growth by default.** It does not add to the public exports; any core
   change goes through an RFC and must be additive (the `ref` binding is the bar:
   real capability, zero new exports).
3. **Optional and core-only.** If it can't be built as one small package on the
   core's *public* API, it doesn't belong.
4. **No global machinery.** No provider, context, DI, global store, event bus, or
   lifecycle system.
5. **One responsibility.** One small, readable file you could write in an afternoon
   and read in ten minutes. It does not overlap an existing package.
6. **90% case, not edge case.** Edge cases stay in user code.
7. **No false guarantees.** If it implies security or correctness the client can't
   actually provide, it's a documentation recipe, not code (see auth/authz).
8. **Composable, not coupled.** It reads/writes through public APIs and never needs
   another package's internals.

If the answer is "no" to any of these, the honest response is: **it belongs in user
code, or in a separate community package — not in Zoijs.**

## 7. Deferred ideas (good, but outside the framework unless demand is overwhelming)

These are intentionally *not* implemented. Listing them here so the next person
doesn't relitigate them:

- **`@zoijs/ssr`** — server rendering + hydration — **shipped** (separate package,
  RFC 0008): a DOM-free compiler + `@zoijs/core/server` (1.5.0) let it render to a
  string; in-place hydration landed in core 1.6.0 / ssr 0.2.0, and `serialize` +
  `resource({ initial })` (ssr 0.3.0 / resource 0.2.0) hand server data to the client.
  `head` and `router` are SSR-safe. Per-request routed SSR (loaders) is still deferred.
- **An optional template compiler** — must be behavior-identical and never required.
- **Public `effect`** export — **shipped in 1.2.0** (RFC 0003); the public
  completion of the reactive trio. An optional **`svg`** helper — **deferred**
  (RFC 0003 §6: rooted `<svg>` already renders; only dynamic-SVG composition is
  affected; documented workaround). An **error-boundary** helper (`boundary`) —
  **shipped in 1.3.0** (RFC 0004): catches a synchronous setup/render throw and
  renders a fallback.
- **A generic guarded-route helper in `@zoijs/router`** — only if the auth-guard
  pattern proves common (decision 0002); still not an auth package.
- **`@zoijs/storage` sessionStorage variant** — borderline; only if real demand
  appears, and never a Redux-style persistence engine.
- **Forms reader-function harmonization** (`form.values()` instead of
  `form.values.get()`) — a breaking change; a future-major consideration only.
- **Devtools hook** to inspect the reactive graph; **LIS** move-minimization in
  `each`; **XSS-corpus fuzzing**; **mobile browsers** in CI (all internal/perf, no
  API change).
- **A live playground** on zoijs.dev — pleasant, but needs a bundled runtime.

See `ROADMAP.md` and `docs/rfcs/` for the living versions of these.

### Future growth guardrails per package

| Package | Safe additions | Unsafe additions |
|---|---|---|
| core | dev-warning improvements, perf internals, docs | new exports without RFC, hooks/context/store |
| router | base-path/edge-case fixes, better active-link matching | loaders, middleware, nested layouts, transitions |
| resource | docs, race-condition hardening | cache, dedupe, invalidation |
| action | docs, race-condition hardening | optimistic UI, retries, queues |
| storage | (maybe) a sessionStorage variant | encryption, IndexedDB, sync/migration engine |
| forms | small pure validation helpers | provider, resolver, schema engine, field arrays |
| head | docs, attribute coverage | reconciliation, SSR, a document manager |
| create-zoijs | small template polish, a new template | generators, config, plugins, upgrades |

## 8. Design language (cross-package naming conventions)

The packages share one naming language so that learning one helper teaches the
others. New packages **must** follow it.

**Parentheses mean a reactive read.** Every value you read inside a binding is a
*method call*, never a property or getter — `count.get()`, `user.data()`,
`router.path()`, `form.value("email")`. Seeing `()` is the signal that the read
subscribes. There are no reactive *properties* anywhere in Zoijs.

**Two shapes, chosen by what the thing is:**

- A single **reactive cell** exposes `get()` / `set()` / `peek()` — `createState`,
  `@zoijs/storage` (which *is* a persistent cell), and `computed` (`get` / `peek`,
  no `set`). `peek()` reads without subscribing. The `State<T>` type is declared
  **once** in core and imported by packages that reuse it — never re-declared.
- A **reactive helper** exposes named zero-arg (or single-key) reader methods for
  what it holds — `data()`, `loading()`, `error()`, `pending()`, `done()`,
  `result()`, `path()`, `query()`, `all()`, `value(name)`, `error(name)`,
  `isTouched(name)`. Each subscribes when read in a binding.

**Deliberate distinctions (not inconsistencies to "fix"):**

- `@zoijs/resource` uses **`loading()`** while `@zoijs/action` uses **`pending()`**
  for "in flight." Intentional: a resource *reads* (data is *loaded*); an action
  *writes* (a mutation is *pending*). The read/write split mirrors the
  query-vs-mutation distinction and keeps each helper's vocabulary honest.
- `action` exposes a `done()` success flag and `result()`; `resource` does not —
  success is simply `data() !== undefined`. `resource` stays minimal on purpose
  (`loading` / `data` / `error` / `refresh`).
- `forms` exposes reader methods (`all()` / `allErrors()` / `allTouched()`) *and*
  the raw `values` / `errors` / `touched` cells. Collapsing `form.values.get()`
  into `form.values()` is a breaking change held for a future major (§7).

A new reader on a new helper should be named for *what it returns*, take no
arguments (or one key), and read reactively. If you reach for a getter/property,
stop — that is not how Zoijs reads state.

## 9. Final recommendation

The Zoijs ecosystem currently has **clear boundaries, low coupling, high cohesion,
and a sustainable long-term architecture.** Evidence:

- **Clear boundaries:** every capability has one documented responsibility and an
  explicit non-responsibility list (§2). The hard rules (no build, no core growth,
  no global machinery) are enforced by the frozen, RFC-gated core (nine functions).
- **Low coupling:** grep-verified — all packages depend only on the core's public
  API; none imports another; `create-zoijs` has zero deps; no internal access (§4).
- **High cohesion:** each package is one small file doing one thing, with a
  recognizable reader-function design language across `createState` / `computed` /
  `resource` / `action` / `storage` / `router` (the one `forms` exception is noted
  and deferred, not a coupling issue).
- **Sustainable:** the guardrail checklist (§6) gives maintainers a repeatable test;
  the deferred list (§7) records what to keep out and why.

The ecosystem is positioned to grow the way it's meant to — by adding small,
optional, understandable pieces — without drifting toward a large framework.
