# Tutorial: Full Name (Computed)

**You'll learn:** derived values with `computed`. **Time:** 5 minutes.

```js
import { html, mount, createState, computed } from "../src/index.js";

function FullName() {
  const first = createState("Jane");
  const last  = createState("Doe");

  const fullName = computed(() => `${first.get()} ${last.get()}`.trim());

  return html`
    <div>
      <label>First <input value=${() => first.get()} oninput=${(e) => first.set(e.target.value)} /></label>
      <label>Last  <input value=${() => last.get()}  oninput=${(e) => last.set(e.target.value)} /></label>
      <p>Full name: <strong>${() => fullName.get()}</strong></p>
    </div>
  `;
}

mount(FullName, document.querySelector("#app"));
```

## How it works

- `fullName` is **derived** from `first` and `last`. You never `set` it.
- Editing either input updates the relevant state; `fullName` recomputes automatically and the `<strong>` updates.
- `fullName` is **lazy and cached** — it only recomputes when `first` or `last` actually change.

## Why not just inline the expression?

You could write `${() => first.get() + " " + last.get()}` directly. Use `computed` when:
- you need the value in **more than one place**, or
- it's **expensive** (so you want caching), or
- other computeds build on it.

## Try it yourself

- Add an `initials` computed: `computed(() => first.get()[0] + last.get()[0])`.
- Add a `greeting` computed that reads `fullName` (computeds can compose).
- Show "even"/"odd" length of the full name with another computed.

Next: **[Reorderable list »](reorder.md)**
