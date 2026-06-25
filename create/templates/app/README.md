# {{APP_TITLE}}

A small task dashboard built with [Zoijs](https://zoijs.dev) — plain HTML, CSS,
and JavaScript. **No build step.**

## Develop

```bash
npm install
npm run dev
```

Then open the printed URL.

## Project layout

```
{{APP_NAME}}/
  index.html              import map + #app mount point
  src/
    app.js                owns the task list; renders the page
    style.css             plain CSS
    components/
      Header.js           parent → child: receives title + count
      TaskItem.js         child → parent: reports toggle/delete via callbacks
```

## What it shows

- **`createState`** — the task list and the input draft.
- **`computed`** — the "tasks left" count, derived from the list.
- **`each`** — keyed rendering of the task list.
- **Parent → child** — `App` passes data down to `Header` as arguments.
- **Child → parent** — `TaskItem` reports events up through callbacks; `App`
  owns the state and performs the changes.

No bundler, no build step. Open the files and read them. Learn more at
[zoijs.dev](https://zoijs.dev).
