# Releasing

How to cut a release of any Zoijs package. Short version: **bump the version, merge to
`main`, push a `<package>-v<version>` tag — CI tests and publishes it. Nobody publishes
from a laptop.** Then sync the docs-site CDN pins.

## How a package is published

Every one of the 15 packages (`core`, `router`, `resource`, `action`, `head`, `forms`,
`storage`, `i18n`, `ssr`, `sanitize`, `testing`, `devtools`, `eslint-plugin`, `create`, `api`)
publishes the same way — after its first version exists on npm (see
[First publish of a new package](#first-publish-of-a-new-package)), through [`publish.yml`](../../.github/workflows/publish.yml):

1. **Bump** the package's `version`, update its `CHANGELOG.md`/README, and merge to `main`
   through a reviewed pull request (CI must be green).
2. **Tag** the merge commit with the package and version — the existing convention:

   ```sh
   git tag core-v1.9.0        # router-v0.6.0, eslint-plugin-v0.4.0, create-v0.1.5, …
   git push origin core-v1.9.0
   ```

3. **CI does the rest** — only a tag matching `*-v<digit>…` triggers it:
   - the **full CI suite** (unit + types on Node 22/24, real browsers, tarball checks)
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
  comment) and the Playwright image by `sha256` digest. Updates are made by hand: move the
  SHA and its comment together, and bump the Playwright image tag + digest with `@playwright/test`.
- **Dependency checks** (see [below](#dependency-checks)): every lockfile is audited for known
  vulnerabilities and checked against a license policy on every pull request and weekly.
- **Reproducible installs.** CI installs with `npm ci --ignore-scripts` (`npm run ci:all`):
  exactly the committed lockfiles, and no dependency install scripts. (None are needed —
  the only ones in the tree are `fsevents`, macOS-only, and `sharp` in the private,
  never-installed `assets` package.) Publishing runs no scripts either.

## One-time setup (outside the repository)

These can't be configured from repository files; a maintainer does them once:

1. **npm → each package → Settings → Trusted Publisher → GitHub Actions**: owner `Zoijs`,
   repository `zoijs`, workflow `publish.yml`, environment `npm-release`. Do this for every
   package. The first 14 already exist on npm; a package that doesn't yet (such as
   `@zoijs/api`) needs the one-time bootstrap below first.
2. Then, per package, **Settings → Publishing access → "Require two-factor authentication
   and disallow tokens"**, and **revoke the old `NPM_TOKEN`** automation token on npm and
   delete the `NPM_TOKEN` repository secret on GitHub.
3. **GitHub → Settings → Environments → `npm-release`**: required reviewer(s); deployment
   branches/tags limited to tags matching `*-v*`; no secrets.
4. **GitHub → Settings → Rules**: protect tags matching `*-v*` (only maintainers may create
   or delete them) and keep `main` requiring review from Code Owners (`.github/` is owned).

## First publish of a new package

npm can only attach a Trusted Publisher to a package that **already exists** on the registry,
so a brand-new package's first version can't come from `publish.yml`. Bootstrap it once,
without putting any token in CI, then switch it to the normal flow. For `@zoijs/api` 0.1.0:

1. **Merge** the release to `main` through a reviewed PR with CI green, and check locally:
   `npm run release:check -- api-v0.1.0` → `READY`.
2. **Tag and let CI vet the exact commit**: `git tag api-v0.1.0 && git push origin api-v0.1.0`.
   The full CI suite and the verify job run at the tag. When the publish job then waits for
   `npm-release` approval, **reject** it — it can't publish yet (no Trusted Publisher), and the
   tag plus green CI is the record of what gets published.
3. **Publish once from a maintainer machine**, from a clean checkout of that tag, logged in
   interactively with 2FA (`npm login`, OTP prompt) — **no automation or granular token is
   created, stored, or put in CI**:

   ```sh
   git checkout api-v0.1.0 && git status --porcelain   # must print nothing
   npm run release:check -- api-v0.1.0                 # READY
   cd api && npm publish --access public --ignore-scripts
   npm logout
   ```

4. **On npm, for the new package**: add the Trusted Publisher (owner `Zoijs`, repository
   `zoijs`, workflow `publish.yml`, environment `npm-release`), then **Publishing access →
   "Require two-factor authentication and disallow tokens"**.
5. From then on the package releases exactly like the others: bump, merge, tag; CI publishes
   with provenance.

Tradeoff: the bootstrap version carries no npm provenance statement (that needs the CI
publish); every later version does. Don't "fix" this by adding an `NPM_TOKEN` secret — that
would be a long-lived credential in CI for every future release.

## Emergencies

There is no supported laptop-publish path. If CI publishing is unavailable and a security
fix can't wait: use a **granular, single-package, short-expiry** npm token created for that
one publish, run `npm run ci:all && npm test && npm run release:check -- <tag>` on a clean
checkout of the tagged commit, publish with `npm publish --access public --ignore-scripts`,
then **revoke the token immediately** and note it in the CHANGELOG. (A laptop publish has no
provenance.) Never share or paste an npm OTP/token into a tool or chat.

## Order

Each optional package only **peer-depends on `@zoijs/core`** (a star — no package depends on
another), so apart from core they're independent and can publish in any order. Two rules:

> 1. **Core first.** A package whose `@zoijs/core` floor is a new core version waits until that
>    core is on npm (the release check reports it **BLOCKED** until then).
> 2. **`create-zoijs` after the core it scaffolds**, because its CDN map can only be generated from
>    the *published* core files.

## Merge gate (required status check)

`ci.yml` reports one aggregate check, **`CI passed`**, which succeeds only when every
`Unit + Types (Node 22/24)` leg, `Browser (Chromium / Firefox / WebKit)` **and**
`Dependencies (npm audit)` succeeded (the individual job names are kept stable too). `publish.yml` already runs the whole CI
workflow and its publish job `needs: [ci, verify]`, so nothing publishes past a red browser run.
**Merging** is gated only if the `main` ruleset requires the check — this is GitHub
configuration, outside the repository:

- *Settings → Rules → Rulesets → "Protect Main Branch" → Add rule → **Require status checks to
  pass*** → add **`CI passed`** (source: GitHub Actions), and enable **"Require branches to be up
  to date before merging"**.

`scripts/tests/ci-consistency.test.mjs` keeps the repository side honest (publish needs CI, CI
has the browser job and the gate, every Playwright suite runs in CI); it can't see the ruleset.

## Dependency checks

Published packages have **no runtime dependencies** (`scripts/check-deps.mjs`), so every
dependency in the repository is development tooling — but it runs on developer machines and in
CI, so it is checked too, direct and transitive, across all committed lockfiles:

| Check | Where | Fails on |
|---|---|---|
| Licenses — `scripts/check-licenses.mjs` (offline, reads each lockfile's declared licenses) | `npm test` → `test:deps`, in the **Unit** job | A license (or SPDX expression) outside the allow list, a package with no license, or an exception that no longer matches anything |
| Vulnerabilities — `scripts/audit-deps.mjs` (`npm audit --package-lock-only` per lockfile) | the **Dependencies (npm audit)** job, part of `CI passed`; also weekly (Monday) | Any advisory, of any severity, that isn't an accepted exception; an expired or unused exception; an audit that couldn't run (retried, then failed — never a silent pass) |
| Updates | by hand, one reviewed PR at a time (no automated update PRs) | — the audit above flags anything that needs upgrading |

The policy lives in **`scripts/dependency-policy.json`**: the allowed licenses (permissive only),
reviewed license exceptions (today: LGPL libvips binaries and the OFL-licensed Poppins font, both
used only by the private, never-shipped `assets/` scripts), and accepted vulnerabilities (none).
`npm run audit:deps` runs the audit locally; the job summary in CI has the same table: lockfile,
package, severity, direct/transitive, advisory link and available fix.

**When the audit fails:** read the advisory, then either upgrade the dependency in a pull request
(after checking compatibility — `npm audit fix` is never run by CI) or, if the vulnerable code
can't be reached from how the tool is used, add an exception with the advisory URL, the lockfile,
a specific reason and an `expires` date (weeks, not years). Expired exceptions fail the build so
they get reviewed again.

## Browser tests

Every Playwright suite starts the repository's own static server,
[`scripts/test-server.mjs`](../../scripts/test-server.mjs) (Node built-ins, 127.0.0.1 only,
`no-store`), each on its own port — never `npx serve`, which would resolve a mutable package at
test time. The port table lives in that file's header and is enforced by the consistency test.
A suite can give it a second port — another origin — for real cross-origin tests (`@zoijs/api`
uses 3901 for `createApi()` and CORS).

**Re-pushed or moved tags.** Pushing a release tag again — or moving it, e.g. after a history
rewrite — starts `publish.yml` again. If that version is already on npm, Verify packs the tagged
commit and compares it with the shasum npm recorded: identical → the run succeeds with a notice and
publishes nothing; different → the run fails (“already on npm with different contents — bump the
version”). npm versions are immutable, so a changed release always needs a new version.

## Before tagging

- The package's `version`, `CHANGELOG.md`, and README are updated and merged to `main`.
- Its `@zoijs/core` peer range starts at a core version that really has what it imports.
- `npm run release:check -- <package>-v<version>` passes locally (**READY**). Online, it also
  fails when current docs (READMEs, `docs/*.md`) pin a **stale** version of the package — an exact
  `@zoijs/<name>@x.y.z` older than npm's `latest` or newer than the release. Pinning the release
  being superseded is fine until it's published (its import maps can't be regenerated earlier).
  CHANGELOGs, RFCs and migration guides are never checked; a line containing `pin-ok` is skipped.

## Versions a release must line up

Compatibility floors live in [`scripts/zoijs-compat.json`](../../scripts/zoijs-compat.json):
the first core version providing each import (`"next"` = the coming, not-yet-versioned core),
the security floor for generated apps, and `nextCore`. `npm run release:check` gives every
package one verdict:

| Verdict | Meaning | Fails |
|---|---|---|
| **READY** | can be released now | — |
| **BLOCKED** | consistent, but waiting on order: it needs a `"next"` capability, a core version that isn't on npm yet, or (create) a CDN map from the published next core | its tag, and `--all --strict` — **not** plain `--all`, so CI stays green |
| **ERROR** | wrong metadata: a peer floor that lacks an import, a floating CDN URL, a bad integrity map, a dirty tarball, a tag/version mismatch, a README import map missing a core subpath the package imports | always |

Packages never import private core subpaths — no-build apps would need an import-map entry for
them; sibling packages that need core plumbing use the shared runtime
(`globalThis[Symbol.for("zoijs.runtime@1")]`), as `@zoijs/resource`/`@zoijs/action` do for
`onError` reporting. Public subpaths a package does import in the browser (`@zoijs/core/server`
from `@zoijs/sanitize` and `@zoijs/ssr`'s `hydrate`, `@zoijs/core/devtools` from
`@zoijs/devtools`) are mapped automatically by `scripts/cdn-importmap.mjs`, with integrity.

**Releasing the next core** — three states, each with green CI:

1. **Development** (`"nextCore": null`). Next-only capabilities are marked `"next"`; packages
   needing them are BLOCKED (today: **`@zoijs/ssr`** — `isSafeAttributeValue`/`openerRel` from
   `@zoijs/core/server` — and **`create-zoijs`** — the `@zoijs/core/prod` entry).
2. **Core release.** Bump `framework/package.json` to the new version (e.g. `1.9.0`), leave
   `nextCore` **null**, merge, tag `core-v1.9.0`. Core needs nothing published, so its tag
   check is READY. Wait until it's on npm.
3. **Dependents — one PR**, after core is published:
   - set `"nextCore": "1.9.0"` and replace every `"next"` capability with `"1.9.0"`;
   - raise the `@zoijs/core` peer floor to `^1.9.0` for each package that imports a capability
     first in 1.9.0 (today: **`@zoijs/ssr`**), bump the packages being released, and regenerate
     their lockfiles (`npm install --package-lock-only --ignore-scripts --prefix <pkg>`);
   - regenerate the scaffolder's map from the published files:
     `node scripts/cdn-importmap.mjs @zoijs/core@<version> --write create/core-cdn.json`
     (`--check create/core-cdn.json` verifies it), and refresh the import maps shown in docs
     (`docs/installation.md`, the sanitize README) with the same tool;
   - `npm run release:check -- --all --strict` must be all **READY**.

   Then tag the dependents in any order — **`@zoijs/ssr`** and every other changed package —
   and **`create-zoijs` last** (its map targets the published core). Finally set
   `"nextCore"` back to `null` (the capabilities keep `"1.9.0"`) and sync the docs site (below).

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
4. Check that no pin was missed, in this repo's docs and the site's:
   `npm run docs:pins -- ../zoijs-site/content/md` — every exact pin must now name npm's `latest`.
5. Packages the site doesn't load at runtime — `@zoijs/ssr`, `@zoijs/testing`,
   `@zoijs/devtools`, `@zoijs/eslint-plugin`, `create-zoijs` — need no entry.
