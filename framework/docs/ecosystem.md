# The Zoijs ecosystem

Zoijs core is deliberately tiny — seven functions, no router, no data layer, no
head manager. Everything else lives in **small, optional packages** you add only
when you need them. Use none of them and you still have a complete framework;
add them one at a time as your app grows.

This page explains what each package does, how they fit together, and walks
through one app — the **Task Board** demo — that uses all of them.

## The packages

| Package | Adds | Public API |
|---|---|---|
| [`@zoijs/core`](../README.md) | The framework | `html`, `mount`, `createState`, `computed`, `each`, `configure`, `onCleanup` |
| [`@zoijs/router`](../../router/README.md) | Client-side routing | `createRouter` → `view`, `link`, `go`, `path`, `query` |
| [`@zoijs/resource`](../../resource/README.md) | Reading async data | `resource(fetcher)` → `data`, `loading`, `error`, `refresh` |
| [`@zoijs/action`](../../action/README.md) | Writing async data | `action(fn)` → `run`, `pending`, `error`, `done`, `result`, `reset` |
| [`@zoijs/head`](../../head/README.md) | Page title & meta | `title`, `description`, `meta` |

Every package is:

- **Optional** — install only what you use; the core never depends on them.
- **Tiny** — each is one small file with a handful of functions.
- **Built on the core's public API** — they use `createState`, `onCleanup`,
  `html`, and `mount` just like your own code. There is no private core access
  and **no core changes** were needed to add any of them.

## How they work together

They share one idea: **reactive readers you call inside bindings.**
`count.get()`, `user.loading()`, `save.pending()`, `router.path()` — they're all
the same shape, so once you've learned one you've learned them all. Wrap any of
them in an arrow (`${() => ...}`) and the DOM updates when it changes.

And they share the core's **ownership model**: when a component (or a routed
page) unmounts, its `onCleanup` runs. That single mechanism is why:

- the **router** can swap pages and the old page's effects are disposed,
- **head** restores the previous title automatically,
- **resource**/**action** ignore a response that arrives after unmount.

No provider wraps your app. No context is threaded through. No lifecycle methods.
A page is a function; it sets up what it needs; the core cleans it up.

## The Task Board app

A small task manager that uses **all five** packages. Find it at
[`examples/task-board/`](../../examples/task-board/).

**Pages:** Home, Tasks (list + filter + counts), New task (form), Task details,
About, and a Not-Found route.

### How each package is used

- **`@zoijs/router`** — the route map is a plain object (`"/tasks/:id":
  TaskDetails`). `router.link(...)` renders the nav, `router.view()` renders the
  current page, and `router.go("/tasks")` redirects after a successful create.
- **`@zoijs/head`** — every page calls `title(...)` and `description(...)` in its
  first lines, so the browser tab updates as you navigate.
- **`@zoijs/resource`** — the Tasks page does `resource(() => api.listTasks())`;
  the details page does `resource(() => api.getTask(params.id))`. Loading and
  error states come for free.
- **`@zoijs/action`** — creating, toggling, and deleting are `action(...)`s. The
  Create button shows `pending()`, the form shows `error()`, and on success the
  page calls the resource's `refresh()` (or navigates away).
- **`@zoijs/core`** — `each()` renders the task list, `computed()` derives the
  "X total · Y done" counts, and `createState()` holds the All/Active/Done
  filter.

### A telling detail: no cache needed

When you create a task and land back on the Tasks page, the router **re-mounts**
that page, so its `resource` loads fresh data — the new task is just there. No
query cache, no invalidation, no store subscription. The framework's own
mount/unmount is the "cache invalidation." That's the whole philosophy: lean on
the platform and the core, don't build a system.

### Run it

From the repository root:

```bash
npx serve -l 3500 .
# open http://localhost:3500/examples/task-board/
```

No install, no build — `index.html` uses an **import map** to point the
`@zoijs/*` names at local source.

> The demo is served at a sub-path here, so it passes
> `{ base: "/examples/task-board" }` to the router — that's why the first load
> lands on Home and every link works under the sub-path. Deployed at your site's
> root, drop the `base`.

## How this avoids React/Vue/Angular-style complexity

| You don't write… | Instead |
|---|---|
| JSX + a compiler | Real HTML in `html\`...\`` template literals |
| A bundler/build config | A `<script type="module">` and an import map |
| `useState`/`useEffect` + rules-of-hooks | `createState`/`computed`; call them anywhere, once |
| Context providers / a global store | Plain values and per-page setup; nothing to wrap |
| A Virtual DOM + reconciler | Fine-grained bindings update the exact node |
| A data-fetching library with a client | `resource` (read) and `action` (write), ~50 lines each |
| Router config objects, loaders, guards | A `{ pattern: component }` object |

Each package is something you could have written yourself in an afternoon — and
could read in ten minutes. That's the point: Zoijs grows by adding small,
understandable pieces, not by getting more clever.

## Next steps

- Skim each package's README (linked in the table above).
- Open [`examples/task-board/app.js`](../../examples/task-board/app.js) and read
  it top to bottom.
- Build your own page: a function that sets a `title`, loads a `resource`, and
  renders it. That's a Zoijs app.
