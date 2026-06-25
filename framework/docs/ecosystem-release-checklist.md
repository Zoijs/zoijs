# Zoijs ecosystem release checklist

Living status of the published Zoijs ecosystem. Last updated: **2026-06-25**.

Legend: ✅ done · ⚠️ needs attention · ⬜ not started

This file tracks the **whole ecosystem** (core + six optional packages). For the
broader public-launch status see [`launch-checklist.md`](launch-checklist.md).

## Published packages — ✅ all live on npm

All seven packages are on the public registry. Each optional package
peer-depends on `@zoijs/core ^1.0.0`, is MIT licensed, ships `src/` + README +
LICENSE + CHANGELOG, and is `type: module` with `sideEffects: false`.

| Package | Version | Install | npm |
|---|---|---|---|
| `@zoijs/core` | 1.0.0 | `npm i @zoijs/core` | https://www.npmjs.com/package/@zoijs/core |
| `@zoijs/router` | 0.1.0 | `npm i @zoijs/router` | https://www.npmjs.com/package/@zoijs/router |
| `@zoijs/resource` | 0.1.0 | `npm i @zoijs/resource` | https://www.npmjs.com/package/@zoijs/resource |
| `@zoijs/head` | 0.1.0 | `npm i @zoijs/head` | https://www.npmjs.com/package/@zoijs/head |
| `@zoijs/action` | 0.1.0 | `npm i @zoijs/action` | https://www.npmjs.com/package/@zoijs/action |
| `@zoijs/storage` | 0.1.0 | `npm i @zoijs/storage` | https://www.npmjs.com/package/@zoijs/storage |
| `@zoijs/forms` | 0.1.0 | `npm i @zoijs/forms` | https://www.npmjs.com/package/@zoijs/forms |

## Git tags

| Tag | Status |
|---|---|
| `core-v1.0.0` | ✅ pushed |
| `router-v0.1.0` | ✅ pushed |
| `resource-v0.1.0` | ✅ pushed |
| `head-v0.1.0` | ✅ pushed |
| `action-v0.1.0` | ✅ pushed |
| `storage-v0.1.0` | ⬜ **missing — needs creating** |
| `forms-v0.1.0` | ⬜ **missing — needs creating** |
| `v1.0.0` (bare) | ⚠️ duplicate of `core-v1.0.0` — candidate for deletion |

## GitHub releases

| Release | Status |
|---|---|
| `core-v1.0.0` (marked Latest) | ✅ published |
| `router-v0.1.0` | ✅ published |
| `resource-v0.1.0` | ✅ published |
| `head-v0.1.0` | ✅ published |
| `action-v0.1.0` | ✅ published |
| `storage-v0.1.0` | ⬜ **missing — draft ready (see below)** |
| `forms-v0.1.0` | ⬜ **missing — draft ready (see below)** |

> The `@zoijs/storage` and `@zoijs/forms` CHANGELOGs and the docs changelog both
> point readers to the GitHub Releases page; until these two releases exist,
> those links land on an incomplete record. Closing this is the recommended next
> milestone.

## Website docs — ✅ live & complete (zoijs.dev)

- All 7 packages appear on the homepage ecosystem grid.
- Packages nav order: Router → Resource → Head → Action → Storage → Forms.
- Dedicated pages live for every package, incl. `/storage` and `/forms`.
- Changelog, Why Zoijs, and ecosystem listings include storage + forms.
- `sitemap.xml` lists all 39 routes (incl. `/storage`, `/forms`); robots + OG +
  canonical + JSON-LD present; client search index covers every page.
- ✅ Single canonical domain: **zoijs.dev** (the planned `zoijs.com` marketing
  domain was dropped; all package metadata + READMEs now point to zoijs.dev).

## CI — ✅ covers all 7 packages

`.github/workflows/ci.yml` runs the root scripts (`install:all`, `test`,
`test:types`, `test:browser`), which enumerate all seven packages plus the
Task Board demo, on a Node 20/22/24 matrix and a Playwright (Chromium/Firefox/
WebKit) container job. `publish.yml` auto-publishes **core only**; the optional
packages are published manually (npm 2FA), by design.

Local verification (2026-06-25): `npm test` ✅ green · `npm run test:types` ✅
green (7× `tsc --noEmit`, 0 errors). Browser suite not re-run locally (expensive;
runs in CI).

## Known limitations (shipped, by design)

- Client-side only — no SSR; docs site is statically **prerendered** for SEO.
- Router is history-mode, no nested outlets / guards / loaders.
- resource/action: no cache, dedupe, retries, or optimistic updates.
- storage: no cross-tab sync, TTL, encryption, sessionStorage/IndexedDB.
- forms: flat values only — no nested objects / field arrays / schemas / async.

## Next recommended milestone

**Complete the GitHub release/tag set.** Create `storage-v0.1.0` and
`forms-v0.1.0` tags + Releases (drafts prepared), and delete the duplicate bare
`v1.0.0` tag. This is the only place where the published state (npm + docs) and
the GitHub source-of-record diverge; closing it finishes a clean, trustworthy
public milestone with no new framework surface area.
