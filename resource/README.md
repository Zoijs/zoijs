<div align="center">

# @zoijs/resource

**The simplest async-data helper for [Zoijs](https://zoijs.com).** Loading, success, error, and refresh — without rebuilding the same pattern every time.

[![npm](https://img.shields.io/npm/v/@zoijs/resource.svg)](https://www.npmjs.com/package/@zoijs/resource)
[![license](https://img.shields.io/npm/l/@zoijs/resource.svg)](LICENSE)

[Website](https://zoijs.com) · [Documentation](https://zoijs.dev) · [Core package](https://www.npmjs.com/package/@zoijs/core)

</div>

---

`@zoijs/resource` is an **optional** package. Add it only when you fetch data.
It builds on the core's public API, so the core stays small and unchanged.

You can learn the whole thing in about 5 minutes.

## Install

```bash
npm install @zoijs/core @zoijs/resource
```

Or with no install, from a CDN:

```js
import { resource } from "https://esm.sh/@zoijs/resource";
```

## What a resource is

A **resource** wraps a function that returns a promise. It runs that function
once, and gives you three reactive readers plus a refresh:

```js
import { html, mount } from "@zoijs/core";
import { resource } from "@zoijs/resource";

function Profile() {
  const user = resource(() => fetch("/api/user").then((r) => r.json()));

  return html`
    ${() =>
      user.loading() ? html`<p>Loading…</p>`
      : user.error() ? html`<p>Couldn't load your profile.</p>`
      : html`<h1>Hello, ${user.data().name}</h1>`}
  `;
}

mount(Profile, "#app");
```

That's it. No cache, no client, no provider to wrap your app in.

## The API

`resource(fetcher)` returns four functions:

| Function | What it gives you |
|---|---|
| `data()` | The loaded value, or `undefined` before the first success (reactive) |
| `loading()` | `true` while a load is in flight (reactive) |
| `error()` | The error, or `null` when there is none (reactive) |
| `refresh()` | Load again |

The three readers are **reactive** — read them inside a binding (`${() => ...}`)
and the DOM updates by itself when the data arrives.

## Loading state

`loading()` is `true` immediately (the fetch starts as soon as you create the
resource) and flips to `false` when it settles:

```js
${() => user.loading() ? html`<p>Loading…</p>` : html`<p>${user.data().name}</p>`}
```

## Error state

A rejected promise — or a function that throws — becomes `error()`:

```js
${() => user.error() ? html`<p class="err">${user.error().message}</p>` : ...}
```

## Refreshing

`refresh()` runs the fetcher again. The **old data stays readable** while the
new load is in flight, so the UI doesn't flash empty:

```js
const posts = resource(() => fetch("/api/posts").then((r) => r.json()));

html`
  <button onclick=${() => posts.refresh()}>Reload</button>
  ${() => (posts.loading() ? html`<p>Refreshing…</p>` : null)}
  <ul>
    ${each(() => posts.data() ?? [], (p) => p.id, (p) => html`<li>${() => p.title}</li>`)}
  </ul>
`;
```

If you call `refresh()` again before the previous load finishes, only the most
recent result is applied — a slow request can't overwrite a newer one.

## Common mistakes

- **Reading `data()` before checking `loading()`.** `data()` is `undefined`
  until the first success — guard with `loading()`/`error()` first, or use
  `posts.data() ?? []`.
- **Calling readers outside a binding.** Like all Zoijs reactivity, wrap them in
  an arrow to make them live: `${() => user.loading()}`, not `${user.loading()}`.
- **Expecting a cache.** There isn't one. Each `resource(...)` is its own state;
  creating two does two fetches. That's intentional — it stays predictable.
- **Passing arguments to `refresh()`.** It just re-runs your fetcher; capture any
  inputs in the fetcher closure instead.

## What this is *not*

By design, to stay tiny: no query client, cache, request dedupe, mutations,
suspense, optimistic updates, infinite queries, or SSR. If you need those, reach
for a dedicated data library — this is the 90%-case helper.

## License

[MIT](LICENSE) © Zoijs contributors
