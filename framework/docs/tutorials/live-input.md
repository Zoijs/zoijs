# Tutorial: Live Input

**You'll learn:** reading events into state, multiple bindings off one value. **Time:** 4 minutes.

```js
import { html, mount, createState } from "../src/index.js";

function LiveInput() {
  const text = createState("");

  return html`
    <div>
      <input placeholder="Type here..." oninput=${(e) => text.set(e.target.value)} />
      <p>You typed: <strong>${() => text.get()}</strong></p>
      <p>Length: ${() => text.get().length}</p>
    </div>
  `;
}

mount(LiveInput, document.querySelector("#app"));
```

## How it works

- `oninput=${(e) => text.set(e.target.value)}` writes every keystroke into state. The handler gets the native event, so `e.target.value` is the input's text.
- **Two** bindings read `text` — the `<strong>` and the length. Both update on every keystroke, each in place.
- Notice there's no "binding" wiring beyond reading `text.get()` inside `() =>`. Reading it *is* subscribing.

## Try it yourself

- Add a character limit and show a warning when exceeded (use a [computed](full-name.md) `isTooLong`).
- Add a "Clear" button: `onclick=${() => text.set("")}`.
- Mirror the input into a second, read-only field with `value=${() => text.get()}`.

Next: **[Full-name (computed) »](full-name.md)**
