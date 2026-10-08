# Lists with `each()`

To render an array, use `each` — Zoijs's keyed list renderer.

```js
import { html, each, createState } from "./src/index.js";

const todos = createState([
  { id: 1, text: "Learn Zoijs", done: false },
  { id: 2, text: "Build an app", done: false },
]);

html`
  <ul>
    ${each(
      () => todos.get(),                 // 1. the array (a function, so it's reactive)
      (todo) => todo.id,                 // 2. a stable, unique key per item
      (todo) => html`<li>${() => todo.text}</li>` // 3. the template for one item
    )}
  </ul>
`;
```

`each(items, keyFn, renderFn)` takes three arguments:

1. **`items`** — a function returning the array (so it updates), or a plain array.
2. **`keyFn`** — returns a **stable, unique key** for each item (use an `id`, not the array index).
3. **`renderFn`** — returns the template for a single item.

## Why keys matter

When the array changes, Zoijs matches items by key and:

- **reuses** the DOM node for items whose key is unchanged,
- **moves** nodes when items reorder (instead of recreating them),
- **inserts** nodes for new keys,
- **removes and cleans up** nodes for keys that are gone.

Because nodes are *moved, not rebuilt*, things like **focus, typed input values, and scroll position are preserved** across reorders. Try the [input-preservation example](../examples/input-preservation/).

## Updating one item is cheap

If you change one item (keeping the other items' object references the same), only that item re-renders:

```js
// toggle one todo — the others keep their reference, so they don't re-render
todos.set(todos.get().map((t) =>
  t.id === id ? { ...t, done: !t.done } : t
));
```

This is why the [immutable-update style](state.md#updating-objects-and-arrays--replace-dont-mutate) matters.

## Per-item reactive bindings

Inside `renderFn`, the item supports reactive bindings:

```js
(todo) => html`
  <li class=${() => (todo.done ? "done" : "")}>
    <input type="checkbox" checked=${() => todo.done} onchange=${() => toggle(todo.id)} />
    <span>${() => todo.text}</span>
    <button onclick=${() => remove(todo.id)}>✕</button>
  </li>`
```

When that item's data changes, only its own bindings update — the rest of the list is untouched.

## Common mistakes

- **Using the array index as the key** → breaks reuse on reorder. Use a stable id.
- **Forgetting `() =>` on the items** → `each(todos.get(), …)` renders once and never updates; use `each(() => todos.get(), …)`.
- **Mutating the array in place** → nothing updates; `set` a new array.

---

Next: [Cleanup](cleanup.md).
