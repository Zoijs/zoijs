# RFC 0005 — Devtools inspection hook (`@zoijs/core/devtools`)

- Status: **Accepted** — implemented in `@zoijs/core` 1.4.0 (2026-06-26)
- Target: `@zoijs/core` 1.4.0 (additive MINOR) + a new optional package
  `@zoijs/devtools` 0.1.0
- Affects: **no change to the main entry** — the learnable nine-function surface is
  unchanged. Adds one dev-only **subpath**, `@zoijs/core/devtools`. Resolves the
  "DevTools (reactive-graph inspector)" line of the development plan (Phase 5).

## 1. Problem statement

Zoijs's whole pitch is **fine-grained reactivity**: a `state.set(...)` wakes exactly
the effects that read it, and each effect updates its DOM node in place — no Virtual
DOM, no component re-execution, no diff. That is also the part a newcomer has to take
on faith, because it's invisible. React DevTools shows a component tree because React
*has* one as its mental model; Zoijs's mental model is the **reactive graph** (states
→ computeds → effects → DOM), and nothing today lets you see it.

There is no supported way for an inspector to observe the graph, either. The nodes
(`createState` / `computed` / `effect`) and their `sources`/`observers` edges are
private to `core.js`. An external tool would have to monkey-patch internals, which is
brittle and would couple tooling to the engine's shape.

We want a **first-party way to reveal the model** — "watch one signal update one
node" — without growing the learnable API, without any production cost, and without a
build step.

## 2. Rule of Three

1. **Explainable in under two minutes?** **Yes.** "A read-only hook the engine
   reports node lifecycle to, so a dev tool can draw the reactive graph and show
   which DOM node each signal updates." It mirrors React/Vue's devtools hook idea,
   minus a tree Zoijs doesn't have.
2. **Implementable without core changes?** **No.** A faithful inspector must observe
   node creation, recomputation, writes, and disposal, and must read the private
   `sources`/`observers` edges. That can only come from inside `core.js`. So the
   **hook** belongs in the core; everything else (the model, the panel) is an
   **external package** built on it — the star topology holds.
3. **Would 80–90% of apps benefit?** **At dev time, yes** — understanding and
   debugging reactivity is universal. At runtime it must cost nothing, which the
   design guarantees. It earns its place as *tooling*, not as app surface.

**Verdict: ship** — as a dev-only core hook (additive) plus an optional package.

## 3. Design

### 3.1 The core hook (`@zoijs/core/devtools`)

A new module, `src/reactivity/devtools.js`, exposed through a dedicated subpath so
the **main** entry stays frozen at nine functions:

```ts
// import { attachInspector } from "@zoijs/core/devtools";
type NodeKind = "state" | "computed" | "effect";
interface NodeLabel { kind: "text" | "attr" | "list"; el: Node; name?: string }
interface Inspector {
  onAttach?(): void;
  onCreate(node: ReactiveNode, kind: NodeKind, label?: NodeLabel): void;
  onRun(node: ReactiveNode): void;     // a computed/effect recomputed
  onWrite(node: ReactiveNode): void;   // a state actually changed
  onDispose(node: ReactiveNode): void; // a computed/effect left the graph
}
function attachInspector(inspector: Inspector): () => void; // returns detach
function inspecting(): boolean;
```

The engine reports at **four lifecycle points** — `createState` / `computed` /
`effect` creation, `runComputation` (run), `writeNode` (changed write), and
`disposeNode`. The renderer wraps its three binding sites (`labelNext`) so the effect
that drives a slot carries the DOM node it updates. The inspector reads edges from
the node's own `sources`/`observers` Sets **on demand**.

### 3.2 Invariants (why this is safe to put in the core)

- **Off by default.** Until something attaches, every report is a single
  `if (!inspector) return`. Production apps that never attach pay nothing measurable
  and expose nothing.
- **The hot path is untouched.** `readNode` (run on every `.get()`) is **not**
  instrumented. Edges are reconstructed from node fields when an inspector asks, so
  even an *attached* inspector adds no per-read cost.
- **Dev-only.** `attachInspector` is a no-op under `configure({ dev: false })`, so an
  inspector can never observe an app shipped in production mode.
- **Read-only.** The engine *hands* nodes to the inspector; it never reads anything
  back from it and never lets it mutate the graph.
- **Surface stays frozen.** Nothing is added to the main entry; the hook lives behind
  `@zoijs/core/devtools`. The "nine functions" are unchanged.

### 3.3 The package (`@zoijs/devtools`)

An optional package (peer on `@zoijs/core`, zero deps) with two exports:

- `createInspector()` — a headless live **model** (nodes, edges, stats) with
  `attach()` / `detach()` / `subscribe()`. The reusable core; also what tests assert
  on and what a browser extension would drive.
- `inspect(options?)` — attaches and mounts a floating, plain-DOM **panel**: every
  node colour-coded by kind, its value and run/write counters, an activity flash on
  update, and the DOM target of each binding (hover to outline that one node). The
  panel is built from plain DOM — **not** Zoijs reactivity — so it never adds nodes to
  the graph it inspects.

## 4. Out of scope (guardrails)

- **No time-travel, no render replay.** Zoijs has no re-render to replay; a timeline
  of renders would imply a mental model Zoijs doesn't have. The tool shows the live
  graph, not a history of frames.
- **No production exposure.** No global is installed on import; attachment is explicit
  and dev-gated. (A browser-extension bridge — a global the extension can attach
  through — is a natural, additive follow-up on top of this same hook; deferred until
  an extension exists.)
- **No engine mutation API.** The hook never lets a tool poke values or force runs.
- **Events / router / forms inspectors** are *deferred*, not designed-out: each is a
  view built on an existing package's **public** API (e.g. a router's current route,
  a form's state) layered onto the same panel. They add no new core surface, so they
  can land later without another RFC. Recorded as deferred to keep 0.1.0 minimal.

## 5. Alternatives considered

- **A global hook installed on import** (React's `__REACT_DEVTOOLS_GLOBAL_HOOK__`
  shape). Convenient for a separate-context extension, but it's an import side effect
  and a standing global — against Zoijs's "no side effects / nothing in production"
  stance. Chose explicit `attachInspector`; a global bridge can be added later *for*
  an extension without changing the engine.
- **Instrumenting reads** to capture edges as they form. Precise, but it taxes the
  single hottest path in the framework for a dev-only feature. Rejected; reading the
  edge Sets on demand is free and just as accurate.
- **A userland wrapper** around `createState`/`effect`. Can't see the renderer's
  internal binding effects or disposal, and would force apps to import wrapped
  primitives. Rejected.
- **Putting the panel in the core.** Bloats the shipped core with UI for a dev tool.
  Rejected — the core gets only the tiny hook; the UI is an optional package.

## 6. Drawbacks

- A few `if (!inspector) return` guards now sit at the engine's lifecycle points.
  Mitigated: they're at create/run/write/dispose (not reads), branch-predict trivially
  when null, and added ~1.4 KB gzipped to the core (well within the 16 KB budget).
- A new subpath is a (small) widening of what the core package exports. Mitigated: it's
  explicitly dev-tooling, documented as not part of the stable API, and the main entry
  is untouched.

## 7. Decision

**Accepted for `@zoijs/core` 1.4.0** (additive MINOR — one dev-only subpath, no change
to the nine-function surface) and **`@zoijs/devtools` 0.1.0**. On acceptance: add the
hook + instrumentation + types + tests to the core; ship the package (model + panel)
with tests and docs; add a devtools page to the site and list it in the ecosystem.
Events/router/forms inspectors and an extension bridge are deferred follow-ups on the
same hook.
