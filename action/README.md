<div align="center">

# @zoijs/action

**The simplest way to handle writes in [Zoijs](https://zoijs.dev)** — submits, saves, deletes — with reactive pending / error / done state.

[![npm](https://img.shields.io/npm/v/@zoijs/action.svg)](https://www.npmjs.com/package/@zoijs/action)
[![license](https://img.shields.io/npm/l/@zoijs/action.svg)](LICENSE)

[Documentation](https://zoijs.dev) · [Core package](https://www.npmjs.com/package/@zoijs/core)

</div>

---

`@zoijs/action` is an **optional** package — the write-side companion to
[`@zoijs/resource`](../resource/README.md). It builds on the core's public API,
so the core stays small and unchanged.

You can learn the whole thing in under 10 minutes.

## What an action is

An **action** wraps a function that *changes* something (POST, PUT, DELETE…) and
gives you reactive state for the three things every button needs: is it running,
did it fail, did it succeed.

```js
import { html, mount } from "@zoijs/core";
import { action } from "@zoijs/action";

const save = action(async (formData) => {
  const res = await fetch("/api/users", { method: "POST", body: formData });
  if (!res.ok) throw new Error("Could not save user");
  return res.json();
});

function UserForm() {
  return html`
    <form onsubmit=${(e) => {
      e.preventDefault();
      save.run(new FormData(e.currentTarget));
    }}>
      <input name="name" />
      <button disabled=${() => save.pending()}>
        ${() => (save.pending() ? "Saving…" : "Save")}
      </button>
      ${() => (save.error() ? html`<p role="alert">${save.error().message}</p>` : null)}
      ${() => (save.done() ? html`<p>Saved successfully.</p>` : null)}
    </form>
  `;
}

mount(UserForm, "#app");
```

## resource vs action

They're a pair — same shape, opposite direction:

| | [`@zoijs/resource`](../resource/README.md) | `@zoijs/action` |
|---|---|---|
| Purpose | **Read** data | **Write** data |
| When it runs | Automatically, on creation | When you call `run()` |
| Reactive readers | `loading` / `data` / `error` | `pending` / `result` / `error` / `done` |
| Extra | `refresh()` | `reset()` |

Rule of thumb: loading a page → `resource`. Clicking a button → `action`.

## The API

`action(fn)` returns:

| Member | What it does |
|---|---|
| `run(...args)` | Call `fn(...args)`. Sets `pending()`, then `done()`+`result()` or `error()` |
| `pending()` | `true` while running (reactive) |
| `error()` | The error, or `null` (reactive) |
| `done()` | `true` after success; back to `false` when a new run starts (reactive) |
| `result()` | The latest successful result (reactive) |
| `reset()` | Clear pending, error, done, and result |

## Showing pending state

Disable the button and change its label while running:

```js
html`<button disabled=${() => save.pending()}>
  ${() => (save.pending() ? "Saving…" : "Save")}
</button>`
```

## Showing errors

`run()` **never throws** — a failure lands in `error()`, so you don't need
try/catch. Just render it:

```js
${() => (save.error() ? html`<p role="alert">${save.error().message}</p>` : null)}
```

## Showing success

```js
${() => (save.done() ? html`<p>Saved!</p>` : null)}
```

## Resetting state

After the user dismisses a message, clear everything:

```js
html`<button onclick=${() => save.reset()}>Dismiss</button>`
```

## Common mistakes

- **Wrapping `run()` in try/catch.** It never rejects — read `error()` instead.
  (`await save.run(...)` resolves with the result, or `undefined` on failure.)
- **Forgetting `event.preventDefault()`** in a form's `onsubmit` — otherwise the
  browser does a full page reload before your action runs.
- **Calling readers outside a binding.** Wrap them in an arrow to make them live:
  `${() => save.pending()}`, not `${save.pending()}`.
- **Expecting a cache or auto-refetch.** An action just runs your function. To
  refresh data after a write, call your resource's `refresh()` yourself.

## What this is *not*

By design, to stay tiny: no form library, validation, mutation cache, query
invalidation, optimistic updates, retries, or SSR. It's the button-state helper,
nothing more.

## License

[MIT](LICENSE) © Zoijs contributors
