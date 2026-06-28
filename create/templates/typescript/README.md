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
