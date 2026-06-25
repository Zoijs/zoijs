# {{APP_TITLE}}

A [Zoijs](https://zoijs.dev) app — plain HTML, CSS, and JavaScript. **No build step.**

## Develop

```bash
npm install
npm run dev
```

Then open the printed URL.

## How it works

- **`index.html`** — an import map points `@zoijs/core` at `node_modules`, then loads `src/app.js`.
- **`src/app.js`** — your app: `createState` for state, `html` for markup, `mount` to render.
- **`src/style.css`** — plain CSS.

There's no bundler and no build step. Open the files and read them — that's the
whole app. Edit `src/app.js` and reload.

Learn more at [zoijs.dev](https://zoijs.dev).
