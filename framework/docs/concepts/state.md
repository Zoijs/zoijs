# State — `createState`

State is a value that updates the DOM when it changes.

```js
import { createState } from "./src/index.js";

const count = createState(0);
```

`createState(initialValue)` returns an object with three methods:

| Method | Does |
|---|---|
| `count.get()` | Read the value. Inside a binding, this **subscribes** so the binding updates when the value changes. |
| `count.set(next)` | Write a new value. Updates dependents — but only if the value actually changed. |
| `count.peek()` | Read **without** subscribing (rare; for when you want the current value but don't want to react to it). |

## Reading and writing

```js
const name = createState("Jane");
name.get();        // "Jane"
name.set("John");  // dependents update
name.get();        // "John"
```

## Equality-gating: setting the same value does nothing

```js
const n = createState(5);
n.set(5); // no-op — value didn't change, so nothing updates
```

This is automatic and saves you from needless updates.

## State holds any value

Numbers, strings, booleans, objects, arrays — anything.

```js
const user  = createState({ name: "Jane", age: 30 });
const items = createState([1, 2, 3]);
```

### Updating objects and arrays — replace, don't mutate

Zoijs reacts to **`set`**, not to in-place mutation:

```js
// ❌ does nothing — you mutated the same array
items.get().push(4);

// ✅ set a new array
items.set([...items.get(), 4]);

// ✅ set a new object
user.set({ ...user.get(), age: 31 });
```

This is the same immutable-update style you may know from React, and it's what makes [keyed lists](lists.md) and [computed values](computed.md) efficient.

## Local by default

State usually lives inside a component:

```js
function Counter() {
  const count = createState(0); // private to this component
  return html`<p>${() => count.get()}</p>`;
}
```

To share state between components, create it in a module and import it — it's the same primitive, just declared in a shared place. (Zoijs has no separate "global store"; you don't need one.)

---

Next: [Bindings](bindings.md) — how state reaches the DOM.
