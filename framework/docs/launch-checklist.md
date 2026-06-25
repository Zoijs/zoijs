# Zoijs public launch checklist

Living status of the Zoijs public release. Last updated: 2026-06-25.

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

## GitHub releases — ✅ created

All five Releases are published from the tags with full notes (name, version,
install, API, problem solved, limitations, npm + docs links). `core-v1.0.0` is
marked **Latest**.

## CI — ✅ green

The Actions workflow passes on `main`: Node 20/22/24 matrix (unit + types) and
the browser job (Chromium / Firefox / WebKit in the Playwright container). The
publish workflow correctly skips (versions already on npm).

## Documentation — ✅ links valid

All 121 internal doc links across the root README, docs hub, ecosystem,
deployment, GitHub Pages recipe, Task Board, and the four package READMEs resolve
to real files (0 broken). Content covers install (npm + CDN), the ecosystem, the
Task Board demo, deployment + SPA fallback, and the GitHub Pages recipe.

## Website — ✅ docs live (zoijs.dev) · ⚠️ zoijs.com pending

**[zoijs.dev](https://zoijs.dev)** is **live** — the documentation site, built
with Zoijs itself (core + router + head), deployed on Cloudflare Pages with a
light/dark theme and an SPA fallback for deep links. Verified end to end (DNS,
serving, fallback, dark mode). Its source is a separate private repo
(`Zoijs/zoijs-site`) that auto-redeploys on every push to `main`.

`https://zoijs.com` (the marketing landing) is **not live yet** (no connection).

## GitHub repository — ✅ public & protected

`https://github.com/Zoijs/zoijs` is public. `main` is protected by a ruleset
(PR + 1 approving Code-Owner review, required CI checks, conversations resolved,
no force-push/deletion; admins bypass for their own PRs). Squash-only merges with
auto-deleted head branches; Dependabot, secret scanning + push protection, and
private vulnerability reporting are enabled.

## Examples — ✅ working

Task Board (all five packages) plus per-package examples; verified end-to-end in
real browsers (Chromium/Firefox/WebKit) and via the preview server.

## Known limitations (shipped, by design)

- Client-side only — no SSR/prerender (affects SEO for content sites).
- Router is history-mode (needs a server SPA fallback for deep-link refreshes),
  no nested outlets / guards / loaders.
- resource/action: no cache, dedupe, retries, or optimistic updates.
- head: client-side, `name`-based meta only.

## Launched ✅

npm packages, GitHub Releases, public + protected repo, green CI, and the live
docs site at **[zoijs.dev](https://zoijs.dev)** are all done. Zoijs is publicly
launched.

## Remaining (nice-to-have)

1. ⚠️ **Stand up zoijs.com** — the marketing landing (zoijs.dev docs are live).
2. ⬜ **`www → apex` redirect** so `zoijs.dev` is the single canonical URL.

## Next milestone

A short "Getting started" landing page at **zoijs.com** that funnels to the docs,
plus growing the example gallery. The core launch is complete; from here it's
content and polish.
