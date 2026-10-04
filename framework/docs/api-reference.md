# API Reference

The entire public API — nine functions (five you'll use constantly, plus `effect`, `boundary`, `configure`, and `onCleanup`).

```js
import { html, mount, createState, computed, each, effect, boundary, configure, onCleanup } from "./src/index.js";
```

---

## `html`

```
html(strings, ...values) → TemplateResult
```

A tagged template. Write real HTML; interpolate values with `${}`.

- `${() => x}` — a **live** binding (text or attribute) that updates when `x`'s sources change.
- `${value}` — a **static** value, inserted once.
- `onevent=${fn}` — an event listener.
- `${() => cond ? Component : null}` — a live binding may return a component **uncalled** (or `() => Component(props)`); Zoijs calls it once, untracked, and disposes it when the binding returns something else. See [FAQ: showing a component conditionally](faq.md#showing-a-component-conditionally).
- Returns an opaque `TemplateResult` — pass it to `mount`, return it from a component, place it in another template, or use it in `each`'s render function.

A sole-child `${}` in `<textarea>` or `<title>` binds the element's content — `html\`<textarea>${text}</textarea>\``, `html\`<title>${pageTitle}</title>\`` (reactive when the value is a function). It must be the *only* content (no surrounding text).

**Unsupported (throws a clear error):** dynamic tag names (`<${tag}>`), dynamic/spread attribute names (`<el ${x}>`), interpolation inside `<script>` or `<style>` (an injection surface), text mixed with `${}` inside `<textarea>/<title>`, and interpolation inside HTML comments.

---

## `mount`

```
mount(component, target) → unmount()
```

Renders a component (or a `TemplateResult`) into the DOM and starts it.

- `component` — a function returning `html`, or a `TemplateResult` directly.
- `target` — a DOM `Element` or a CSS selector string.
- Returns an **`unmount()`** function that detaches the DOM and disposes all reactivity. See [Cleanup](concepts/cleanup.md).

---

## `createState`

```
createState(initialValue) → { get, set, peek }
```

A reactive value. See [State](concepts/state.md).

| Method | Description |
|---|---|
| `get()` | Read; subscribes the current binding. |
| `set(next)` | Write; updates dependents if the value changed (`Object.is`). |
| `peek()` | Read without subscribing. |

---

## `computed`

```
computed(fn) → { get, peek }
```

A lazy, cached, value-gated derived value. See [Computed](concepts/computed.md).

| Method | Description |
|---|---|
| `get()` | Read; recomputes only if a dependency changed. |
| `peek()` | Read without subscribing. |

Read-only — there is no `set`.

---

## `effect`

```
effect(fn) → { dispose }
```

Run a side effect that re-runs whenever a reactive value it reads changes (auto-tracked, microtask-batched). Runs once immediately. `fn` may return a cleanup that runs **before the next run** and **on dispose** (same convention as a `ref`). Auto-disposes with its owner (component / list item); the returned `dispose()` tears it down early. See [RFC 0003](rfcs/0003-effect-and-svg.md).

- Use it for side effects **outside** the view — persist on change, sync `document.title`, drive a non-Zoijs widget.
- For reactive content **on screen**, use a binding (`${() => …}`), not an effect.

```js
const stop = effect(() => localStorage.setItem("theme", theme.get()));
effect(() => {
  const id = setInterval(() => poll(query.get()), 1000);
  return () => clearInterval(id); // runs before the next run and on dispose
});
```

---

## `each`

```
each(items, keyFn, renderFn) → EachResult
```

Keyed list rendering. Place the result in a template's child position. See [Lists](concepts/lists.md).

- `items` — `() => array` (reactive) or a plain `array`.
- `keyFn` — `(item) => key` — a stable, unique key per item.
- `renderFn` — `(item) => TemplateResult` — the template for one item.

---

## `boundary`

```
boundary(child, fallback) → child's result, or fallback's
```

Render `child`; if it **throws synchronously while building its markup** (a setup/render error that would otherwise break the whole `mount`), tear down the partial work and render `fallback` instead. Place it in a template slot. See [RFC 0004](rfcs/0004-error-boundary.md).

- `child` — a component (or value) to render.
- `fallback` — a value, or `(error) => value`, shown if `child` throws.
- Catches synchronous setup/render throws only; reactive-update errors are already contained per binding, and async errors belong to `@zoijs/resource` / `@zoijs/action`.

```js
html`<section>${boundary(() => RiskyWidget(), (err) => html`<p>Couldn't load.</p>`)}</section>`
```

---

## `configure`

```
configure({ dev?, onError? }) → void
```

Toggle development mode (warnings, the devtools hook). The starting value depends on the entry: `true` for `@zoijs/core`, `false` for `@zoijs/core/prod` (and for bundlers' production builds). One setting per page, shared by every loaded copy of the core. See [Production mode](concepts/production-mode.md).


### Error monitoring: `configure({ onError })`

```js
configure({
  onError(error, info) {
    monitoring.capture(error, info); // Sentry, Datadog, OpenTelemetry, your own logger…
  },
});
```

Zoijs keeps a page running when part of it fails — a binding that throws keeps the rest
of the UI working, a `boundary` shows its fallback, a failed `resource` shows its
`error()`. `onError` lets you **observe** those contained failures. It receives the
**original** thrown value (not wrapped) and `info`:

| `info.kind` | What failed |
|---|---|
| `"binding"` | a `${() => …}` text/attribute/list binding |
| `"effect"` | an `effect()` body |
| `"computed"` | a `computed()` derivation (it keeps its previous value) |
| `"cleanup"` | an `onCleanup` handler or an effect's returned cleanup |
| `"boundary"` | a `boundary` child's setup (`info.component` is the child function's name, when it has one) |
| `"resource"` / `"action"` | a `@zoijs/resource` fetch / `@zoijs/action` run that became its `error()` |

- Each failure is reported **once**, by the layer that contained it.
- Errors that already **escape** (a component throwing outside any `boundary`, `html([…])`,
  event handlers, server rendering) still escape and are not reported.
- It works in **production mode** too. Existing console logging is unchanged.
- It's **one hook per page**, shared by every loaded copy of the core; the last
  `configure({ onError })` wins. `configure({ onError: null })` removes it; other
  `configure` calls leave it alone.
- If the hook itself throws, Zoijs logs that and carries on — it never calls the hook
  for its own failure.

> **Privacy:** errors and their messages can contain application or user data. Scrub
> anything sensitive before sending it to an external monitoring service.

---

## `onCleanup`

```
onCleanup(fn) → void
```

Register a teardown function for the current component or list item. It runs when that component is unmounted or that list item is removed. Use it for timers, subscriptions, or third-party widgets you create during setup. See [Cleanup](concepts/cleanup.md).

```js
const id = setInterval(tick, 1000);
onCleanup(() => clearInterval(id));
```

---

## `unsafeHTML` (`@zoijs/core/unsafe`)

```
import { unsafeHTML } from "@zoijs/core/unsafe";
unsafeHTML(value: string | TrustedHTML) → UnsafeHTMLResult
```

Not part of the main entry. Renders `value` as **raw markup** in a content position —
`` html`<article>${unsafeHTML(trusted)}</article>` `` or reactively `${() => unsafeHTML(src.get())}`.
**It bypasses escaping and does not sanitize**: only pass content you have independently
established as trusted; untrusted HTML goes through [`@zoijs/sanitize`](../../sanitize/README.md).

- Accepts a string or a genuine `TrustedHTML` (checked with `trustedTypes.isHTML`); anything else
  throws a `TypeError`. Under enforced Trusted Types, a string is refused when inserted.
- Content positions only: in an attribute (including `href`, `style`, `on*`, `ref`) or
  `<textarea>`/`<title>` content it throws; the result can't be converted to a string.
- Development mode warns once that a string bypasses escaping; production doesn't.
- Rendered by `@zoijs/ssr` as unescaped output.
- No build step: add an exact, integrity-pinned `"@zoijs/core/unsafe"` entry to your import map only
  when you use it (`node scripts/cdn-importmap.mjs @zoijs/core@<version> --unsafe`).
- *(Next release — not in 1.8.0.)* See [Security](security.md#unsafehtml--the-one-escape-hatch).

---

## TypeScript

Type definitions ship in [`src/index.d.ts`](../src/index.d.ts); editors discover them automatically.

```ts
const count = createState(0);          // State<number>
const name = createState<string>("");  // explicit
const full = computed(() => name.get()); // Computed<string>

interface Todo { id: number; text: string; done: boolean; }
const todos = createState<Todo[]>([]);
each(() => todos.get(), (t) => t.id, (t) => html`<li>${() => t.text}</li>`); // t: Todo
```

Type-check your code with `tsc --noEmit` — no framework build step. Run the framework's own type tests with `npm run test:types`.
