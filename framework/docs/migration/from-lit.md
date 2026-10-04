# Coming from Lit

Lit and Zoijs both use **tagged-template HTML with no build step** — the authoring style is very similar. Zoijs adds built-in fine-grained reactivity (signals, computeds) and keyed lists, and isn't tied to Web Components.

## Concept map

| Lit | Zoijs |
|---|---|
| `html\`...\`` | `html\`...\`` (same idea) |
| `@click=${fn}` | `onclick=${fn}` |
| `?disabled=${x}` (boolean) | `disabled=${() => x.get()}` (boolean handled automatically) |
| `.value=${x}` (property) | `value=${() => x.get()}` (`value`/`checked` use the property automatically) |
| reactive properties on a `LitElement` | `createState` / `computed` |
| `repeat(items, keyFn, template)` | `each(() => items.get(), keyFn, template)` |
| render into a custom element | `mount(component, target)` into any element |

## Example

```js
// Lit
class MyCounter extends LitElement {
  static properties = { count: { type: Number } };
  constructor() { super(); this.count = 0; }
  render() {
    return html`<button @click=${() => this.count++}>${this.count}</button>`;
  }
}
```

```js
// Zoijs
function Counter() {
  const count = createState(0);
  return html`<button onclick=${() => count.set(count.get() + 1)}>${() => count.get()}</button>`;
}
mount(Counter, "#app");
```

## Differences to note

- **No class / Web Component required.** A component is just a function; `mount` renders into any DOM element. (You *can* render into a custom element if you want.)
- **Reactivity is built in.** Instead of `LitElement` reactive properties, use `createState`/`computed`. Changing state updates the DOM automatically.
- **Binding syntax is HTML-native.** Zoijs uses `onclick=` (not `@click=`) and handles boolean/property attributes by name (`disabled`, `value`, `checked`) rather than `?`/`.` prefixes.
- **Reads in templates need `() =>`** to be live: `${() => count.get()}`.

## What's familiar

The "parse a tagged template once, update only the dynamic parts" model is essentially the same as Lit's — so the performance characteristics and the no-build workflow will feel right at home.
