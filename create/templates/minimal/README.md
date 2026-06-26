# {{APP_TITLE}}

The smallest possible [Zoijs](https://zoijs.dev) app — **two files, no install, no
build step.** A blank canvas.

## Run it

Any static file server works. The simplest:

```bash
npx serve . -l 7310
```

Then open <http://localhost:7310>.

## What's here

- `index.html` — loads `@zoijs/core` from a CDN (pinned to the `v1` major) and
  mounts `app.js`.
- `app.js` — a counter: state, markup, and one `mount` call.

That's the whole project. Edit `app.js` and reload — there is nothing to build.

## Growing up

When you want local packages instead of the CDN, or a few components to organize,
scaffold a fuller starter:

```bash
npm create zoijs@latest my-app                  # the app dashboard
npm create zoijs@latest my-app --template basic # a basic counter
```

Learn more at [zoijs.dev](https://zoijs.dev).
