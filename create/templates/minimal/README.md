# {{APP_TITLE}}

The smallest possible [Zoijs](https://zoijs.dev) app — **two source files, no install,
no build step.** A blank canvas.

## Run it

```bash
npm run dev
```

Then open <http://localhost:7310>. No `npm install` needed: `@zoijs/core` comes from the
CDN, and `npm run dev` just runs `node dev-server.mjs` — a tiny static server that
ships in this folder (Node built-ins only, nothing is downloaded). It is for
**development only**: it listens on `127.0.0.1`, never serves dotfiles (`.env`, `.git/`)
or anything outside this folder, and falls back to 7311–7313 if 7310 is busy. To try the
app from a phone on your network, opt in with `ZOIJS_HOST=0.0.0.0 npm run dev` (anyone
on that network can then read these files while it runs).

Any other static file server works too, but `file://` doesn't — browsers won't load
ES modules from disk.


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
- `dev-server.mjs` + `package.json` — the local development server and its `dev` script
  (no dependencies). Don't deploy them; deploy `index.html` and `app.js`.

That's the whole project. Edit `app.js` and reload — there is nothing to build.

## Growing up

When you want local packages instead of the CDN, or a few components to organize,
scaffold a fuller starter:

```bash
npm create zoijs@latest my-app                  # the app dashboard
npm create zoijs@latest my-app --template basic # a basic counter
```

Learn more at [zoijs.dev](https://zoijs.dev).
