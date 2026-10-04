# Changelog

All notable changes to `create-zoijs` are documented here.

## Unreleased

### Security
- **Generated apps pin `@zoijs/core` exactly and securely (SEC-7).** Templates allowed `^1.1.0` /
  `^1.2.0` (older than the 1.7.0 URL-guard fixes), and the `minimal` template loaded a floating
  `esm.sh/@zoijs/core@1` URL with no integrity check. Every template now takes its core version from
  one file, `core-cdn.json` (an exact, published version plus a jsDelivr import map with a sha384
  integrity hash for every module file, generated from the npm tarball and verified at release):
  package templates get `^<that version>`, and `minimal` gets the exact, integrity-pinned import map.
- **Hardened the scaffolded dev server (SEC-6)** (templates `app`, `basic`, `typescript`).
  It listened on every network interface, served dotfiles (`/.env`, `/.git/config`, `.npmrc`)
  and followed symlinks out of the project to anyone on the LAN, and a malformed URL such as
  `/%E0` crashed it. It now listens on `127.0.0.1` only (opt into the LAN explicitly with
  `ZOIJS_HOST=0.0.0.0`, which prints a warning), never serves a path with a dot-segment,
  confines every file — including symlink targets — to the project folder (package-manager
  links under `node_modules/` excepted), answers malformed or null-byte paths with `400`
  and keeps running, and sends `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
  `npm run dev` and the URL it prints are unchanged.
- **The `minimal` template no longer recommends `npx serve`.** `npx serve . -l 7310`
  downloaded a mutable package at run time and used that package's own (non-loopback)
  defaults. `minimal` now ships the same hardened `dev-server.mjs` as the other templates,
  plus a dependency-free `package.json` whose `dev` script runs it — still nothing to
  install (`@zoijs/core` stays on the integrity-pinned CDN). All four template copies of
  the server are byte-identical, and a test enforces that.

### Changed
- **Deploy guidance for the production entry (SEC-4).** Every app template's README and
  `index.html` explain switching the import map to `@zoijs/core`'s production entry
  (`src/prod.js`: no dev warnings, no devtools hook) before deploying. `minimal`'s map
  already carries the integrity hash for `prod.js`.
- **"Next steps" match the template.** `minimal` prints `npm run dev` with no install step;
  `library` prints `npm install` / `npm test` instead of a `dev` script it doesn't have.

### Release note
- Templates use `@zoijs/core` from `core-cdn.json`. That file (and with it the
  `minimal` import map) moves to the next core version only after that core is on npm,
  so `create-zoijs` is published **last** — `release:check` reports it as BLOCKED until
  then (see `framework/docs/releasing.md`).

## 0.1.4 — 2026-06-27

Scaffolded apps now come with editor config for a great out-of-the-box experience —
no toolchain required. The CLI API and the app code are unchanged.

- **`.vscode/extensions.json`** (templates `app`, `basic`, `typescript`, `library`) —
  recommends a highlighter for `` html`` `` templates (`bierner.lit-html`), the ESLint
  extension, and Prettier. VS Code suggests them when you open the project.
- **`jsconfig.json`** (templates `app`, `basic`) — IntelliSense (autocomplete, hover,
  go-to-definition) from the types every Zoijs package ships, with no build step. Flip
  `checkJs` on to also type-check your JavaScript. (The `typescript` and `library`
  templates already carry a `tsconfig.json`.)
- See the [Editor Setup guide](https://zoijs.dev/editor-setup).

## 0.1.3 — 2026-06-26

Three new templates (now five total). No change to existing templates or the CLI
API; `app` stays the default.

- **`typescript`** — the counter as **type-checked JavaScript**: `// @ts-check` +
  a strict `tsconfig.json` + `npm run typecheck` (`tsc --noEmit`) give full
  TypeScript safety using `@zoijs/core`'s shipped types, with **no build step** (the
  browser runs the `.js` as-is). Keeps the dev server on 7310.
- **`minimal`** — the smallest scaffold: two flat files (`index.html` + `app.js`)
  loading `@zoijs/core` from a CDN. No `package.json`, no install, no dev server —
  run with `npx serve . -l 7310`.
- **`library`** — a starter for authoring a Zoijs-based package: `src/index.js` +
  hand-written `index.d.ts`, an `exports`/`types` `package.json` with a peer
  dependency on `@zoijs/core`, and a `node:test` suite — the shape the official
  optional packages use.
- The scaffolder now treats `.ts`/`.d.ts` as text (token substitution), and the
  CLI's own `npm test` targets its own test file so it no longer runs the
  templates' bundled test files.

## 0.1.2 — 2026-06-26

Dev-server output polish. No CLI API changes; same zero-dependency server on the
same ports.

- **Cleaner banner:** `npm run dev` now prints a tidy banner with the local URL
  on its own line, and only mentions fallback ports when one was actually busy:

  ```text
    Zoijs dev server

    - Local:  http://localhost:7310
  ```

  (Previously a single `ZoiJS dev server: http://localhost:7310` line plus a
  static `If busy: …` note.) Plain ASCII so it renders cleanly in every terminal,
  including the Windows console. Brand casing normalized to **Zoijs**. Still port
  **7310** with **7311 / 7312 / 7313** fallbacks; still Node built-ins only.

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
