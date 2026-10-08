# Zoijs design principles

**Required reading before proposing a feature.**

Zoijs is small on purpose. The things it *doesn't* have are not missing — they were
left out deliberately, because each one is a trade we chose not to make. This
document explains those choices so the framework stays small, understandable, and
predictable for years.

For the precise per-capability boundaries (what each package does and doesn't do),
see [`docs/scope.md`](docs/scope.md). This page is the *why*; that page is the *what*.

---

## The one idea

You write real HTML in a tagged template, keep state in plain reactive values, and
`mount` a component. When state changes, Zoijs updates the **exact** text node or
attribute that depends on it — nothing else runs. That's the whole framework. Every
choice below protects that idea.

---

## Why we left things out

### Why no Virtual DOM?
A Virtual DOM re-runs your component, builds a tree, diffs it against the previous
tree, and patches the difference. Zoijs binds each dynamic slot **once** and updates
the one node that changed. Cost scales with *what changed*, not with app size. No
reconciler, no re-render, and none of the stale-closure / dependency-array bugs that
come with re-running components. The real DOM is already a tree you can mutate
directly — a second virtual copy is overhead we don't need.

### Why no JSX?
JSX isn't JavaScript; it needs a compiler, and a compiler means a build step. Zoijs
uses tagged template literals (`` html`...` ``) — standard JavaScript that runs in
the browser as-is. You write real HTML, parsed once. Nothing to transform, nothing
to configure.

### Why no build step?
A `<script type="module">` and an import map are the entire toolchain. No bundler,
no watcher, no transpile, no source maps to debug *through*. The gap between "what I
wrote" and "what runs" is zero, and a newcomer is productive in minutes. (You can
still add a bundler if you want one — it's just never required.)

### Why no Context?
Context exists to avoid prop-drilling **in a re-rendering tree**. Zoijs doesn't
re-render, and components are plain functions, so you pass values as arguments and
share genuinely-global state through a plain module (`export const x = createState(…)`).
That covers what Context is for — without a provider tree, a subscription system, or
the "context re-render" performance trap.

### Why no Provider?
Providers wrap your app to inject state or dependencies. In Zoijs there's nothing to
inject into — a module export is already a singleton every component can import. No
`<XProvider>` nesting, no "did you forget the provider?" runtime errors.

### Why no Store?
A global store (Redux/Vuex/Pinia) centralizes state behind actions, reducers, and
selectors because large re-rendering apps need disciplined cross-tree updates.
Zoijs's `createState` is *already* observable and fine-grained; "shared state" is
just a `createState` in a module. Add the discipline your app needs in plain code —
don't inherit a prescribed architecture you may not need.

### Why no Query Client?
A query client (React Query / SWR) brings caching, deduping, background refetch, and
invalidation because re-rendering trees refetch constantly. Zoijs **re-mounts** a
page on navigation, so `@zoijs/resource` loads fresh data exactly when the page
appears — the mount/unmount lifecycle *is* the cache invalidation. `resource` is a
~50-line reader. If you truly need a cache, add one in your code.

### Why no SSR in the core?
Server rendering + hydration is large and inherently coupled to a server and a build
pipeline. Baking it into the core would compromise the no-build, client-first
identity that makes Zoijs Zoijs. It's a real need for content/SEO sites, so it stays
a **2.0+ optional package** (`@zoijs/ssr`) — never in the core. (The docs site uses
static *prerendering*, not a runtime SSR layer.)

### Why so many optional packages?
Because the alternative is a big core. Routing, async data, head, storage, and forms
are real needs — but not *every* app's needs. Splitting them into tiny opt-in
packages (each one small file, built only on the public core) means you install only
what you use, the core stays learnable in 30 minutes, and each piece can be
understood, tested, and replaced on its own. Composition over a monolith.

### Why does every package do exactly one thing?
Single responsibility keeps each package small enough to read in ten minutes, test
thoroughly, and swap out if you disagree with it. It also prevents coupling: a
package that does one thing has no reason to reach into another's internals. The
result (verified, not aspirational) is a **star** — every package depends only on
the public core, nothing depends sideways.

---

## These are choices, not limitations

Each omission is the same trade: **less machinery, less to learn, and fewer failure
modes — in exchange for writing a little more plain code in the rare cases the 90%
path doesn't cover.** That trade *is* the framework. If you find yourself wanting to
trade it back, you probably want a different, larger framework — and that's a fine
choice, just not this one.

---

## The Rule of Three

Before any new capability enters Zoijs, it must satisfy **all three**:

1. **Can most developers explain it in under two minutes?**
   If not, it's probably too complex for a framework whose whole appeal is being
   understandable.

2. **Can it be implemented without modifying the core?**
   If yes, it belongs in an **optional package**, not the core. If it *requires* core
   changes, the bar is an RFC and it must be additive (the `ref` binding is the
   standard: real capability, **zero** new exports).

3. **Would 80–90% of Zoijs applications benefit from it?**
   If not, it belongs in **user code** or a **community package** — not in Zoijs.

If any answer is "no," the honest outcome is: it doesn't go in the framework. This one
rule prevents most framework bloat before it starts.

For the longer maintainer checklist and the per-package safe/unsafe-additions tables,
see [`docs/scope.md`](docs/scope.md) (§6–§7). For how changes map to versions, see
[`VERSIONING.md`](VERSIONING.md); for what's planned, [`ROADMAP.md`](ROADMAP.md).

---

## In one sentence

Zoijs grows by adding **small, optional, understandable pieces** around a frozen,
public core — never by making the core bigger or cleverer. Keep it that way.
