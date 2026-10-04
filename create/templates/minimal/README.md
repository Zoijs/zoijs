# {{APP_TITLE}}

The smallest possible [Zoijs](https://zoijs.dev) app — **two files, no install, no
build step.** A blank canvas.

## Run it

Any static file server works. The simplest:

```bash
npx serve . -l 7310
```

Then open <http://localhost:7310>.


## Deploy

In `index.html`, point `"@zoijs/core"` at the production entry —
`{{ZOIJS_CORE_CDN}}prod.js` (its integrity hash is already in the map) — so
development warnings and the devtools hook are off. Keep the exact version; to upgrade,
change it deliberately and update every URL and integrity hash together.

Before going live, go through the
[production security checklist](https://zoijs.dev/production-security) — your CSP must
allow `https://cdn.jsdelivr.net` and your import map's hash.

## What's here

- `index.html` — loads `@zoijs/core` {{ZOIJS_CORE_VERSION}} from jsDelivr (that exact version,
  integrity-checked) and mounts `app.js`.
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
