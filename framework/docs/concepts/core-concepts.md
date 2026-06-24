# Core Concepts

Zoijs has a tiny mental model. If you understand this page, you understand Zoijs.

## Components are functions that return `html`

```js
function Greeting() {
  return html`<p>Hello!</p>`;
}
```

A component is just a function. It returns a template made with the `html` tagged template — which is **real HTML**, not JSX.

## State is a value that updates the DOM

```js
const name = createState("world");
name.get();   // read  → "world"
name.set("Zoijs"); // write → updates anything showing it
```

See [State](state.md).

## The one rule: `() =>` makes a binding live

This is the heart of Zoijs. Inside a template:

```js
${() => name.get()}   // ✅ LIVE: this text updates when name changes
${name.get()}         // ⚠️ STATIC: rendered once, never updates
```

- Wrap a value in an **arrow function** when it should update.
- Use a plain value when it never changes (it's slightly faster, too).

The same rule applies to attributes:

```js
<button disabled=${() => isBusy.get()}>Save</button>   <!-- live -->
<button class="primary">Save</button>                  <!-- static -->
```

## Setup runs once — there is no re-render

A component function runs **one time**. When state changes, Zoijs updates *only the exact text node or attribute* that depends on it — not the whole component.

This is the big difference from React: there's no re-rendering, no stale closures, no dependency arrays, no `useMemo`. You write plain functions and plain values.

```js
function Counter() {
  const count = createState(0);
  console.log("setup");           // logs ONCE, ever
  return html`<p>${() => count.get()}</p>`;
}
```

Clicking a button that calls `count.set(...)` updates the `<p>`'s text in place. `setup` never logs again.

## Putting it together

```js
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

Three things: **a function returning `html`**, **state inside it**, **`mount` it**. That's the whole framework.

## Where to go next

- [State](state.md) — creating and updating reactive values
- [Bindings](bindings.md) — text and attribute updates in detail
- [Events](events.md) — handling clicks, input, etc.
- [Computed](computed.md) — values derived from other values
- [Lists with `each()`](lists.md) — rendering arrays efficiently
