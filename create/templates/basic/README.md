# {{APP_TITLE}}

A [Zoijs](https://zoijs.dev) app — plain HTML, CSS, and JavaScript. **No build step.**

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

The dev server is for **development only**: it listens on `127.0.0.1` (this machine),
never serves dotfiles (`.env`, `.git/`, …) or anything outside the project folder, and is
not meant for hosting. To try the app from a phone on your network, opt in explicitly with
`ZOIJS_HOST=0.0.0.0 npm run dev` — while it runs, anyone on that network can read the
project's files.

## Deploy

This page loads the **development** entry of `@zoijs/core` (helpful warnings, devtools).
When you deploy, change the import map in `index.html` to the **production** entry —
same API, warnings and the devtools hook off:

```html
"@zoijs/core": "./node_modules/@zoijs/core/src/prod.js"
```

## How it works

- **`index.html`** — an import map points `@zoijs/core` at `node_modules`, then loads `src/app.js`.
- **`dev-server.mjs`** — a tiny zero-dependency static server (Node built-ins only) that `npm run dev` runs.
- **`src/app.js`** — your app: `createState` for state, `html` for markup, `mount` to render.
- **`src/style.css`** — plain CSS.

There's no bundler and no build step. Open the files and read them — that's the
whole app. Edit `src/app.js` and reload.

Learn more at [zoijs.dev](https://zoijs.dev).
