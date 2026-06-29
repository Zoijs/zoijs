<div align="center">

<img src="assets/icon-512.png" alt="Zoijs" width="128" height="128" />

# Zoijs

**A frontend framework you don't have to learn before you use it.**

Plain HTML, CSS, and JavaScript — no JSX, no build step, no Virtual DOM, and a seven-function API.

[![npm](https://img.shields.io/npm/v/@zoijs/core.svg)](https://www.npmjs.com/package/@zoijs/core)
[![CI](https://github.com/Zoijs/zoijs/actions/workflows/ci.yml/badge.svg)](https://github.com/Zoijs/zoijs/actions/workflows/ci.yml)
[![minzip](https://img.shields.io/bundlephobia/minzip/@zoijs/core)](https://bundlephobia.com/package/@zoijs/core)
[![license](https://img.shields.io/npm/l/@zoijs/core.svg)](LICENSE)

[Documentation](https://zoijs.dev) · [npm](https://www.npmjs.com/package/@zoijs/core) · [Examples](framework/examples)

</div>

---

## What is Zoijs?

Zoijs is a small, fast, **build-step-free** framework for modern single-page apps. You write real HTML in tagged templates, keep state in plain reactive values, and `mount` a component — that's the whole mental model. Updates are **fine-grained**: when state changes, only the exact text node or attribute that depends on it updates. No re-rendering, no reconciliation of a virtual tree.

If you know HTML, CSS, and JavaScript, you already know most of Zoijs.

```js
import { html, mount, createState } from "@zoijs/core";

function Counter() {
  const count = createState(0);

  return html`
    <button onclick=${() => count.set(count.get() + 1)}>
      Clicked ${() => count.get()} times
    </button>
  `;
}

mount(Counter, "#app");
```

That's a complete, working app. No bundler, no JSX, no config.

## Why Zoijs?

- 🚫 **No build step** — a `<script type="module">` is the whole toolchain.
- ✍️ **No JSX** — write real HTML in template literals.
- ⚡ **No Virtual DOM** — fine-grained, direct DOM updates; cost scales with what changed, not app size.
- 🤏 **Tiny API** — seven functions, learnable in ~30 minutes.
- 🔒 **Secure by default** — inert text, URL-scheme guards, no `eval`, CSP- and Trusted-Types-friendly.
- 🧩 **Plain web skills** — native events, native CSS, native DOM. Nothing bespoke to memorize.
- 🧪 **Battle-tested** — 100+ unit tests, real-browser tests on Chromium/Firefox/WebKit, and TypeScript definitions.

## Install

The fastest start is the scaffolder — it creates a named, ready-to-run app (no build step):

```bash
npm create zoijs@latest my-app
```

Or add the core package to an existing project:

```bash
npm install @zoijs/core
```

Or with zero install, straight from a CDN:

```js
import { html, mount, createState } from "https://esm.sh/@zoijs/core@1";
```

See the [Installation guide](framework/docs/installation.md) for import-map and vendoring options.

## The one rule to learn

Wrap a value in an **arrow function** to make it live:

```js
${() => count.get()}   // ✅ live — updates when count changes
${count.get()}         // ⚠️ static — rendered once, never updates
```

Components run **once**; there is no re-render. The `() =>` is how Zoijs knows a binding should react. That's the single most important concept — the [Core Concepts](framework/docs/concepts/core-concepts.md) page explains why.

## A little more

```js
import { html, mount, each, computed, createState } from "@zoijs/core";

function Todos() {
  const todos = createState([{ id: 1, text: "Learn Zoijs", done: false }]);
  const left = computed(() => todos.get().filter((t) => !t.done).length);

  const toggle = (id) =>
    todos.set(todos.get().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  return html`
    <ul>
      ${each(
        () => todos.get(),
        (t) => t.id,
        (t) => html`
          <li class=${() => (t.done ? "done" : "")}>
            <input type="checkbox" checked=${() => t.done} onchange=${() => toggle(t.id)} />
            <span>${() => t.text}</span>
          </li>`
      )}
    </ul>
    <p>${() => left.get()} left</p>
  `;
}

mount(Todos, "#app");
```

- **`computed`** derives values lazily and caches them (and won't wake the DOM if the result is unchanged).
- **`each`** is keyed: reorders *move* DOM nodes instead of rebuilding them, preserving focus, input values, and scroll.

## The whole API

```js
import { html, mount, createState, computed, each, configure, onCleanup } from "@zoijs/core";
```

| Function | Purpose |
|---|---|
| `html` | Tagged-template renderer (real HTML, parsed once) |
| `mount(component, target)` | Render a component; returns `unmount()` |
| `createState(value)` | A reactive value — `get` / `set` / `peek` |
| `computed(fn)` | A lazy, cached, value-gated derived value |
| `each(items, keyFn, renderFn)` | Keyed list rendering |
| `configure({ dev })` | Toggle development warnings |
| `onCleanup(fn)` | Teardown for a component or list item |

Full details in the **[API Reference](framework/docs/api-reference.md)**.

## Documentation

Start at **[zoijs.dev](https://zoijs.dev)** — or browse the docs in this repo:

- [Installation](framework/docs/installation.md) · [Your First App](framework/docs/first-app.md) · [Core Concepts](framework/docs/concepts/core-concepts.md)
- Concepts: [State](framework/docs/concepts/state.md) · [Computed](framework/docs/concepts/computed.md) · [Bindings](framework/docs/concepts/bindings.md) · [Events](framework/docs/concepts/events.md) · [Lists](framework/docs/concepts/lists.md) · [Cleanup](framework/docs/concepts/cleanup.md)
- [Tutorials](framework/docs/README.md#tutorials-build-something) · [API Reference](framework/docs/api-reference.md) · [Security](framework/docs/security.md) · [Troubleshooting](framework/docs/troubleshooting.md) · [FAQ](framework/docs/faq.md)
- Going to production: [Ecosystem guide](framework/docs/ecosystem.md) · [Deployment](framework/docs/deployment.md) · [Deploy to GitHub Pages (recipe)](framework/docs/recipes/deploy-task-board-github-pages.md) · [Task Board example](examples/task-board)
- Coming from another framework? [React](framework/docs/migration/from-react.md) · [Vue](framework/docs/migration/from-vue.md) · [Solid](framework/docs/migration/from-solid.md) · [Lit](framework/docs/migration/from-lit.md) · [vanilla JS](framework/docs/migration/from-vanilla.md)

## Examples

Runnable, no-build example apps live in [`framework/examples/`](framework/examples):

```bash
cd framework
npm run dev
# open http://localhost:3000/examples/counter/   (keep the trailing slash)
```

`counter` · `input` · `todo` · `computed` · `reorder` · `input-preservation` · `benchmark`

## Browser support

Modern evergreen browsers — verified automatically on **Chromium, Firefox, and WebKit**.

| Browser | Minimum |
|---|---|
| Chrome / Edge | 86+ |
| Firefox | 78+ |
| Safari | 14+ |

No IE, no transpilation, no polyfills. Relies on baseline platform APIs (ES modules, `<template>`, `Proxy`, `TreeWalker`, `queueMicrotask`, `replaceChildren`).

## Ecosystem

The core has no router, store, or SSR — those are **optional** packages you add only if you need them. The core stays small.

| Package | What it is |
|---|---|
| [`@zoijs/core`](framework) | The framework (this package) |
| [`@zoijs/router`](router) | A tiny client-side router for SPAs — routes are a plain object, links are plain anchors. SSR-safe. |
| [`@zoijs/resource`](resource) | The simplest async-data helper — reactive `loading` / `data` / `error` / `refresh`, plus a server `{ initial }` hand-off. |
| [`@zoijs/head`](head) | Set the document title and meta description from a component (restore-on-cleanup). SSR-safe. |
| [`@zoijs/action`](action) | The write-side companion to resource — reactive `pending` / `error` / `done` for submits, saves, deletes. |
| [`@zoijs/storage`](storage) | A localStorage-backed reactive value — a drop-in, persistent `createState` for themes, drafts, and preferences. |
| [`@zoijs/forms`](forms) | A native-forms-first helper — reactive values, errors, and touched state, plus tiny validation. Pairs with `@zoijs/action`. |
| [`@zoijs/i18n`](i18n) | A reactive locale — message lookup with plurals (`Intl.PluralRules`) and `Intl` number/date/list formatting. |
| [`@zoijs/ssr`](ssr) | Render a component to an HTML string + in-place hydration (SSR / static prerender) + `serialize` for server→client data. No DOM, no deps. |
| [`@zoijs/testing`](testing) | First-party DOM testing helpers — `render`, role/text/label queries, `fireEvent`, `waitFor`, a `mockRouter`. |
| [`@zoijs/devtools`](devtools) | A dev-only reactive-graph inspector — every state, computed, and effect, and the DOM node each binding updates. |
| [`@zoijs/eslint-plugin`](eslint-plugin) | A lint rule that enforces Zoijs's reactive-binding rule (auto-fixable). Dev-only, zero deps. |

Install only the ones you need — each runtime package peer-depends on `@zoijs/core`:

```bash
npm install @zoijs/core @zoijs/router @zoijs/resource @zoijs/head   # e.g. a typical SPA
npm install -D @zoijs/eslint-plugin                                  # dev-only tools
```

See them work together in the **[Task Board demo](examples/task-board)** and the larger **[Admin Dashboard](examples/admin)** / **[Contacts CRM](examples/contacts)** apps, and read the **[ecosystem guide](framework/docs/ecosystem.md)** for how they fit and why each is optional.

## Project status

Zoijs is **`1.0`** with a **frozen public API** ([versioning policy](framework/VERSIONING.md)). It's intentionally small: routing, SSR, and a forms/data layer are **not** in the core — they're optional packages you add only if you need them (see the [roadmap](framework/ROADMAP.md)). It's a great fit for SPAs, internal tools, dashboards, prototypes, and teaching; for SEO-critical or content-heavy sites, [`@zoijs/ssr`](ssr) adds server-side rendering and static prerendering with in-place hydration.

## Founder

Zoijs was created by Jeremiah O.

The project began with a simple idea: modern frontend development should build on the web platform instead of replacing it. Rather than introducing proprietary syntax, mandatory build pipelines, or a Virtual DOM, Zoijs embraces standard HTML, CSS, and JavaScript while providing fine-grained reactivity, excellent performance, and an intentionally small API.

As the founder and lead architect, Jeremiah continues to guide the framework's technical direction, public API, long-term roadmap, documentation, and overall vision. Zoijs is developed as an open-source project, and contributions from the community are welcome.

## Project Leadership

### Founder & Lead Maintainer

**Jeremiah O**

Responsible for:

* Framework architecture
* Public API design
* Performance engineering
* Security architecture
* Documentation
* Release management
* Long-term roadmap

### Contributors

Zoijs is an open-source project that welcomes contributions from developers around the world. Every contribution—whether code, documentation, testing, bug reports, or ideas—helps improve the framework.

See the GitHub Contributors page to recognize everyone who has helped build Zoijs.

## Repository structure

This is a monorepo. The framework package lives in [`framework/`](framework):

```
framework/        @zoijs/core — the framework
  src/            runtime (no dependencies, no build)
  docs/           the documentation site
  examples/       runnable example apps
  tests/          unit/DOM tests (jsdom)
  browser-tests/  Playwright specs (real browsers)
router/           @zoijs/router — optional tiny router (same layout)
resource/         @zoijs/resource — optional async-data helper (same layout)
head/             @zoijs/head — optional title/meta helper (same layout)
action/           @zoijs/action — optional write/mutation helper (same layout)
storage/          @zoijs/storage — optional localStorage persistence helper (same layout)
forms/            @zoijs/forms — optional native-forms helper (same layout)
i18n/             @zoijs/i18n — optional reactive i18n (same layout)
ssr/              @zoijs/ssr — optional server rendering + hydration (same layout)
testing/          @zoijs/testing — optional DOM testing helpers (same layout)
devtools/         @zoijs/devtools — optional reactive-graph inspector (same layout)
eslint-plugin/    @zoijs/eslint-plugin — optional lint rule (dev-only, zero deps)
create/           create-zoijs — the starter CLI (npm create zoijs@latest)
examples/
  task-board/     ecosystem demo — one app using several packages
  admin/          flagship dashboard demo
  contacts/       CRM demo
```

The official documentation website ([zoijs.dev](https://zoijs.dev)) is maintained in a separate repository.

## Contributing

Contributions that keep Zoijs small, clear, and beginner-friendly are very welcome. The API is frozen, so additions go through a short RFC. Start with **[PHILOSOPHY](framework/PHILOSOPHY.md)** (why Zoijs leaves things out, and the Rule of Three every feature must pass), then **[CONTRIBUTING](framework/CONTRIBUTING.md)** and the [Code of Conduct](framework/CODE_OF_CONDUCT.md).

Each package is self-contained (its own `package.json`, no workspaces). Work in one with the usual commands:

```bash
cd framework        # or any package directory: router, resource, head, action, storage, forms, i18n, ssr, testing, devtools, eslint-plugin
npm install
npm test            # unit + DOM tests (jsdom)
npm run test:types  # TypeScript checks
npm run test:browser # real browsers (Playwright)
```

Or from the **repository root**, run every package's suite at once:

```bash
npm run install:all  # install dev deps in every package (first time)
npm test             # all unit suites (core + every optional package) + gates
npm run test:types   # all TypeScript checks
npm run test:browser # all Playwright suites + the Task Board demo
```

## Security

Zoijs is secure by default. To report a vulnerability, please follow the [Security Policy](framework/SECURITY.md) (do not open public issues for vulnerabilities).

## License

[MIT](LICENSE) © Zoijs contributors
