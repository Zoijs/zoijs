# Coming from vanilla JavaScript

If you've been doing `document.querySelector` + `addEventListener` + manual DOM updates, Zoijs will feel familiar — it just removes the tedious "keep the DOM in sync" part.

## The shift

| Vanilla | Zoijs |
|---|---|
| `el.textContent = value` everywhere | bind once: `${() => value.get()}` |
| Manually re-set the DOM after every change | state changes update the DOM for you |
| `addEventListener` by hand | `onclick=${fn}` in the template |
| Track which DOM nodes need updating | Zoijs tracks it (fine-grained) |

## Before (vanilla)

```js
let count = 0;
const h1 = document.querySelector("h1");
const btn = document.querySelector("button");
btn.addEventListener("click", () => {
  count++;
  h1.textContent = count; // remember to update every place that shows count
});
```

## After (Zoijs)

```js
function Counter() {
  const count = createState(0);
  return html`
    <h1>${() => count.get()}</h1>
    <button onclick=${() => count.set(count.get() + 1)}>+1</button>
  `;
}
mount(Counter, "#app");
```

You declare *what* the UI shows; Zoijs keeps it in sync.

## What stays the same

- It's still HTML, CSS, and JS. No new language.
- Events are native DOM events (`e.target`, `e.preventDefault()`, …).
- You can drop to the DOM anytime — `each` items are real nodes, `mount` targets a real element.

## What's new to learn

Just one thing: **wrap dynamic values in `() =>`** so they update. Read [Core Concepts](../concepts/core-concepts.md) (5 min) and you're done.
