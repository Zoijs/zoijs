# Changelog

All notable changes to `create-zoijs` are documented here.

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
