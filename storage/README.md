<div align="center">

# @zoijs/storage

**A tiny localStorage-backed reactive value for [Zoijs](https://zoijs.dev).** A drop-in, persistent `createState` for themes, drafts, filters, and preferences.

[![npm](https://img.shields.io/npm/v/@zoijs/storage.svg)](https://www.npmjs.com/package/@zoijs/storage)
[![license](https://img.shields.io/npm/l/@zoijs/storage.svg)](LICENSE)

[Documentation](https://zoijs.dev) · [Core package](https://www.npmjs.com/package/@zoijs/core)

</div>

---

`@zoijs/storage` is an **optional** package. Add it when you want a piece of state
to survive a page reload. It builds on the core's public API, so the core stays
small and unchanged.

You can learn the whole thing in about 2 minutes — it's `createState` that remembers.

## Install

```bash
npm install @zoijs/core @zoijs/storage
```

Or with no install, from a CDN:

```js
import { storage } from "https://esm.sh/@zoijs/storage@0.1";
```

## What `storage()` does

`storage(key, initialValue)` returns the same `{ get, set, peek }` shape as
`createState` — but the value is read from `localStorage` on creation and written
back (as JSON) on every `set`:

```js
import { html, mount } from "@zoijs/core";
import { storage } from "@zoijs/storage";

const theme = storage("theme", "light"); // reads "theme" from localStorage, else "light"

function App() {
  return html`
    <button onclick=${() => theme.set(theme.get() === "dark" ? "light" : "dark")}>
      Theme: ${() => theme.get()}
    </button>
  `;
}

mount(App, "#app");
```

Reload the page and the choice is still there. That's the whole idea.

## The API

| Member | What it does |
|---|---|
| `storage(key, initialValue)` | Create a persistent value. Reads the key (JSON), or uses `initialValue`. |
| `get()` | Read the current value; **reactive** inside a binding (`${() => ...}`). |
| `set(value)` | Update the value **and** write it to `localStorage`. |
| `peek()` | Read the current value **without** subscribing. |

It feels exactly like `createState`; the only difference is persistence.

## Theme example

```js
const theme = storage("theme", "light");

const apply = (t) => document.documentElement.setAttribute("data-theme", t);
apply(theme.peek()); // restore on load

const toggle = () => {
  const next = theme.get() === "dark" ? "light" : "dark";
  theme.set(next); // persists automatically
  apply(next);
};
```

See [`examples/theme-toggle/`](examples/theme-toggle/).

## Draft example

Save a form draft as the user types. Set the field's initial value once with
`peek()` so the cursor never jumps while typing:

```js
const draft = storage("draft", "");

html`
  <textarea value=${draft.peek()} oninput=${(e) => draft.set(e.target.value)}></textarea>
  <p>${() => draft.get().length} characters saved</p>
`;
```

See [`examples/draft-form/`](examples/draft-form/).

## Values must be JSON-serializable

The value is stored with `JSON.stringify` and read with `JSON.parse`, so use
plain data: strings, numbers, booleans, `null`, arrays, and plain objects.
Functions, `Date`, `Map`/`Set`, and circular references can't be persisted — a
value that can't be stringified still updates the reactive state in memory; it
just isn't written to storage (no crash).

## When storage isn't available

If `localStorage` is missing, blocked (some privacy modes), or throws, `storage()`
**degrades to plain in-memory state**: `get`/`set`/`peek` keep working and stay
reactive — values simply don't persist for that session. It never throws.

## Common mistakes

- **Reading outside a binding.** Like all Zoijs reactivity, wrap reads in an arrow
  to make them live: `${() => theme.get()}`, not `${theme.get()}`.
- **Binding a text field's `value` to `get()`.** Use `peek()` for a field's initial
  value; a reactive `value=${() => ...}` re-applies on every keystroke and moves the
  cursor. Read more state reactively elsewhere (e.g. a character count).
- **Expecting cross-tab sync.** There isn't any — a `set` in one tab doesn't update
  another open tab. That's intentional, to stay tiny.
- **Storing huge or non-JSON data.** Keep it small and serializable; `localStorage`
  has a modest quota and only holds strings.

## What this is *not*

By design, to stay tiny: no global store, no provider/context, no cross-tab sync,
no TTL/expiration, no encryption, no `sessionStorage`/IndexedDB, no custom
serializers, and no schema validation. It's the 90%-case persistence helper.

## License

[MIT](LICENSE) © Zoijs contributors
