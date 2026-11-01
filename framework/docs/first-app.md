# Your First App

Let's build a counter. This is the whole app:

```html
<!DOCTYPE html>
<html>
  <body>
    <div id="app"></div>
    <script type="module">
      import { html, mount, createState } from "./src/index.js";

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
    </script>
  </body>
</html>
```

Serve it over http and open it. Clicking the buttons updates the number.

## What just happened

Three steps — that's the entire mental model:

1. **Write a function that returns `html`.** That's a *component*. `html` is a tagged template — you write normal HTML inside it.
2. **Put state in it.** `createState(0)` is a value that, when it changes, updates the DOM.
3. **`mount` it.** This renders your component into the page and starts it.

## The one rule to remember

Notice `${() => count.get()}` — the **arrow function**. That's what makes it *live*:

```js
${() => count.get()}   // ✅ live — updates when count changes
${count.get()}         // ⚠️ static — rendered once, never updates
```

When you want something to update, wrap it in `() =>`. This is the single most important thing to learn, and the [Core Concepts](concepts/core-concepts.md) page explains exactly why.

## What didn't happen

- No build step ran. You opened an HTML file.
- No JSX. That's real HTML in the template.
- The component function ran **once**. There's no re-rendering — only the `<h1>`'s text node updates when you click.

---

Next: **[Core Concepts »](concepts/core-concepts.md)**
