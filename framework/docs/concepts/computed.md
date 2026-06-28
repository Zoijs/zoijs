# Computed values — `computed`

A **computed** is a value derived from other values. Use it whenever you'd otherwise recalculate the same thing in several places or by hand after every change.

```js
import { createState, computed } from "./src/index.js";

const first = createState("Jane");
const last  = createState("Doe");

const fullName = computed(() => `${first.get()} ${last.get()}`);

html`<p>${() => fullName.get()}</p>`;
```

Change `first` or `last`, and `fullName` (and the `<p>`) update automatically. You **never `set` a computed** — it derives itself.

## It's lazy, cached, and value-gated

- **Lazy** — the function doesn't run until something reads `fullName.get()`.
- **Cached** — if nothing it depends on changed, reading it returns the cached value (no recompute).
- **Value-gated** — if a dependency changes but the result is the *same*, things that depend on the computed are **not** woken.

That last point matters:

```js
const count  = createState(0);
const parity = computed(() => count.get() % 2 === 0 ? "even" : "odd");

count.set(2); // count changed 0 → 2, but parity is still "even"
              // → bindings that show `parity` do NOT update. No wasted work.
count.set(3); // parity becomes "odd" → now they update.
```

## Computeds compose

A computed can read other computeds:

```js
const items   = createState([{ price: 10 }, { price: 5 }]);
const subtotal = computed(() => items.get().reduce((s, i) => s + i.price, 0));
const withTax  = computed(() => subtotal.get() * 1.2);
```

## When to reach for `computed`

Use it for:
- formatted strings (`fullName`, dates, currency)
- totals and counts (`subtotal`, "3 remaining")
- filtered/sorted views of an array
- boolean flags (`isValid`, `canSubmit`)

If you find yourself recomputing the same thing in multiple bindings, that's a computed.

## `peek()`

`fullName.peek()` reads the current value without subscribing — useful in an event handler where you want the value but don't want to react to it.

---

Next: [Lists with `each()`](lists.md).
