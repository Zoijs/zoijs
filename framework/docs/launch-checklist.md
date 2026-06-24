# Zoijs public launch checklist

Living status of the Zoijs public release. Last updated: 2026-06-24.

Legend: ✅ done · ⚠️ needs attention · ⬜ not started · ❔ unverified here

## npm packages — ✅ published & verified

All five packages are live on the public npm registry and were verified by a
clean `npm install` + import + a DOM-free reactivity smoke test from a temp folder.

| Package | Version | Install | npm |
|---|---|---|---|
| @zoijs/core | 1.0.0 | `npm i @zoijs/core` | https://www.npmjs.com/package/@zoijs/core |
| @zoijs/router | 0.1.0 | `npm i @zoijs/router` | https://www.npmjs.com/package/@zoijs/router |
| @zoijs/resource | 0.1.0 | `npm i @zoijs/resource` | https://www.npmjs.com/package/@zoijs/resource |
| @zoijs/head | 0.1.0 | `npm i @zoijs/head` | https://www.npmjs.com/package/@zoijs/head |
| @zoijs/action | 0.1.0 | `npm i @zoijs/action` | https://www.npmjs.com/package/@zoijs/action |

Verified API surface: core exports `html, mount, createState, computed, each,
configure, onCleanup`; `createRouter`; `resource`; `title, description, meta`;
`action`. Peer dependency `@zoijs/core` resolves automatically.

## Git tags — ✅ created & pushed

`core-v1.0.0`, `router-v0.1.0`, `resource-v0.1.0`, `head-v0.1.0`, `action-v0.1.0`
— annotated, pushed to `origin`, all pointing at the finalized `main`.

## GitHub releases — ⬜ pending (manual step)

Tags exist; the Releases themselves still need to be created. The CLI here has no
`gh` and no GitHub token, so this is a manual step (web UI or `gh release create`).
Draft notes are prepared per package (name, version, install, API, problem solved,
limitations, npm + docs links).

## CI — ❔ confirm in the browser

The repo is private, so the GitHub Actions API can't be read without auth from
this environment. Confirm the latest run on the Actions tab is green. Recent CI
work (all pushed): Node 20/22/24 matrix, built-in test discovery, `actions/*@v5`,
browser tests in the Playwright container with `HOME=/root` (Chromium + WebKit
were already green; the last fix targets Firefox).

## Documentation — ✅ links valid

All 121 internal doc links across the root README, docs hub, ecosystem,
deployment, GitHub Pages recipe, Task Board, and the four package READMEs resolve
to real files (0 broken). Content covers install (npm + CDN), the ecosystem, the
Task Board demo, deployment + SPA fallback, and the GitHub Pages recipe.

## Website — ⚠️ not live yet

`https://zoijs.com` and `https://zoijs.dev` did not respond (no connection). The
docs reference them throughout, so they 404/dead-link for visitors until the
sites are up. Until then, point users at the npm pages and the in-repo docs.

## GitHub repository — ⚠️ private

`https://github.com/Zoijs/zoijs` returns 404 to anonymous visitors (private repo).
The npm packages' `repository`, `homepage`, and `bugs` links and the README CI
badge therefore don't work for the public. **Make the repo public** to complete
the launch.

## Examples — ✅ working

Task Board (all five packages) plus per-package examples; verified end-to-end in
real browsers (Chromium/Firefox/WebKit) and via the preview server.

## Known limitations (shipped, by design)

- Client-side only — no SSR/prerender (affects SEO for content sites).
- Router is history-mode (needs a server SPA fallback for deep-link refreshes),
  no nested outlets / guards / loaders.
- resource/action: no cache, dedupe, retries, or optimistic updates.
- head: client-side, `name`-based meta only.

## Blockers before calling it "publicly launched"

1. ⚠️ **Make the GitHub repo public** (unblocks repo links + the CI badge).
2. ⚠️ **Stand up zoijs.com / zoijs.dev** (or remove the references until ready).
3. ⬜ **Create the GitHub Releases** for the five tags.
4. ❔ **Confirm CI is green** on the latest commit.

## Next milestone

A documentation website at **zoijs.dev** (the docs already exist as Markdown in
`framework/docs/` — publish them with any static-site generator or even raw
GitHub Pages) + a short "Getting started" landing on **zoijs.com**. That, plus
flipping the repo public, is what turns "published on npm" into "launched."
