# Task Board — Zoijs ecosystem demo

One small app that uses **all five** Zoijs packages together — with no build
step, no JSX, and no global store.

| Package | Used for |
|---|---|
| [`@zoijs/core`](../../framework) | `html`, `mount`, `each` (task list), `computed` (counts), `createState` (filter) |
| [`@zoijs/router`](../../router) | Pages, `link`, params, `go` (redirect after create/delete) |
| [`@zoijs/resource`](../../resource) | Loading the task list and a single task |
| [`@zoijs/action`](../../action) | Creating, toggling, and deleting tasks |
| [`@zoijs/head`](../../head) | Per-page `<title>` and meta description |

## Pages

`/` Home · `/tasks` Tasks (list + filter + counts) · `/tasks/new` New task (form)
· `/tasks/:id` Task details · `/about` About · `*` Not found.

## Run it

From the repository root:

```bash
npx serve -l 3500 .
# then open http://localhost:3500/examples/task-board/
```

It uses an **import map** (in `index.html`) to point the `@zoijs/*` names at the
local package sources — so it runs straight from source with no install or build.

This app is served under a sub-path in the repo, so it passes a **`base`** to the
router:

```js
const router = createRouter(routes, { base: "/examples/task-board" });
```

That's why the first load lands on **Home** (not Not Found) and every link keeps
working under the sub-path. Deployed at your site's root, drop the `base`.

## How it fits together

- `app.js` is plain functions returning `html`. Each page function sets its
  title/description, loads what it needs with `resource`, and writes with
  `action`. There's no store and no shared context — navigating between pages
  re-mounts them, so each page loads fresh data. That's why no cache or query
  client is needed.
- Read it top to bottom; it's about 200 lines.
