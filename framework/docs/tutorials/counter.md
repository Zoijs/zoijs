# Tutorial: Counter

**You'll learn:** components, state, text bindings, events. **Time:** 5 minutes.

## Step 1 — the page

```html
<!DOCTYPE html>
<html>
  <body>
    <div id="app"></div>
    <script type="module" src="./app.js"></script>
  </body>
</html>
```

## Step 2 — the component (`app.js`)

```js
import { html, mount, createState } from "../src/index.js";

function Counter() {
  const count = createState(0);

  return html`
    <div>
      <h1>${() => count.get()}</h1>
      <button onclick=${() => count.set(count.get() + 1)}>+1</button>
      <button onclick=${() => count.set(count.get() - 1)}>-1</button>
    </div>
  `;
}

mount(Counter, document.querySelector("#app"));
```

## Step 3 — run it

```bash
npm run dev
# open http://localhost:3000/path-to-your-app/
```

## How it works

- `createState(0)` makes a reactive number.
- `${() => count.get()}` is a **live** text binding — wrapping it in `() =>` is what makes the `<h1>` update.
- `onclick=${() => count.set(...)}` attaches a native click listener.
- The component function runs **once**; clicking only updates the `<h1>`'s text node.

## Try it yourself

- Add a **Reset** button that sets `count` back to `0`.
- Show "even"/"odd" next to the number using a [computed](full-name.md) value.
- Disable the `-1` button at zero: `<button disabled=${() => count.get() === 0}>-1</button>`.

Next: **[Live input »](live-input.md)**
