# Tutorial: Reorderable List

**You'll learn:** how keyed `each` *moves* nodes (preserving DOM state) instead of rebuilding. **Time:** 6 minutes.

```js
import { html, mount, each, createState } from "../src/index.js";

const items = createState(
  [1, 2, 3, 4, 5].map((n) => ({ id: n, label: `Item ${n}` }))
);

const reverse = () => items.set([...items.get()].reverse());
const shuffle = () => {
  const next = [...items.get()];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  items.set(next);
};

function App() {
  return html`
    <div>
      <button onclick=${shuffle}>Shuffle</button>
      <button onclick=${reverse}>Reverse</button>
      <ul>${each(
        () => items.get(),
        (it) => it.id,
        (it) => html`<li>${it.label} <input placeholder="type here" /></li>`
      )}</ul>
    </div>
  `;
}

mount(App, document.querySelector("#app"));
```

## The thing to notice

Type something into one of the inputs, then click **Reverse** or **Shuffle**. Your text — and the focus — **stay with the item**.

That's because `each` matched items by `it.id` and **moved** the existing `<li>` nodes into their new positions instead of recreating them. A naïve "rebuild the list" approach would throw away your inputs.

This is the whole point of keyed reconciliation:
- unchanged keys → nodes reused,
- reordered keys → nodes moved,
- new keys → nodes inserted,
- removed keys → nodes disposed (and their effects/listeners cleaned up).

## Try it yourself

- Add a "Sort A→Z" button (sort a copy by `label`, then `set`).
- Add a per-item "Remove" button and watch its node (and any typed text) disappear cleanly.
- Compare with a deliberately-broken version that keys by index — notice inputs jump between rows.

Back to **[docs home](../README.md)** or the [examples index](../examples.md).
