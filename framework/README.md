# Zoijs

A lightweight frontend framework you don't have to learn before you use it — **plain HTML, CSS, and JavaScript**, no JSX, no build step, no Virtual DOM.

**[Documentation](https://zoijs.dev)** · **[GitHub](https://github.com/Zoijs)** · **[npm](https://www.npmjs.com/package/@zoijs/core)**

```bash
npm install @zoijs/core
```

```js
import { html, mount, createState } from "@zoijs/core";

function Counter() {
  const count = createState(0);
  return html`<button onclick=${() => count.set(count.get() + 1)}>${() => count.get()}</button>`;
}
mount(Counter, "#app");
```

## 📚 Documentation

**New here? Start at [zoijs.dev](https://zoijs.dev) (or the [docs folder](docs/README.md)) — designed to get you productive in under 30 minutes.**

- [Installation](docs/installation.md) · [Your First App](docs/first-app.md) · [Core Concepts](docs/concepts/core-concepts.md)
- [Tutorials](docs/README.md#tutorials-build-something) · [API Reference](docs/api-reference.md) · [Examples](docs/examples.md)
- [Troubleshooting](docs/troubleshooting.md) · [FAQ](docs/faq.md) · [Migrating from React/Vue/Solid/Lit/vanilla](docs/README.md#coming-from-another-framework)

---

## Mission

Make building modern web applications feel as approachable as writing plain HTML, CSS, and JavaScript — so that any developer, on day one, can ship real software without first learning a framework.

The framework should disappear into the skills developers already have. The whole mental model is three verbs: **write a function that returns `html`, put `createState` values in it, `mount` it.**

## Goals

- **Beginner-friendly** — concepts you already know from vanilla JS/HTML/CSS.
- **No build step** — runs from a single `<script type="module">`.
- **No Virtual DOM** — fine-grained, direct DOM updates; only what changed is touched.
- **Minimal runtime** — the browser does the heavy lifting (native `<template>`, `cloneNode`, events).
- **Secure by default** — inert text rendering, URL-scheme guards, handler references (never strings), no `eval`.
- **Small & readable** — a junior developer can read the source.

See [`docs/Phase-1-MVP-Spec.md`](docs/Phase-1-MVP-Spec.md) for the full specification.

## Setup

No build step is required — the framework is plain ES modules.

```bash
# from the framework/ directory

# run the counter example (serves the project root over http so ES modules resolve)
npm run dev
# then open: http://localhost:7310/examples/counter/   (keep the trailing slash)

# run the tests (DOM tests run automatically via jsdom)
npm test
```

> Tips:
> - ES module imports need to be served over `http://`, not opened as a `file://` path. `npm run dev` handles that.
> - Use the **trailing slash** on the example URL (`/examples/counter/`). Without it, some static servers resolve `./app.js` against the wrong directory and the app won't load.

## Testing

| Command | What it runs |
|---|---|
| `npm test` | Unit + DOM tests via jsdom (fast, no browser) |
| `npm run test:unit` | Pure-logic tests only (no DOM) |
| `npm run test:types` | TypeScript type-checks (`tsc --noEmit`) |
| `npm run test:browser` | Real-browser tests in Chromium, Firefox, WebKit (Playwright) |

Browser tests live in `browser-tests/` and run the example apps plus framework regressions against real engines. First-time setup downloads the browsers:

```bash
npm install
npx playwright install chromium firefox webkit
npm run test:browser
```

Playwright starts a static server automatically (`npx serve` on port 7310) — still no build step.

## Browser support

Modern evergreen browsers. Verified automatically (Playwright) in:

| Browser | Engine | Status |
|---|---|---|
| Chrome / Edge | Chromium | ✅ tested |
| Firefox | Gecko | ✅ tested |
| Safari | WebKit | ✅ tested |

Relies on baseline-modern platform APIs: ES modules, `<template>`, `TreeWalker`, `Proxy`, `queueMicrotask`, `replaceChildren`, `addEventListener`, `setAttributeNS`. No IE support, no transpilation, no polyfills.

## Public API

The whole framework is **nine functions** — learnable in one sitting and frozen for 1.x:

```js
import {
  html, mount, each, boundary,
  createState, computed, effect,
  configure, onCleanup,
} from "@zoijs/core";
```

- `html` — tagged template; parsed once, cached.
- `mount(component, target)` — render a component; returns `unmount()`.
- `each(itemsFn, keyFn, renderFn)` — keyed list rendering (reuse / move / remove nodes).
- `boundary(child, fallback)` — render-time error boundary: if `child` throws while building its markup, dispose the partial work and render `fallback`.
- `createState(value)` — a reactive value (`get` / `set` / `peek`).
- `computed(fn)` — a lazy, cached, **value-gated** derived value (`get` / `peek`).
- `effect(fn)` — a side effect that re-runs when a value it reads changes; returns `{ dispose }` and may return a per-run cleanup.
- `configure({ dev })` — toggle development warnings (default `dev: true`).
- `onCleanup(fn)` — register teardown for a component or list item (timers, subscriptions).

Plus the **`ref`** binding (`html\`<input ref=${(el) => el.focus()} />\``) — no export; it's a template
attribute that hands you the rendered element.

**Devtools (dev-only).** A separate subpath, `@zoijs/core/devtools`, exposes a read-only inspection
hook — `attachInspector(inspector)` and `inspecting()` — that [`@zoijs/devtools`](https://www.npmjs.com/package/@zoijs/devtools)
(or a browser extension) uses to observe the reactive graph. It's off by default, never instruments
the hot read path, and is a no-op under `configure({ dev: false })`, so it costs production nothing and
leaves the nine-function main surface unchanged.

See the [Documentation site](https://zoijs.dev) for the full guide, tutorials, and API reference.

**TypeScript:** ships type definitions ([`src/index.d.ts`](src/index.d.ts)) for autocomplete and optional type-checking — JS-first, no build step required. `createState<T>`, `computed<T>`, and `each<T>` are generic. Type-check with `npm run test:types`.

## What's built

- Fine-grained text/attribute bindings — `${() => state.get()}` updates one node in place; setup runs once (no re-render).
- Native events, secure-by-default rendering (inert text, URL-scheme guards, no `eval`).
- `computed()` derived values — lazy, cached, nestable, and **value-gated** (unchanged results don't wake downstream).
- `effect()` side effects — re-run on change, with owner-scoped auto-disposal and a per-run cleanup.
- `boundary()` render-time error boundary — a failing subtree shows a fallback instead of breaking `mount`.
- `each()` keyed list reconciliation — minimal DOM moves; preserves focus / input / scroll on reorder.
- Microtask batching, push-pull dependency tracking, **owner-scoped cleanup** (unmount and removed items dispose their subscriptions).
- Production mode via `configure({ dev: false })` — no build step.
- Safety: self-triggering effects are warned + stopped; a throwing binding doesn't break others.

**Out of scope (by design):** router, CLI, plugins, SSR, global store, TypeScript-first setup, Virtual DOM.

## Project Structure

```
framework/
  package.json
  README.md
  src/
    core/
      html.js        # html() — parse template into a cached blueprint
      mount.js       # mount() — entry point; instantiate + attach + cleanup
      renderer.js    # internal: bind dynamic slots, apply fine-grained updates
    reactivity/
      state.js       # createState() + internal dependency tracking
    utils/
      dom.js         # small native-DOM helpers
      security.js    # escaping, URL-scheme allowlist, attribute-name guards
    index.js         # public entry — re-exports html, mount, createState
  examples/
    counter/         # the first working app
  tests/             # basic unit tests (node --test)
  docs/
    Phase-1-MVP-Spec.md
```

## License

MIT
