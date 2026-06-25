# {{APP_TITLE}}

A [Zoijs](https://zoijs.dev) app — plain HTML, CSS, and JavaScript. **No build step.**

## Develop

```bash
npm install
npm run dev
```

```text
ZoiJS dev server: http://localhost:7310
If busy: 7311, 7312, 7313
```

Open the printed URL.

## How it works

- **`index.html`** — an import map points `@zoijs/core` at `node_modules`, then loads `src/app.js`.
- **`dev-server.mjs`** — a tiny zero-dependency static server (Node built-ins only) that `npm run dev` runs.
- **`src/app.js`** — your app: `createState` for state, `html` for markup, `mount` to render.
- **`src/style.css`** — plain CSS.

There's no bundler and no build step. Open the files and read them — that's the
whole app. Edit `src/app.js` and reload.

Learn more at [zoijs.dev](https://zoijs.dev).
