# {{APP_TITLE}}

A small **project dashboard** built with [Zoijs](https://zoijs.dev) — plain HTML,
CSS, and JavaScript. **No build step.**

## Develop

```bash
npm install
npm run dev
```

```text
  Zoijs dev server

  - Local:  http://localhost:7310
```

Open the printed URL (it falls back to 7311–7313 if the port is busy).

## Project layout

```
{{APP_NAME}}/
  index.html              import map + #app mount point
  dev-server.mjs          tiny zero-dependency static server (npm run dev)
  src/
    app.js                owns all state; composes the dashboard
    style.css             plain CSS (light/dark, responsive)
    components/
      Header.js           parent → child: hero + summary stats
      StatCard.js         parent → child: a reusable stat card (used ×4)
      TaskItem.js         child → parent: reports toggle/delete via callbacks
```

## What it shows

- **`createState`** — the task list, the active filter, and the input draft.
- **`computed`** — total / completed / active counts and the filtered list.
- **`each`** — keyed rendering of the visible tasks.
- **Conditional rendering** — the empty state and the active-filter highlight.
- **Component composition** — `Header`, `StatCard` (×4), and `TaskItem`.
- **Parent → child** — `App` passes data down to its components as arguments.
- **Child → parent** — `TaskItem` reports events up through callbacks; `App`
  owns the state and performs the changes.

No bundler, no build step. Open the files and read them. Learn more at
[zoijs.dev](https://zoijs.dev).
