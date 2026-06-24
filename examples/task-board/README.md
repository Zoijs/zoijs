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

> Note: in this repo the app is served at the sub-path `/examples/task-board/`,
> so the very first load matches the `*` (Not Found) route — click **Home** to
> start. Deployed at your site's root, `/` shows Home as expected. (History-mode
> routing assumes the app owns the URL root, like any SPA.)

## How it fits together

- `app.js` is plain functions returning `html`. Each page function sets its
  title/description, loads what it needs with `resource`, and writes with
  `action`. There's no store and no shared context — navigating between pages
  re-mounts them, so each page loads fresh data. That's why no cache or query
  client is needed.
- Read it top to bottom; it's about 200 lines.
