# Easy — Phase 1 MVP Specification

> **Easy** is a component-oriented frontend framework for modern single-page apps that runs with no mandatory build step, uses only concepts developers already know from HTML, CSS, and JavaScript, and is secure, fast, and stable by default.

This document consolidates the framework's identity, architecture, rendering engine, reactivity model, security rules, and scoped MVP into a single Phase 1 reference.

**The core bet:** *parse static structure once with the browser's own parser, attach a small fixed set of bindings to the exact dynamic points, and from then on mutate only those points — directly, minimally, and safely.* No Virtual DOM. Minimal runtime. Fine-grained updates.

---

## Table of Contents

1. [Framework Mission](#1-framework-mission)
2. [Target Users](#2-target-users)
3. [Core Design Principles](#3-core-design-principles)
4. [Non-Goals](#4-non-goals)
5. [Architecture Overview](#5-architecture-overview)
6. [Renderer Design](#6-renderer-design)
7. [Reactivity Design](#7-reactivity-design)
8. [Security Rules](#8-security-rules)
9. [MVP Feature List](#9-mvp-feature-list)
10. [Folder Structure](#10-folder-structure)
11. [Success Criteria](#11-success-criteria)

---

## 1. Framework Mission

### Mission Statement
**To make building modern web applications feel as approachable as writing plain HTML, CSS, and JavaScript — so that any developer, on day one, can ship real, production-grade software without first learning a framework.**

Easy exists to remove the tax between *knowing the web platform* and *being productive with it*. The framework should disappear into the skills developers already have.

### Vision Statement
**A web where the gap between "I know JavaScript" and "I shipped a maintainable single-page app" is measured in hours, not months — and where the framework you reach for adds power without adding a new language, a new mental model, or a mandatory toolchain.**

### Competitive Positioning
> *Easy is the framework you don't have to learn before you use it — platform-native, build-optional, and secure by default.*

| Framework | Where they tax the developer | Easy's counter-position |
|---|---|---|
| **React** | JSX + build step, hooks complexity, frequent paradigm shifts | React's reach without React's ceremony — no JSX, no hooks rules, no build |
| **Vue** | `.vue` files need a build; reactivity gotchas | Vue's friendliness, no build step, smaller API |
| **Angular** | Steep curve; TS+RxJS+DI+CLI mandatory; heavy | Structure without the weight — productive in an afternoon |
| **SolidJS** | Signals are subtle; JSX + build step | Solid-class performance with a model juniors grasp, no compiler |
| **Lit** | Lower-level; component layer only | Lit's standards alignment, but a complete app-ready experience |

**Strategic whitespace:** the under-served corner of *immediately approachable* **and** *no mandatory build* **and** *serious performance/security*.

---

## 2. Target Users

**Primary — Junior & learning developers.** Bootcamp grads, CS students, self-taught coders who know vanilla JS/HTML/CSS and want to build SPAs without a multi-week framework detour. Success: shipping something real in the first afternoon.

**Secondary — Small teams, solo builders, indie hackers.** People shipping MVPs, internal tools, and dashboards who value velocity and low maintenance over ecosystem maximalism. They want fewer moving parts.

**Tertiary — Educators & simplicity-focused teams.** Instructors who need a teachable framework, and engineering teams with mixed-seniority staff who want code any member can read and maintain.

**Influencer audience — Senior developers who value the platform.** Not the core target, but critical advocates — engineers tired of framework churn who will champion Easy if it proves serious about performance, security, and longevity.

---

## 3. Core Design Principles

1. **Use the platform, don't replace it.** Lean on DOM, Custom Elements, CSS, Fetch, History API, ESM. Every concept maps to something on MDN.
2. **Zero required build step.** Easy must run from a single `<script type="module">`. Tooling is optional enhancement, never an entry barrier.
3. **One obvious way to do things.** Convention beats configuration; clarity beats cleverness.
4. **Concepts you already know.** Components are functions returning markup. State is plain values. Events are DOM events.
5. **Secure by default.** Auto-escaping, safe bindings, CSP-friendly output, no `eval`. Danger is opt-in, never opt-out.
6. **Debuggable with native tools.** Real stack traces, readable DOM, plain-value inspection.
7. **Small core, explicit extensions.** Routing, state, forms ship as small, optional, tree-shakeable modules.
8. **Progressive disclosure.** A beginner uses 10% of the API and is fully productive.
9. **Performance as a default, not a project.** Fine-grained updates make apps fast without the developer becoming a performance engineer.
10. **Stability as a feature.** Backward compatibility and slow, deliberate API change are explicit promises.

**The one architectural through-line:** *move complexity into the framework's small core (dependency tracking, list reconciliation, security) so it stays out of every application a developer writes.*

---

## 4. Non-Goals

Easy deliberately will **not**:

- **Require or invent a JSX-like language.** Markup stays HTML or template literals.
- **Ship a hook system** with rules-of-call, dependency arrays, or stale-closure footguns.
- **Expose a large lifecycle API.** At most: mount / update / unmount.
- **Mandate a compiler or bundler.** No feature may depend on a build step.
- **Pursue meta-framework scope at MVP** (SSR, RSC, edge, file-based routing). Optional later layers, never the identity.
- **Chase feature parity** with React/Angular. Approachability over breadth.
- **Be a state-management philosophy.** Simple default; gets out of the way.
- **Support every legacy browser.** Modern evergreen browsers only.

A clear non-goals list is itself a feature: it protects the simplicity promise from scope creep.

---

## 5. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        DEVELOPER SURFACE                           │
│   HTML templates  ·  CSS (scoped/native)  ·  plain JS components   │
└───────────────────────────────┬──────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                         EASY CORE RUNTIME                          │
│  ┌────────────┐   ┌─────────────┐   ┌──────────────────────────┐  │
│  │ Reactivity │──▶│  Component   │──▶│   Template Binder        │  │
│  │  (Signals) │   │  Registry &  │   │  (parse once → bind once)│  │
│  └─────┬──────┘   │  Lifecycle   │   └────────────┬─────────────┘  │
│        │          └──────┬───────┘                │                │
│        ▼                 ▼                        ▼                │
│  ┌────────────┐   ┌─────────────┐   ┌──────────────────────────┐  │
│  │ Dependency │   │ Event System │   │  Fine-Grained DOM Patch  │  │
│  │  Tracker   │   │ (native)     │   │  (direct node updates)   │  │
│  └────────────┘   └─────────────┘   └──────────────────────────┘  │
│  ┌──────────────── Security Layer (default-on) ─────────────────┐  │
│  │  auto-escaping · safe bindings · CSP-friendly · no eval      │  │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬──────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│              OPTIONAL MODULE LAYER (opt-in, tree-shakeable)       │
│      Router  ·  Store  ·  Forms  ·  Devtools  ·  SSR (future)     │
└───────────────────────────────┬──────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                  NATIVE WEB PLATFORM (the real engine)            │
│     DOM · Custom Elements · CSS · Fetch · History API · ESM       │
└──────────────────────────────────────────────────────────────────┘
```

The developer writes near-vanilla code at the top; the core runtime is a thin reactive coordination layer; optional modules bolt on; the browser does the heavy lifting at the bottom. The runtime **coordinates** the platform rather than abstracting it away.

**Component lifecycle — deliberately tiny:**

| Phase | Fires | Purpose |
|---|---|---|
| **setup** | once, on creation | declare state, derive values, define handlers |
| **mounted** | once, after DOM insertion | measurements, focus, 3rd-party init |
| **cleanup** | once, on removal | dispose subscriptions, timers, listeners |

There is **no per-update lifecycle hook** — fine-grained reactivity makes "component updated" meaningless. This removes the single biggest source of framework confusion (dependency arrays, stale closures, re-render reasoning).

**Build philosophy:** No build step required, ever. An optional build can later pre-parse templates, scope CSS, minify, and tree-shake — but it can never be a prerequisite for any feature. Because the no-build runtime already produces "parse-once" artifacts, the optional compiler simply *precomputes* them — a backward-compatible upgrade path.

**Plugin philosophy:** Small, capability-scoped extension seams (component registration, directive-like bindings, lifecycle taps, store middleware) over a monolithic plugin context. Official modules use the same public seams — dogfooding the model.

---

## 6. Renderer Design

The rendering engine turns author-written HTML templates into live, surgically-updatable DOM with **no Virtual DOM and no diffing**. Governing idea: **parse once → bind once → react forever.**

### Vocabulary
- **Template** — the static HTML the author writes, with marked dynamic placeholders.
- **Binding / Part** — one dynamic point (text slot, attribute, event, or child-list region) and the runtime object that updates its specific node.
- **Blueprint** — cached static fragment + map of binding locations, produced once per template.
- **Instance** — one live clone of a blueprint plus its wired Parts.

### Pipeline
```
Template (HTML / <template>)
   │  1. PARSE  (once, via native <template>; cached as Blueprint)
   ▼
Static fragment + list of dynamic-slot descriptors
   │  2. CLONE  (per instance — native cloneNode, fast)
   ▼
Live DOM nodes
   │  3. BIND   (attach a Part to each dynamic slot; subscribe to its source)
   ▼
Reactive bindings (text, attr, event, child-list)
   │  4. REACT  (only changed slots update, forever after)
   ▼
Direct DOM mutations on the exact affected nodes
```

### Subsystem strategies
- **Template parsing:** insert HTML into an inert native `<template>`, read `.content`, walk once to locate and classify markers, strip markers. Delegates correctness and parse-time safety to the browser's spec-compliant parser; ships no JS parser (tiny runtime).
- **Dynamic value binding:** each Part holds a **direct node reference** plus its binding type and subscription handle — updates need no querying or traversal.
- **Text updates:** assign to `Text.data` directly (cheapest DOM mutation), with last-value memoization to skip no-ops. Values render as **inert text** — the primary XSS defense.
- **Attribute updates:** binding kind (attribute / boolean / property / class / style) classified once at parse time. URL-bearing attributes scheme-validated; `on*` attributes rejected.
- **Event binding:** native `addEventListener` with handler **references** (never strings). Optional delegation for large lists (opt-in).
- **Component composition:** reference-passing inputs (no copying, no re-render), native Custom Events for child→parent, slotted content moved (not cloned). Parent disposal disposes children.
- **DOM patching:** signal change → microtask-batched queue of affected Parts → each Part mutates its own node. The **only** diffing is **keyed reconciliation local to a list region**; the surrounding tree is never touched.
- **Memory & cleanup:** each instance owns a disposal record (Parts, subscriptions, listeners, child instances, timers). Unmount tears down children-first, cancels subscriptions, removes listeners, fires `cleanup`, detaches DOM, nulls references. Idempotent (runs once).

**Why it's fast:** the expensive work (parse, locate dynamic parts) happens once and is cached; per-instance cost is a native clone plus a fixed number of Part hookups; per-update cost is proportional to *what changed*, independent of app size.

---

## 7. Reactivity Design

Reactivity is the one genuinely new concept Easy asks developers to learn, so the whole design optimizes for **a single mental model that scales from a counter to an enterprise app**.

### The entire public API: three primitives
| Primitive | What it is | Beginner sentence |
|---|---|---|
| **State** | a readable/writable reactive value | "a variable that remembers who's using it" |
| **Computed** | a derived value | "a value calculated from others, kept fresh automatically" |
| **Effect** | a reaction (DOM update / side effect) | "code that re-runs when the values it used change" |

### Design decisions
- **Reactive state:** explicit signal-like cells, **local by default**; shared state is the same primitive lifted into a module. Reading inside a tracking context subscribes; writing notifies. Updates are O(subscribers), not O(component) or O(app).
- **Change detection:** **push-on-write, equality-gated, batched.** A write that produces an equal value propagates nothing; a real change queues dependents for a microtask flush (coalescing multiple synchronous writes into one DOM update). Zero idle cost — no polling, no dirty-checking.
- **Dependency tracking:** **automatic dynamic tracking** via a "current observer" context — **no dependency arrays, ever.** Links are rebuilt each run, so dependencies are exactly what was read (including conditional branches), and a value no longer read auto-unsubscribes.
- **Computed:** **lazy, cached, auto-invalidated**, read-only. Unread computeds cost nothing; read-but-unchanged return cached values; glitch-free ordering prevents inconsistent intermediates.
- **Effects/watchers:** **one** primitive that auto-tracks and auto-cleans. "Watchers" are just effects that read specific values. Each run may register a cleanup that fires before the next run and on disposal. No stale closures (tracking is dynamic), no missing-dependency bugs.
- **Nested objects:** **shallow-reactive by default**; deep reactivity is opt-in and explicitly named. Keeps reactivity *visible* in the code — no spooky action at a distance.
- **Arrays:** **reference-replacement + explicit reactive operations**; lists render with **stable keys** so a changed row updates one row, not the list. No mutation-method proxying by default.
- **Component update flow:** **setup runs once; no component-level re-render.** "Updating" means the specific binding-Effects whose dependencies changed re-run — nothing else. This is the core divergence from React and the source of both performance and simplicity.
- **Memory cleanup:** **owner-scoped disposal** — every reactive node belongs to a component scope; disposal stops all owned Effects/Computeds, fires cleanups, severs links. The single developer rule: *"return a cleanup for anything you set up."*
- **Debugging:** first-class — plain-value inspection in native DevTools, named nodes, an optional dependency-graph view, update tracing, and cycle/runaway warnings (all dev-only, stripped in production).

### How it beats the alternatives
- **Simpler than React hooks** — no dependency arrays, no rules-of-hooks, no stale closures, no `useMemo`/`useCallback`, no re-render model.
- **Easier than Redux** — no actions, reducers, dispatchers, or immutability boilerplate; shared state is just a signal in a module.
- **Less surprising than advanced reactive systems** — shallow-by-default keeps the magic visible.

---

## 8. Security Rules

The architecture's structural advantage: **separating static template structure from dynamic values at parse time, defaulting to inert text rendering, and binding handlers as references rather than strings.** This eliminates most frontend attack surface *by construction*. Residual risk funnels through a few named seams.

### Secure defaults (shipped on, no config)
1. **Auto-escaping inert text** for all interpolations (`Text.data`, never `innerHTML`).
2. **URL-scheme allowlisting** on URL-bearing attributes (`href`, `src`, `action`, `formaction`, etc.); reject `javascript:`, dangerous `data:`, unknown schemes.
3. **Event-handler attributes (`on*`) blocked** through the attribute channel; events only via the reference-based API.
4. **Static attribute names only** — no data-derived attribute names by default.
5. **No runtime re-parsing of data as structure** — architecturally prohibited (the most important invariant).
6. **Prototype-pollution-safe store updates** — reject `__proto__` / `constructor` / `prototype`.
7. **CSP-friendly by default** — no `eval` / `new Function`, no injected inline handlers (Trusted-Types ready).
8. **Deterministic teardown** — listeners/subscriptions removed on unmount; no stale handlers fire post-unmount.

### Unsafe APIs requiring explicit, named opt-in
| Capability | Why dangerous | Opt-in shape |
|---|---|---|
| **Raw HTML insertion** | Full XSS / HTML injection | One scary-named, Trusted-Types-gated API; sanitizer mandated by docs; dev warning on untracked data |
| **Dynamic attribute name** | Can synthesize `on*` / URL attrs | Separate explicit API with allowlist |
| **Unvalidated URL binding** | `javascript:` / exfil URLs | Explicit "trusted URL" wrapper |
| **Raw style/CSS string** | CSS exfiltration | Explicit opt-in; prefer structured style bindings |
| **Disabling auto-escape** | Reintroduces XSS | Per-binding marker, never global |

**Principle:** there is exactly **one** way to insert raw HTML, it cannot be reached by accident, and it is the single auditable grep-target for security review.

### Risk matrix (top risks under default architecture)
| Risk | Severity | Likelihood (w/ defaults) | Mitigation |
|---|---|---|---|
| XSS via raw-HTML escape hatch | 🔴 Critical | 🟡 Medium | Single Trusted-Types-gated sink + mandatory sanitizer + dev warning |
| `javascript:`/malicious URL in attribute | 🔴 Critical | 🟡 Medium | Scheme allowlist at the URL sink |
| HTML injection via data re-parsed as structure | 🔴 Critical | 🟢 Low | Hard invariant: never parse data as structure |
| Event-handler attribute injection | 🔴 Critical | 🟢 Low | Reject `on*` via attribute channel; references only |
| Prototype pollution via store merge | 🟠 High | 🟡 Medium | Reject dangerous keys; null-prototype internal maps |
| Sensitive data in plain-value state/logs | 🟠 High | 🟡 Medium | Treat client state as observable; strip tracing in prod |
| Plugin bypasses core sinks | 🟠 High | 🟡 Medium | Plugin security contract; safe sinks only |
| SSR state-serialization injection (future) | 🟠 High | 🟡 Medium | Design now: context-safe JSON embedding + CSP nonces |
| Stale handlers after unmount | 🟡 Medium | 🟢 Low | Owner-scoped automatic cleanup |
| CSP weakened by `eval`/inline | 🟡 Medium | 🟢 Low | CI-enforced no-eval / no-inline invariant |

**The three things that most determine whether the promise holds:** (1) raw-HTML + URL-sink discipline, (2) the "no data as structure" invariant, (3) plugin & future-SSR governance.

---

## 9. MVP Feature List

**MVP thesis:** let a junior developer build a *real, routed, interactive SPA with no build step* and feel the core promise — "I already knew how to do this." A framework lives or dies on its first 30 minutes, not its feature checklist.

> **MVP in one sentence:** a `<script>`-loadable framework where you define components in plain JS with HTML templates, get reactive state via State/Computed/Effect, bind native events, render with safe-by-default direct DOM updates, and route between pages — with readable errors and real docs.

### 🔴 Must Have (no MVP without these)
| # | Feature | Risk | Adoption impact | Debt if skipped |
|---|---|---|---|---|
| M1 | Component model (plain JS + HTML template) | Med | Decisive | Low if blueprint model honored |
| M2 | Reactive core: State + Computed + Effect | Med-High | Decisive | **High** — foundation everything binds to |
| M3 | Renderer: parse-once + fine-grained direct DOM | Med-High | High | Med (keyed lists must be correct) |
| M4 | Native event binding | Low | High (free familiarity) | Low |
| M5 | Component composition (nesting, inputs, events) | Med | High | Med (cleanup linkage) |
| M6 | Secure-by-default rendering | Low-Med | Med direct / High reputation | **Catastrophic if deferred** |
| M7 | Deterministic lifecycle & cleanup | Med | Med ("doesn't leak") | High (late-surfacing leaks) |
| M8 | Zero-build execution (`<script type=module>`) | Low-Med | Decisive (the wedge) | Low (disciplines the codebase) |
| M9 | Readable errors + docs + 2–3 example apps | Low tech / High effort | Decisive | Docs drift |
| M10 | Basic client-side routing (flat, History API) | Low-Med | High (makes it a "real SPA") | Low if kept minimal |

*Two judgment calls pulled into Must Have: **routing (M10)** — the MVP must prove "real SPA," which needs navigation; and **docs + readable errors (M9)** — for a learnability-thesis framework, these are core product, not polish.*

### 🟠 Should Have (ship if core is solid; else fast-follow)
- **S1** Optional event delegation · **S2** Shared/global store module · **S3** Scoped CSS convention · **S4** The single gated raw-HTML escape hatch (Trusted-Types-ready) · **S5** Basic devtools (state/dependency inspection).

### 🟡 Nice to Have (deferred, no MVP cost)
- **N1** Optional build/compiler (AOT precompile, minify, tree-shake) · **N2** Forms module · **N3** Animation/transition helpers · **N4** Nested/lazy/guarded routing · **N5** CLI / scaffolding.

### 🔵 Future Versions (out of scope; protect focus)
- SSR / hydration / streaming · Meta-framework (file routing, data loaders, edge) · TypeScript-first APIs · Plugin ecosystem & marketplace · Concurrent/async rendering · i18n, a11y tooling, testing utilities.

### Overengineering watch-list
1. **Optional compiler (N1)** — undermines the zero-build wedge; hold the line.
2. **Routing scope creep** — ship flat routes; resist nested/guarded/lazy until demanded.
3. **SSR gravitational pull** — saying no for v1 is the single most important discipline decision.
4. **A CLI for a no-build framework** — near-contradictory at MVP.

**Spend senior time on M2 (reactivity), M3 (renderer), M6 (secure defaults)** — hardest and most expensive to fix later. **The two debts you must not take on:** insecure defaults and a sloppy reactivity/cleanup core.

---

## 10. Folder Structure

```
my-easy-app/
├── index.html                 # entry; <script type="module"> — no build needed
├── public/                    # static assets served as-is
│
├── src/
│   ├── main.js                # app bootstrap / mount root
│   │
│   ├── components/            # reusable UI components
│   │   ├── Button/
│   │   │   ├── Button.js      # component setup + template + handlers
│   │   │   └── Button.css     # co-located, scoped styles
│   │   └── Card/
│   │       ├── Card.js
│   │       └── Card.css
│   │
│   ├── pages/                 # route-level components
│   │   ├── Home.js
│   │   └── About.js
│   │
│   ├── state/                 # shared signals / store modules (optional)
│   │   └── userStore.js
│   │
│   ├── lib/                   # plain JS utilities (framework-agnostic)
│   │   └── format.js
│   │
│   ├── styles/                # global/base CSS, design tokens
│   │   └── global.css
│   │
│   └── router/                # route table (optional)
│       └── routes.js
│
├── tests/                     # component + unit tests
└── easy.config.js             # OPTIONAL — only if using the optional build
```

**Conventions:** co-locate each component's JS and CSS in its own folder (everything about a component lives together); keep `lib/` framework-agnostic so logic is portable and testable; treat `state/`, `router/`, and `easy.config.js` as opt-in — they simply don't exist in a minimal app. The structure grows **additively**, so a weekend project and an enterprise app share the same shape at different scales.

---

## 11. Success Criteria

### Learnability (the core promise)
- **Time-to-first-working-app for a newcomer: < 1 hour** (measured via guided tutorial + usability tests).
- High onboarding-tutorial completion rate; low drop-off.
- Survey agreement with *"I was productive without learning new concepts."*
- The count of concepts a developer must learn before shipping stays small (tracked as a product KPI).

### Adoption & retention
- Growing weekly active projects / downloads, trended (prioritize **retention over vanity spikes**).
- 30/90-day project retention — are people still using it months later?
- Net "would use again" / NPS; unsolicited community advocacy.

### Technical health (proving "serious")
- Core runtime bundle size held under a publicly-defended budget.
- Interaction-latency and update-cost benchmarks competitive with Solid/Vue.
- **Zero default-configuration XSS** in audits; secure-by-default verified.
- API stability: near-zero breaking changes per year.

### Ecosystem & longevity
- Growth of community modules/components.
- Number of educational programs / courses adopting Easy.
- Count of credible production / enterprise case studies.

### MVP launch gate (Phase 1 "done")
- ✅ M1–M10 implemented and dogfooded by building the example apps in-house.
- ✅ A junior can build a routed, interactive, multi-component SPA from `index.html` with no build step.
- ✅ Secure defaults verified by audit; no insecure default paths.
- ✅ Docs + readable errors written *against the real API*.
- ✅ No reliance on `eval`/inline (CI-enforced); CSP-strict recipe documented.

> **Guiding meta-metric:** *Does a developer who knows only vanilla web tech become productive faster with Easy than with any alternative?* Every metric above ultimately serves answering that question **"yes."**

---

*Easy — Phase 1 MVP Specification · Consolidated framework identity, architecture, and scope.*
