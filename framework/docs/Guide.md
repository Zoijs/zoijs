# Zoijs — Beginner's Guide

> 📖 **This single-page guide has grown into a full [Documentation site](README.md)** with a 30-minute learning path, per-concept pages, tutorials, an API reference, troubleshooting, and migration guides. Start there if you're new. This page remains as a condensed all-in-one overview.

Everything in Zoijs is plain JavaScript, HTML, and CSS. The whole API is six things:

```js
import { html, mount, createState, computed, each } from "@zoijs/core";
```

- **`html`** — write your markup as a tagged template.
- **`mount`** — put a component on the page.
- **`createState`** — a value that updates the DOM when it changes.
- **`computed`** — a value derived from other values.
- **`each`** — render a list efficiently by key.

---

## `createState()` — reactive values

```js
const count = createState(0);
count.get();   // read  (and, inside a binding, subscribe to changes)
count.set(1);  // write (updates everything that read it)
count.peek();  // read without subscribing
```

A state is just a value with `get`/`set`. Setting it to the **same** value does nothing (no wasted updates).

## Reactive template bindings — use a function

This is the one rule to remember: **wrap a value in `() =>` to make it live.**

```js
const count = createState(0);

html`
  <p>${() => count.get()}</p>        <!-- live: updates when count changes -->
  <p>${count.get()}</p>              <!-- static: rendered once, never updates -->
  <button onclick=${() => count.set(count.get() + 1)}>+1</button>
  <input disabled=${() => count.get() > 5} />   <!-- live attribute -->
`;
```

- `${() => ...}` → a **live** text or attribute binding. Only that node updates.
- `${value}` (no arrow) → **static**, set once. Great for things that never change.
- `onclick=${handler}` → a real event listener (a function reference, never a string).

The component function runs **once**. There is no re-render — state changes update individual nodes in place.

## `computed()` — derived values

Use `computed` when a value is calculated **from other values**:

```js
const first = createState("Jane");
const last  = createState("Doe");
const fullName = computed(() => `${first.get()} ${last.get()}`);

html`<p>${() => fullName.get()}</p>`;
```

A computed is **lazy** (only recalculates when read), **cached** (no recompute if nothing changed), and **composable** (a computed can read other computeds). You never `set` a computed — it updates itself.

**When to use a derived value:** whenever you'd otherwise compute the same thing in several places, or recompute it by hand after every change — a filtered list, a total, a formatted string, an "is valid" flag. Derive it once with `computed` and read it anywhere.

## `each()` — keyed lists

```js
const todos = createState([{ id: 1, text: "Learn Zoijs", done: false }]);

html`
  <ul>
    ${each(
      () => todos.get(),          // the array (a function, so it's reactive)
      (todo) => todo.id,          // a stable, unique key per item
      (todo) => html`
        <li>
          <span>${() => todo.text}</span>
          <button onclick=${() => remove(todo.id)}>Delete</button>
        </li>`
    )}
  </ul>
`;
```

`each` reuses each item's DOM node when its key matches — so reordering **moves** nodes (preserving focus, input values, and scroll) instead of rebuilding the list. Updating one item touches only that item.

## Production mode

Zoijs runs in **development mode by default** and prints helpful warnings (duplicate `each` keys, self-triggering effects, runaway loops). For production, silence them:

```js
import { configure } from "@zoijs/core";

configure({ dev: false });
```

No build step is involved — it's just a runtime flag. Call it once before mounting.

## Cleanup & ownership

`mount()` returns an **`unmount()`** function:

```js
const unmount = mount(App, document.querySelector("#app"));
// later…
unmount(); // detaches the DOM and disposes every effect, computed, and listener
```

You usually don't manage cleanup yourself. Internally, everything a component creates — effects, computeds, event listeners, and each list item's subtree — belongs to an **owner scope**. Disposing the scope (on `unmount`, or when an `each` item is removed) tears it all down: subscriptions are dropped, listeners removed, nodes detached. This is why a removed list item stops reacting even if it referenced long-lived state — its scope is disposed, so it can't keep a dead subscription alive.

## TypeScript (optional)

Zoijs is written in plain JavaScript, but ships type definitions for autocomplete and optional type-checking. **You don't need TypeScript** — but if you use it, the API is fully typed with no build step required for the framework itself.

```ts
import { html, mount, createState, computed, each } from "@zoijs/core";

// Typed state — inferred or explicit
const count = createState(0);          // State<number>
const name = createState<string>("");  // explicit

// Typed computed
const greeting = computed(() => `Hi ${name.get()}`); // Computed<string>

// Typed list items — `todo` is fully typed inside each()
interface Todo { id: number; text: string; done: boolean; }
const todos = createState<Todo[]>([]);

function TodoList() {
  return html`
    <ul>
      ${each(
        () => todos.get(),
        (todo) => todo.id,          // keyFn
        (todo) => html`<li>${() => todo.text}</li>` // todo: Todo
      )}
    </ul>
  `;
}

// Component typing
import type { Component } from "@zoijs/core";
const App: Component = () => html`<div>${() => count.get()}</div>`;

const unmount = mount(App, "#app"); // () => void
```

`createState<T>`, `computed<T>`, and `each<T>` are generic; `html` returns an opaque `TemplateResult`; `mount` returns an `unmount` function. Type-check your own code with `tsc --noEmit` — no framework build step involved.

---

## Common beginner mistakes

1. **Forgetting the arrow.** `${count.get()}` renders once and never updates. Write `${() => count.get()}` for anything that should change.
2. **Calling the handler instead of passing it.** `onclick=${doThing()}` runs it immediately. Pass a reference or a wrapper: `onclick=${doThing}` or `onclick=${() => doThing(id)}`.
3. **Mutating state in place.** `todos.get().push(x)` won't update anything — `set` a new array: `todos.set([...todos.get(), x])`.
4. **Replacing every object on every update.** For `each`, keep unchanged items' object references so only the changed item re-renders. `map(t => t.id === id ? {...t, done:true} : t)` keeps the others stable.
5. **`set`ting a state from inside an effect/binding that reads it.** That's a self-trigger loop — Zoijs warns and stops it. Use `computed` for derived values instead.
6. **Non-unique keys in `each`.** Keys must be unique and stable (use an id, not the array index). Zoijs warns in development if it sees duplicates.

## Examples

`examples/counter`, `examples/input`, `examples/todo`, `examples/computed`, `examples/reorder`, `examples/input-preservation`, `examples/benchmark`. Run `npm run dev`, then open `http://localhost:3000/examples/<name>/` (keep the trailing slash).
