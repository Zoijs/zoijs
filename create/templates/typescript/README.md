# {{APP_TITLE}}

A [Zoijs](https://zoijs.dev) app with **TypeScript-grade safety and no build step.**

The source is plain JavaScript the browser runs as-is — but every file starts with
`// @ts-check`, and together with the type definitions shipped in `@zoijs/core` you
get full type-checking, autocomplete, and inline errors. There is **no compile
step**: you never turn `.ts` into `.js`, because there's no `.ts` to begin with.

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

Then deploy the files to a static host (not the dev server) and go through the
[production security checklist](https://zoijs.dev/production-security) — security headers,
a Content-Security-Policy with your import map's hash, CSRF, and more.

## Type-check

```bash
npm run typecheck
```

Runs `tsc --noEmit` against `src/**/*.js` using `@zoijs/core`'s types — no output
files, just type errors if any. Wire it into CI or your editor.

## How the typing works

- `// @ts-check` at the top of a file turns on type-checking for that file.
- `@typedef` / `@type` JSDoc comments add your own types (see `src/app.js`).
- `@zoijs/core` ships `.d.ts`, so `createState`, `html`, `each`, etc. are fully
  typed — e.g. `createState<Todo[]>(…)` gives you a typed list.

Prefer authoring real `.ts`? You can, but it would require adding a `tsc` compile
step — the one thing Zoijs avoids. This template keeps the no-build promise.

## Project layout

```
{{APP_NAME}}/
  index.html            import map + #app mount point
  tsconfig.json         strict, checkJs, noEmit (type-check only)
  dev-server.mjs        tiny zero-dependency static server (npm run dev)
  src/
    app.js              your app, typed with @ts-check
    style.css           plain CSS
```

No bundler, no build step. Open the files and read them. Learn more at
[zoijs.dev](https://zoijs.dev).
