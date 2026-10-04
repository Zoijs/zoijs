# Admin Dashboard — Zoijs ecosystem showcase

A fuller, production-shaped app built **entirely from plain files** — no build step,
no global store, no providers. It puts most of the Zoijs ecosystem to work together:

| Package | Used for |
|---|---|
| `@zoijs/core` | `html` / `mount` / `each` / `computed` / `createState` / `effect` |
| `@zoijs/router` | sidebar pages, active links, `:id` params, programmatic navigation |
| `@zoijs/resource` | loading stats and users (reads) |
| `@zoijs/action` | activate / deactivate / delete / save (writes) |
| `@zoijs/head` | per-page `<title>` + meta description |
| `@zoijs/storage` | theme and language, persisted across reloads |
| `@zoijs/forms` | the settings form — values, errors, touched, validation |
| `@zoijs/i18n` | a reactive locale (English / French) with `Intl` number formatting |

## Run it

No build step. Serve the repo root and open the app:

```bash
# from this folder
npm run dev
# then open http://localhost:3520/examples/admin/   (keep the trailing slash)
```

The import map in `index.html` maps each `@zoijs/*` package to its local source, so the
browser loads everything directly — exactly what you'd publish to a static host.

## What to look at

- **`app.js`** — every page is a plain function returning `html`. Read it top to bottom.
- **Fine-grained updates** — toggling a user, typing in the search box, or switching
  language updates only the affected nodes; setup runs once, there is no re-render.
- **One read, many writes** — a list is a `resource`; each mutation is an `action` that
  `refresh()`es the read. No cache to manage.
- **Persisted preferences** — the theme and language are `@zoijs/storage` values; reload
  and they stick. An `effect` syncs the theme to `<html data-theme>` and the locale to
  i18n.
- **Safe by default** — every value is rendered as inert text and every URL is
  scheme-checked, so user data can't inject. No `innerHTML` anywhere.

## Tests

```bash
npm run test:browser   # Playwright smoke tests across Chromium, Firefox, WebKit
```
