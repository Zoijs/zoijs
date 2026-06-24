<div align="center">

# @zoijs/router

**A tiny router for [Zoijs](https://zoijs.com).** Routes are a plain object, links are plain anchors, and there's no build step.

[![npm](https://img.shields.io/npm/v/@zoijs/router.svg)](https://www.npmjs.com/package/@zoijs/router)
[![license](https://img.shields.io/npm/l/@zoijs/router.svg)](LICENSE)

[Website](https://zoijs.com) · [Documentation](https://zoijs.dev) · [Core package](https://www.npmjs.com/package/@zoijs/core)

</div>

---

`@zoijs/router` is an **optional** package. The Zoijs core has no router — add this
only if your app needs one. It builds entirely on the core's public API, so the
core stays small and unchanged.

You can learn the whole thing in about 10 minutes.

## Install

```bash
npm install @zoijs/core @zoijs/router
```

Or with no install, straight from a CDN:

```js
import { html, mount } from "https://esm.sh/@zoijs/core";
import { createRouter } from "https://esm.sh/@zoijs/router";
```

## The whole idea

A route is `pattern: component`. A **component** is a function that returns an
`html` template and receives the matched params as a plain object.

```js
import { html, mount } from "@zoijs/core";
import { createRouter } from "@zoijs/router";

function Home() {
  return html`<h1>Home</h1>`;
}

function UserPage(params) {
  return html`<h1>User ${params.id}</h1>`;
}

const router = createRouter({
  "/": Home,
  "/about": () => html`<h1>About</h1>`,
  "/users/:id": UserPage,
  "*": () => html`<h1>Not Found</h1>`,
});

function App() {
  return html`
    <nav>
      ${router.link("/", "Home")}
      ${router.link("/about", "About")}
    </nav>

    ${router.view()}
  `;
}

mount(App, "#app");
```

That's a complete app. `router.view()` renders whichever component matches the
current URL and swaps it when you navigate.

## The API (six functions)

| Method | What it does |
|---|---|
| `createRouter(routes)` | Build a router from a `{ pattern: component }` map |
| `router.view()` | Reactive content for the current page — place it once |
| `router.link(path, text)` | An `<a>` that navigates without a page reload |
| `router.go(path)` | Navigate from code |
| `router.path()` | The current path, e.g. `"/users/42"` (reactive) |
| `router.query()` | The query string as a plain object (reactive) |

There's also `router.destroy()` to remove the back/forward listener — but you
rarely call it: the router cleans itself up when the app unmounts.

## Creating routes

Patterns are matched segment by segment:

| Pattern | Matches | `params` |
|---|---|---|
| `/` | `/` | `{}` |
| `/about` | `/about` | `{}` |
| `/users/:id` | `/users/42` | `{ id: "42" }` |
| `/posts/:year/:slug` | `/posts/2026/hello` | `{ year: "2026", slug: "hello" }` |
| `*` | anything unmatched | `{}` |

Static routes always win over param routes, so you can have both `/users/new`
and `/users/:id` and `/users/new` will match first.

## Links

`router.link(path, text)` returns a normal `<a href>` — so middle-click,
Ctrl/Cmd-click, and "open in new tab" all work. A plain left-click is
intercepted and routed without a reload.

The active link automatically gets `aria-current="page"`, so you can style it
with plain CSS:

```css
nav a[aria-current="page"] {
  font-weight: 600;
}
```

## Dynamic params

The matched params are passed straight to your component:

```js
function UserPage(params) {
  return html`<h1>User ${params.id}</h1>`;
}
// route: "/users/:id"  →  /users/42  →  params.id === "42"
```

Params are always strings (convert with `Number(params.id)` if you need a number).

## Navigation from code

```js
router.go("/about");          // navigate
router.go(`/users/${id}`);    // build a path
```

`go()` adds a history entry, so the back button returns to the previous page.

## Query strings

```js
// at /search?q=hello&page=2
router.query(); // → { q: "hello", page: "2" }
```

`query()` is reactive — read it inside a binding (`${() => router.query().q}`)
and it updates when the URL changes.

## Hosting under a sub-path (`base`)

By default the router assumes your app owns the URL root (`/`). If it's served
under a sub-path — `https://example.com/app/` or a project page like
`https://you.github.io/repo/` — pass a `base`:

```js
const router = createRouter(routes, { base: "/app" });
```

Now everything stays clean and base-free in your code:

| | Without `base` | With `base: "/app"` |
|---|---|---|
| Route pattern | `"/tasks"` | `"/tasks"` (unchanged) |
| `link("/tasks", …)` href | `/tasks` | `/app/tasks` |
| `go("/tasks")` pushes | `/tasks` | `/app/tasks` |
| `router.path()` returns | `/tasks` | `/tasks` (still base-free) |
| `query()` | works | works |

The base is stripped before matching and prepended for links and navigation, so
you never repeat it. A trailing slash is optional (`"/app"` and `"/app/"` behave
the same).

> **Heads up — server rewrites.** History-mode routing means a *hard reload* of a
> deep link (e.g. `/app/tasks/42`) asks your server for that path. Configure your
> host to serve `index.html` for unknown paths under the base (a "SPA fallback").
> In-app navigation needs no server config; this only matters for full reloads.

## Common mistakes

- **Hosting under a sub-path without `base`.** The first load matches `"*"`
  (Not Found) because the URL has an extra prefix. Pass `{ base: "/your-path" }`.

- **Calling `router.view()` more than once.** Place it a single time in your
  layout. It's the one spot where the current page renders.
- **Using a real `<a href>` for in-app links.** That triggers a full page
  reload. Use `router.link(...)` (or call `router.go(...)`) instead.
- **Expecting numbers from params.** They're strings: `Number(params.id)`.
- **Forgetting the `"*"` route.** Without it, an unmatched URL renders nothing.
- **Reading `router.path()` outside a binding and expecting it to update.** Like
  all Zoijs reactivity, wrap it in an arrow to make it live:
  `${() => router.path()}`.

## What this router is *not*

By design, to stay tiny and beginner-friendly, it has **no** nested-outlet
system, route guards, loaders/actions, providers, hooks, or SSR. If you need
those, this probably isn't the router for you — and that's fine.

## License

[MIT](LICENSE) © Zoijs contributors
