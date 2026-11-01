# RFC 0010 — An optional production build (`@zoijs/build`)

- Status: **Proposed — experimental 0.1.0, unpublished.** Built and verified against two real
  apps (PERF-2C); adopting it in either app, and publishing, are separate decisions.
- Target: a new **tooling package** (`@zoijs/build`, like `create-zoijs` and
  `@zoijs/eslint-plugin`): Node-side, zero dependencies, one declared peer (`esbuild`).
- Affects: **nothing at run time.** No core or package change; apps keep running unbuilt. One
  policy edit: `scripts/check-deps.mjs` gains a reviewed tooling-peer exception (§5).

## 1. Problem statement

Zoijs runs without a build step, and that stays the default. But unbundled ES modules have a
measurable production cost: the browser discovers each import only after fetching and parsing the
module that contains it — a waterfall of round trips — and a repeat visit still revalidates every
module (`304`s) unless file names change with content.

Two apps measured both ways (Chromium, median of 11, slow 4G: 150 ms, 1.6 Mbit/s, 4× CPU):

| App | Unbundled | Bundled | |
|---|---|---|---|
| Zoijs Insight — Overview ready, first visit | 2,485 ms, 86 requests | 1,063 ms, 17 requests | −57% |
| Zoijs Insight — repeat visit | 2,228 ms (64 × `304`) | 283 ms | −87% |
| zoijs.dev — app ready, first visit | 1,507 ms, 47 requests | 586 ms, 4 requests | −61% |
| zoijs.dev — repeat visit | 829 ms | 234 ms | −72% |

Each app solved it with its own esbuild script (PERF-2A, PERF-2B). The scripts share most of their
logic — and most of their *safety* logic: no `eval`, nothing external, no public source maps,
verified framework code. Copying that into every app means every app re-learns those checks.

## 2. Rule of Three

1. **Explainable in under two minutes?** **Yes.** "Optional. `build()` bundles your modules into
   hashed files you can cache forever, checks the output is CSP-safe, and tells you which tags to
   put in your page. Your app still runs without it."
2. **Implementable without core changes?** **Yes.** Core already declares the `"production"`
   export condition that esbuild understands. No package changes at all.
3. **Would 80–90% of apps benefit?** **Of apps deployed to real users, most would** (§1); the
   rest — prototypes, internal tools, apps behind fast networks — ignore it and pay nothing. That's
   why it's opt-in tooling, never a requirement.

**The "no build step" guardrail** (scope.md §6.1) is about what Zoijs *requires*: a Zoijs app
must work with a `<script type="module">` and an import map, with no bundler, compiler or JSX
transform. That stays true — nothing here is needed to develop, test or ship. The amendment to
scope.md makes the distinction explicit: **no build step is required; an optional production
bundle is allowed.**

## 3. Design

One function does the work; three small helpers let apps use the result in their own HTML.

- `build({ entryPoints, outDir, css?, importMap?, sourceMapsDir?, … })` → esbuild with code
  splitting, content-hashed names (`[name]-[hash]`, `chunk-[hash]`), minify, `legalComments:
  "eof"`, `conditions: ["production"]`; then checks; then a manifest (entries with their static
  and dynamic chunks, every file with size and sha384 integrity, cache and CSP guidance).
- `htmlTags(result)` — stylesheet, `modulepreload` for the entry's static chunks, module script.
- `stripImportMap(html)` — the page without its import map, plus the map parsed.
- `inlineScripts(html)` / `scriptHashes(html)` — classify inline scripts; CSP `'sha256-…'`
  sources for the executable ones.

