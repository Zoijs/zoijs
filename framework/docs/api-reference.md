# API Reference

The entire public API — seven functions (five you'll use constantly, plus `configure` and `onCleanup`).

```js
import { html, mount, createState, computed, each, configure, onCleanup } from "./src/index.js";
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
- Returns an opaque `TemplateResult` — pass it to `mount`, return it from a component, place it in another template, or use it in `each`'s render function.

**Unsupported (throws a clear error):** dynamic tag names (`<${tag}>`), dynamic/spread attribute names (`<el ${x}>`), interpolation inside `<script>/<style>/<textarea>/<title>` or HTML comments.

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

## `each`

```
each(items, keyFn, renderFn) → EachResult
```

Keyed list rendering. Place the result in a template's child position. See [Lists](concepts/lists.md).

- `items` — `() => array` (reactive) or a plain `array`.
- `keyFn` — `(item) => key` — a stable, unique key per item.
- `renderFn` — `(item) => TemplateResult` — the template for one item.

---

## `configure`

```
configure({ dev }) → void
```

Toggle development warnings. `dev` defaults to `true`. See [Production mode](concepts/production-mode.md).

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
