# Releasing

How to cut a release across the Zoijs packages. Short version: **the core publishes
itself on push; everything else is a manual `npm publish`; then sync the docs-site CDN
pins.**

## How each package publishes

- **`@zoijs/core`** — *automatic*. Pushing a change under `framework/**` to `main` runs
  [`publish.yml`](../../.github/workflows/publish.yml): it runs the tests and publishes
  **only if `framework/package.json`'s version is new** (npm versions are immutable, so an
  un-bumped push is a safe no-op). To release the core: bump its version, push, done. CI
  uses the `NPM_TOKEN` secret.
- **Every other package** — *manual*. The optional packages, `create-zoijs`, and
  `@zoijs/eslint-plugin` are published by hand from their own directory:

  ```sh
  cd <package> && npm publish --access public
  ```

  `--access public` is required (scoped `@zoijs/*` packages default to private). You run
  these under your own `npm login` — the CI token only covers the core. **Never share or
  paste an npm OTP/token into a tool or chat;** run the publish yourself.

## Order

Each optional package only **peer-depends on `@zoijs/core`**, so they're independent of
one another and can publish in any order. The single ordering rule:

> If a package raises its **required core version**, publish `@zoijs/core` first so the new
> peer range is satisfiable for installers.

(Today only `@zoijs/ssr` pins `^1.6.0`; core 1.6.0 is already live, so there's nothing to
sequence.)

## Before publishing

- Root `npm test` is green — gates (supply-chain, doc-coverage, size) plus every package.
  (CI runs this for the core.)
- The package's `version`, `CHANGELOG.md`, and README are updated.
- `npm publish --dry-run` to eyeball the tarball contents.

## After publishing: sync the docs site

The site loads packages from esm.sh via **major/minor-pinned** import-map entries in the
site's `prerender.mjs` (and the prerendered HTML). The pins are intentionally loose:

| Pin | Auto-picks | Needs a manual bump when… |
|---|---|---|
| `@zoijs/core@1` | latest `1.x` | a new **major** ships |
| `@zoijs/router@0.2` | latest `0.2.x` | crossing a **0.x minor** (e.g. `0.2 → 0.3`) |
| `@zoijs/head@0.1` | latest `0.1.x` | crossing a 0.x minor |
| `@zoijs/resource@0.1` | latest `0.1.x` | crossing a 0.x minor |
| `@zoijs/action@0.1` | latest `0.1.x` | crossing a 0.x minor |

Rules:

1. **Bump a pin only *after* the new version is on npm** — bumping ahead of the publish
   404s the live site.
2. Bumping across a 0.x minor is **optional unless the site uses the new feature**: a
   minor bump is backward-compatible, so the old pin keeps working. Bump for freshness /
   doc-code parity.
3. After changing a pin, re-run the site build (`npm run build`, which re-prerenders) and
   deploy.
4. Packages the site doesn't load at runtime — `@zoijs/ssr`, `@zoijs/testing`,
   `@zoijs/devtools`, `@zoijs/eslint-plugin`, `create-zoijs` — have **no pin to touch**.

## Worked example

A multi-package release (the state as of 2026-06-27):

| Package | npm | publish | site pin |
|---|---|---|---|
| `@zoijs/core` | 1.6.0 | — (already live via CI) | `@1` ✓ no change |
| `@zoijs/eslint-plugin` | — | **0.2.0 (first publish)** | n/a |
| `@zoijs/head` | 0.1.0 | 0.1.1 | `@0.1` ✓ auto |
| `@zoijs/resource` | 0.1.0 | 0.2.0 | `@0.1 → @0.2` (optional, after publish) |
| `@zoijs/router` | 0.2.0 | 0.3.0 | `@0.2 → @0.3` (optional, after publish) |
| `@zoijs/ssr` | 0.2.0 | 0.3.0 | n/a |
| `create-zoijs` | 0.1.3 | 0.1.4 | n/a |

1. **Push** this branch — CI re-runs the core's tests and skips its publish (1.6.0 already
   on npm). No-op for the core, by design.
2. **Publish the manual packages** (any order) — from the repo root, `npm publish <folder>`
   packs that folder, so no `cd` is needed:

   ```sh
   npm publish ./eslint-plugin --access public
   npm publish ./head          --access public
   npm publish ./resource      --access public
   npm publish ./router        --access public
   npm publish ./ssr           --access public
   npm publish ./create        --access public
   ```

   If npm prompts for a one-time password, append `--otp=<6-digit code>`. To avoid OTP
   prompts entirely, put an **Automation** (or Granular) token in `~/.npmrc` as
   `//registry.npmjs.org/:_authToken=<token>` — Automation tokens bypass 2FA. Preview any
   of them first with `--dry-run` in place of `--access public`.
3. **Sync the site**: bump `@zoijs/router@0.2 → @0.3` (and optionally `@zoijs/resource@0.1
   → @0.2`) in `prerender.mjs`, `npm run build`, deploy. Everything else is in-range.
