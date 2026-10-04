# Releasing

How to cut a release of any Zoijs package. Short version: **bump the version, merge to
`main`, push a `<package>-v<version>` tag — CI tests and publishes it. Nobody publishes
from a laptop.** Then sync the docs-site CDN pins.

## How a package is published

Every one of the 14 packages (`core`, `router`, `resource`, `action`, `head`, `forms`,
`storage`, `i18n`, `ssr`, `sanitize`, `testing`, `devtools`, `eslint-plugin`, `create`)
publishes the same way, through [`publish.yml`](../../.github/workflows/publish.yml):

1. **Bump** the package's `version`, update its `CHANGELOG.md`/README, and merge to `main`
   through a reviewed pull request (CI must be green).
2. **Tag** the merge commit with the package and version — the existing convention:

   ```sh
   git tag core-v1.9.0        # router-v0.6.0, eslint-plugin-v0.4.0, create-v0.1.5, …
   git push origin core-v1.9.0
   ```

3. **CI does the rest** — only a tag matching `*-v<digit>…` triggers it:
   - the **full CI suite** (unit + types on Node 20/22/24, real browsers, tarball checks)
     runs at the tagged commit — the same workflow pull requests run;
   - **verify**: the tagged commit must be on `main`; `scripts/release-check.mjs` checks the
     tag matches the package's `name`/`version`, that the package has no npm lifecycle
     scripts, that its tarball has no tests/secrets/local config, and that the **lowest core
     version its peer range allows exports every `@zoijs/core/*` subpath it imports**; and the
     version must not already be on npm;
   - **publish**: runs in the protected **`npm-release`** environment (a maintainer approves
     it), with `npm publish --access public --provenance --ignore-scripts`.

Branch pushes, pull requests (including from forks) and manual runs cannot publish. Run the
same checks locally any time: `npm run release:check -- core-v1.9.0` (add `--offline` to
skip the npm-registry checks) or `npm run release:check -- --all --offline`.

## Security model

- **No long-lived npm token.** Publishing uses **npm Trusted Publishing**: GitHub Actions
  mints a short-lived OIDC identity for the publish job (`id-token: write` exists on that
  one job only) and npm accepts it only from this repository, this workflow and the
  `npm-release` environment. There is no `NPM_TOKEN` secret to steal.
- **Provenance.** npm attaches a signed provenance statement (which repo, commit and
  workflow built it) to every package published this way; it's shown on npmjs.com.
- **Least privilege.** Every workflow defaults to `contents: read`; checkouts don't
  persist credentials; no job uses `pull_request_target`.
- **Immutable dependencies.** Actions are pinned to full commit SHAs (with a `# vX.Y.Z`
  comment) and the Playwright image by `sha256` digest. Dependabot proposes action-pin
  updates; bump the Playwright image tag + digest together with `@playwright/test`.
- **Reproducible installs.** CI installs with `npm ci --ignore-scripts` (`npm run ci:all`):
  exactly the committed lockfiles, and no dependency install scripts. (None are needed —
  the only ones in the tree are `fsevents`, macOS-only, and `sharp` in the private,
  never-installed `assets` package.) Publishing runs no scripts either.

## One-time setup (outside the repository)

These can't be configured from repository files; a maintainer does them once:

1. **npm → each package → Settings → Trusted Publisher → GitHub Actions**: owner `Zoijs`,
   repository `zoijs`, workflow `publish.yml`, environment `npm-release`. Do this for all
   14 packages (all already exist on npm, so no first publish is needed).
2. Then, per package, **Settings → Publishing access → "Require two-factor authentication
   and disallow tokens"**, and **revoke the old `NPM_TOKEN`** automation token on npm and
   delete the `NPM_TOKEN` repository secret on GitHub.
3. **GitHub → Settings → Environments → `npm-release`**: required reviewer(s); deployment
   branches/tags limited to tags matching `*-v*`; no secrets.