**Never breaks the last good build.** Output goes to `<assets>.staging-<id>`. A failed build —
any check — removes only that, and a `BuildError` lists every problem with the fix; the live
assets and manifest are untouched. Promotion writes the new manifest first, moves the live pair
into `<assets>.previous-<id>`, installs the new pair, and only then retires the previous one
(deleted, or kept at `<assets>.prev`); a failure at any step restores the previous pair. If the
process dies mid-promotion, `<assets>.previous-<id>` still holds the intact last good pair and the
next run restores it first. Each step is an atomic rename in one directory; the sequence as a
whole isn't atomic, so deploy after `build()` returns. The manifest's `buildId` (a hash of every
file's integrity) ties it to its files.

**What it deliberately does not do** (stays in the apps): read or write HTML pages, prerender,
copy static files, write host config (`_headers`, nginx, …), choose or edit a CSP, precompress,
report sizes, benchmark. Those differ per app and host — Insight writes a `_headers` CSP and
precompresses for its Node server; zoijs.dev rewrites 67 prerendered pages for Cloudflare Pages.

## 4. Security

The checks extracted from the two apps, plus the ones they implied:

| Check | Why |
|---|---|
| No `eval` (esbuild's `direct-eval`) or `new Function` | strict CSP has no `'unsafe-eval'` |
| No external import left; bare imports only to allowed packages | a bundle must be self-contained; a dev-only package mustn't sneak in |
| No computed `import()` | it can't be bundled and would 404 in production |
| No public source maps / `sourceMappingURL`; private maps only outside `outDir` | Insight's repo is private; maps expose source |
| No machine paths in output | reproducibility, and they leak the build host |
| No credential files imported; no credential-shaped strings | common accidents (patterns, not a guarantee) |
| Import map: exact pinned versions; every bundled file matches its integrity hash | the bundle runs byte-identical framework code to the unbundled app (zoijs.dev's guarantee) |

**Static checks are not proof.** Both apps keep browser tests that load the built output under
their real CSP — Insight with Trusted Types enforced — and fail on any violation. The README says
so; this package doesn't replace them.

## 5. Dependencies

esbuild is a **peer** dependency (`^0.28`): the app installs and pins it, so the app's lockfile —
not this package — decides the exact engine, and `npm audit`/license checks see it. The package
itself has zero dependencies. `scripts/check-deps.mjs` allows exactly this: a `TOOLING_PEERS`
entry `build → esbuild`; every other tooling package still may have no peers. `esbuild` can also
be passed in (`options.esbuild`).

Why not a regular dependency: the zero-dependency rule exists so installing Zoijs adds no
supply-chain surface the app didn't choose; a peer keeps that choice with the app. Why not
dependency injection only: the default should just work once esbuild is installed.

## 6. Out of scope (guardrails)

- No dev server, HMR, plugins API, config file or CLI. Apps call `build()` from their own script.
- No transforms: no TypeScript, JSX, CSS preprocessing, or asset (image/font) imports.
- Not required, not the default: `create-zoijs` templates stay unbundled; docs keep leading with
  the import map.
- No HTML templating or host adapters. If several apps later need the same HTML step, that's a
  new proposal with evidence, not an addition by default.

## 7. Alternatives considered

- **Keep per-app scripts.** Works, but duplicates the safety checks; each new app would start
  without them. Both apps' scripts are the evidence for extraction (proven, then extracted).
- **Recommend Vite / Rollup.** Capable, but they bring a dev server, a plugin ecosystem and a
  transform pipeline — a different development model. Zoijs's stays "no build"; this only adds a
  production step around the bundler both apps already use.
- **Bundle-by-default in `create-zoijs`.** Rejected: it would make a build step the norm.

## 8. Follow-ups (not in 0.1.0)

- **Syntax-aware computed-import detection.** 0.1.0 flags any `import(` left in the output that
  isn't followed by a string literal (esbuild bundles string and fixed-prefix template imports as
  globs). It's a text match: it can flag prose and miss deliberately obscured code. Replace it
  with analysis from esbuild's metadata or a small parser — without adding significant
  dependencies.
- **Separate build from promotion**, if a deployment needs different atomicity (e.g. assets, HTML
  and manifest swapped together by a host): `build()` would return a verified staging directory
  and its manifest, and a separate step would promote it. Only if the current promotion proves hard
  to make safe for such a case.

## 9. Decision

**Proposed.** Ship `@zoijs/build` 0.1.0 as experimental tooling once: (1) both apps produce
byte-identical bundles with it in isolated branches, passing their full browser and security
suites — verified in PERF-2C; (2) a maintainer accepts the `check-deps` tooling-peer exception and
the scope.md amendment. Adopting it in Insight or zoijs.dev, and publishing to npm, are separate
decisions after that.
