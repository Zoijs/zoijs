# Changelog

All notable changes to `create-zoijs` are documented here.

## 0.1.1 — 2026-06-25

Starter polish. No CLI API changes.

- **Dev server:** generated apps now run `npm run dev` on a tiny zero-dependency
  static server (`dev-server.mjs`, Node built-ins only) that uses port **7310**
  and falls back to **7311 / 7312 / 7313** if busy — replacing the old default
  of port 3000. It prints `ZoiJS dev server: http://localhost:<port>`.
- **Default `app` template redesigned** into a polished "project dashboard":
  a hero header, a reusable `StatCard` (used ×4), filter chips (All / Active /
  Done), an empty state, and a developer-hint footer — demonstrating component
  composition, conditional rendering, and filtering alongside `createState` /
  `computed` / `each` and parent⇄child communication. Still depends only on
  `@zoijs/core`; still no build step.
- **`basic` template** keeps the minimal counter and adopts the same dev server.

## 0.1.0 — 2026-06-25

Initial release of the Zoijs starter CLI.

- `npm create zoijs@latest my-app` — scaffold a new Zoijs app in one command.
- Uses the provided folder name as the project name; derives `package.json`
  `name` (lowercased) and a readable `index.html` `<title>` from it.
- Two templates: `app` (default — a small task dashboard demonstrating
  `html` / `mount` / `createState` / `computed` / `each` and parent⇄child
  communication) and `basic` (a minimal counter). Select with `--template`.
- Validates the project name (npm-safe) and refuses to overwrite a non-empty
  directory.
- Generated apps are plain HTML/CSS/JS with **no build step** and depend only on
  `@zoijs/core` (served via an import map from `node_modules`).
- Zero runtime dependencies; the CLI is a single small file.
