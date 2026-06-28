# Cleanup & ownership

Zoijs cleans up after itself. You rarely manage this directly, but it's good to know how it works.

## `mount` returns `unmount`

```js
const unmount = mount(App, "#app");

// later, when you're done with it:
unmount();
```

`unmount()`:
- detaches the rendered DOM,
- disposes every effect and computed the component created,
- removes every event listener it added.

After `unmount()`, nothing the component made is still reacting — no leaks.

## Removed list items clean themselves up

When an [`each`](lists.md) item is removed from the array, its subtree is disposed: its bindings, computeds, and listeners are torn down, and its nodes are removed. A removed item can't keep a subscription alive on shared state.

## Why this matters (ownership)

Internally, everything a component creates belongs to an **owner scope**. Disposing the scope (on `unmount`, or when a list item is removed) tears down everything inside it, child scopes first. This is what makes Zoijs leak-safe by default — you get deterministic cleanup without writing any.

## `onCleanup` — your own teardown

If *you* set something up that Zoijs doesn't know about — a `setInterval`, a global listener, a third-party widget — register an `onCleanup` during setup. It runs when the component is unmounted **or** (inside an `each` item) when that item is removed.

```js
import { html, createState, onCleanup } from "./src/index.js";

function Clock() {
  const now = createState(Date.now());
  const id = setInterval(() => now.set(Date.now()), 1000);
  onCleanup(() => clearInterval(id)); // ← runs on unmount

  return html`<time>${() => now.get()}</time>`;
}
```

Call `onCleanup` during a component's setup (or inside an `each` render function), as many times as you need. You don't clean up Zoijs's own effects/listeners — those are automatic; `onCleanup` is only for resources *you* create.

---

Next: [Production mode](production-mode.md).