4. **GitHub → Settings → Rules**: protect tags matching `*-v*` (only maintainers may create
   or delete them) and keep `main` requiring review from Code Owners (`.github/` is owned).

## Emergencies

There is no supported laptop-publish path. If CI publishing is unavailable and a security
fix can't wait: use a **granular, single-package, short-expiry** npm token created for that
one publish, run `npm run ci:all && npm test && npm run release:check -- <tag>` on a clean
checkout of the tagged commit, publish with `npm publish --access public --ignore-scripts`,
then **revoke the token immediately** and note it in the CHANGELOG. (A laptop publish has no
provenance.) Never share or paste an npm OTP/token into a tool or chat.

## Order

Each optional package only **peer-depends on `@zoijs/core`**, so they're independent of
one another and can publish in any order. The single ordering rule:

> If a package raises its **required core version**, publish `@zoijs/core` first so the new
> peer range is satisfiable for installers. (The release check enforces this: it fails if
> the floor of a package's core peer range isn't on npm yet, or lacks a subpath it imports.)

(Today only `@zoijs/ssr` pins `^1.6.0`; core 1.6.0 is already live, so there's nothing to
sequence.)

## Before tagging

- The package's `version`, `CHANGELOG.md`, and README are updated and merged to `main`.
- Its `@zoijs/core` peer range starts at a core version that really has what it imports.
- `npm run release:check -- <package>-v<version>` passes locally.

## Versions a release must line up

Compatibility floors live in [`scripts/zoijs-compat.json`](../../scripts/zoijs-compat.json):
the first core version providing each import, the security floor for generated apps, and
`nextCore`. The release check enforces it:

- a package's `@zoijs/core` peer floor must provide every core subpath and named export it
  imports (checked against the table offline, and against the published tarball online);
- a package that needs a capability marked `"next"` (unreleased) is **blocked** until
  `nextCore` is set to the version that core release will carry and its floor is raised —
  today: **`@zoijs/resource` and `@zoijs/action`** (they import `@zoijs/core/internal`) and
  **`create-zoijs`** (its templates use the production entry, `src/prod.js`);
- no shipped file may use a floating or build-service Zoijs CDN URL;
- `create-zoijs` targets one exact, published core (`create/core-cdn.json`), at or above the
  security floor, whose integrity map matches the published files.

**Releasing the next core** (the order matters):

1. Choose its version, set `"nextCore"` in `scripts/zoijs-compat.json`, replace the `"next"`
   capabilities with it, and release `@zoijs/core` (tag `core-v<version>`).
2. Raise `@zoijs/resource` and `@zoijs/action`'s peer floor to `^<version>` (regenerate their
   lockfiles with `npm install --package-lock-only --ignore-scripts`) and release them.
3. Regenerate the scaffolder's target from the published files —
   `node scripts/cdn-importmap.mjs @zoijs/core@<version> --write create/core-cdn.json` — and
   release `create-zoijs`. Then set `"nextCore"` back to `null`.

## After publishing: sync the docs site

The site (outside this repo) loads packages with an import map. Use **exact versions** and
**integrity hashes**, never loose pins (`@zoijs/core@1`) or a build-service CDN: generate the
map with `node scripts/cdn-importmap.mjs @zoijs/core@<v> @zoijs/router@<v> …` and replace the
site's import map with it.

1. **Update the map only *after* the new versions are on npm** — generating ahead of the
   publish fails (the tarball doesn't exist yet), and pointing at it would 404 the site.
2. Regenerate the whole map whenever any loaded package changes version: URLs and
   integrity hashes must move together.
3. Re-run the site build (`npm run build`, which re-prerenders) and deploy.
4. Packages the site doesn't load at runtime — `@zoijs/ssr`, `@zoijs/testing`,
   `@zoijs/devtools`, `@zoijs/eslint-plugin`, `create-zoijs` — need no entry.
