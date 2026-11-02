# @zoijs/build

> **Experimental (0.x) and optional.** Zoijs apps don't need a build step — they run as plain ES
> modules with an import map, in development and in production. `@zoijs/build` is for apps that
> *also* want a bundled production build. Nothing changes for apps that don't use it.

An optional production build for Zoijs apps: it bundles your modules with
[esbuild](https://esbuild.github.io) into **content-hashed files you can cache forever**, writes a
manifest, and **fails the build** — leaving nothing behind — if the output would break a strict
CSP, expose source maps, ship credentials, or run different framework code than your import map.
It doesn't touch your HTML, your host or your CSP: it gives you the tags and hashes to use.

Why bother: an unbundled app fetches each module only after parsing the one that imports it — a
waterfall of round trips. Measured on two real apps (Chromium, slow 4G, median of 11):

| | Unbundled | `@zoijs/build` | |
|---|---|---|---|
| Zoijs Insight, first visit | 2,485 ms · 86 requests | 1,063 ms · 17 requests | −57% |
| Zoijs Insight, repeat visit | 2,228 ms (64 × `304`) | 283 ms (no revalidation) | −87% |
| zoijs.dev, app ready, first visit | 1,507 ms · 47 requests | 586 ms · 4 requests | −61% |
| zoijs.dev, app ready, repeat visit | 829 ms | 234 ms | −72% |

Your numbers will differ: measure your app (see [Measuring](#measuring)).

## Install

Node.js 20 or newer. esbuild is a **peer dependency** — you install and pin it:

```bash
npm install --save-dev --save-exact @zoijs/build esbuild@0.28
```

## Use

A build script of your own (e.g. `scripts/build.mjs`, run by `npm run build:bundle`):

```js
import { readFile, writeFile } from "node:fs/promises";
import { build, htmlTags, stripImportMap, scriptHashes } from "@zoijs/build";

const page = await readFile("index.html", "utf8");
const { html, importMap } = stripImportMap(page); // a bundle needs no import map

const result = await build({
  entryPoints: ["src/main.js"],
  outDir: "dist",
  css: ["src/styles/base.css", "src/styles/app.css"], // optional: one hashed stylesheet
  importMap,                    // optional: verify the bundle against it (see below)
  sourceMapsDir: "source-maps", // optional: private maps, outside dist/
});

// Your HTML, your way: replace the dev tags with the built ones.
await writeFile(
  "dist/index.html",
  html.replace('<script type="module" src="/src/main.js"></script>', htmlTags(result).join("\n    "))
);
console.log("script-src 'self'", ...scriptHashes(html)); // your inline scripts, for your CSP
```

`build()` writes `dist/assets/` (the hashed files) and `dist/asset-manifest.json`, and returns the
same information. Everything else in `dist/` is yours: copy static files, write pages and host
config as you do today.

### `build(options)`

| Option | Default | |
|---|---|---|
| `entryPoints` | — (required) | Entry modules, relative to `root`, e.g. `["src/main.js"]`. |
| `outDir` | — (required) | Output directory. The build owns only `<outDir>/<assetsDir>/` and the manifest. |
| `root` | `process.cwd()` | Project directory; other paths are relative to it. |
| `assetsDir` | `"assets"` | Subdirectory of `outDir` for the hashed files. |
| `publicPath` | `"/assets/"` | URL prefix they're served under (ends with `/`). |
| `css` | none | Stylesheets in cascade order → one minified `<cssName>-<hash>.css`. |
| `cssName` | `"app"` | Base name of that stylesheet. |
| `importMap` | none | Verify the bundle against your import map (versions + integrity). |
| `allowedPackages` | see below | Packages bare imports may reach. |
| `sourceMapsDir` | none (no maps) | Write source maps, with sources, here — must be outside `outDir`. |
| `manifest` | `"asset-manifest.json"` | Manifest path in `outDir` (outside `assetsDir`), or `false`. |
| `keepPrevious` | `false` | Keep the replaced build at `<assetsDir>.prev` (one generation). |
| `hydration` | `true` | `false`: bundle Zoijs's lean entry without hydration (~1 KB gzipped less) — only if the app never hydrates server HTML. |
| `target` | `"es2022"` | esbuild target. |
| `allowComputedImports` | `false` | See [Dynamic imports](#dynamic-imports). |
| `esbuild` | `import("esbuild")` | An esbuild module to use instead. |

It returns (and writes, minus `outDir`/`assetsDir`/`manifestFile`/`metafile`):

```js
{
  version: 1,
  buildId: "9f2c4e7a1b3d5f60",                                 // identifies exactly this set of files
  publicPath: "/assets/",
  entries: { "src/main.js": { url: "/assets/main-RHC3JQ7C.js", imports: ["/assets/chunk-…js"], dynamicImports: ["/assets/chunk-…js"] } },
  css: { url: "/assets/app-6551eca905.css", file: "…" },     // the manifest has just the URL
  files: [{ url, bytes, integrity: "sha384-…" }, …],          // every file, sorted
  cache: [{ path: "/assets/*", cacheControl: IMMUTABLE }],
  csp: { "script-src": ["'self'"], "style-src": ["'self'"] }, // what the bundle itself needs
  outDir, assetsDir, manifestFile, metafile,                  // absolute paths; esbuild's metafile
  recovered,                                                  // true if an interrupted earlier run was undone first
}
```

Invalid options and failed checks throw a `BuildError` whose `problems` lists every problem, each
with the file and what to do. `IMMUTABLE` is `"public, max-age=31536000, immutable"`.

### HTML and CSP helpers

- `htmlTags(result, { entry })` — the tags that load an entry: its stylesheet, a
  `<link rel="modulepreload">` for each chunk it imports statically (so they download in parallel,
  not one after another), and the module script. Works with the result or the parsed manifest.
- `stripImportMap(html)` — `{ html, importMap }`: the page without its import map (whole line
  removed when it stands alone), and the map parsed. Maps in comments or escaped text are ignored.
- `inlineScripts(html)` — the page's inline scripts, each `{ kind, executable, hash, bytes }`;
  `kind` is `classic`, `module`, `importmap` or `data` (JSON-LD and other data blocks, which CSP
  doesn't govern).
- `scriptHashes(html)` — just the `'sha256-…'` sources of the executable ones, for `script-src`.

## Native ES modules vs. the bundle

Keep both. Develop and test against the unbundled app; build the bundle for production when it
helps. The bundle runs the **same code**: Zoijs packages resolve to their production entries
(the `"production"` export condition — `@zoijs/core`'s `prod.js`, exactly what a production import
map points at), and route-level `import()`s stay separate chunks. Your HTML differs only in the
tags `htmlTags()` gives you. Test both in a browser (see [Security](#security)).

### Leaving hydration out

Most Zoijs apps render on the client and never hydrate server HTML. For those, `hydration: false`
bundles `@zoijs/core`'s lean entry (the `"zoijs-no-hydration"` export condition, applied to every
`@zoijs/core` import so there's still one core): the same API, about 1 KB gzipped less.
`mount(…, { hydrate: true })` — and `@zoijs/ssr`'s `hydrate()` — then throw, so don't set it in an
app that hydrates. Cores older than the lean entry ignore it.

## Dynamic imports

`import("./pages/settings.js")` with a **string literal** becomes its own chunk, loaded on demand —
code splitting works as it does unbundled. A prefix esbuild can see — `` import(`./pages/${name}.js`) `` — is bundled too:
every matching file becomes its own chunk. A **fully computed** `import(name)` can't be bundled
(esbuild can't know the file) and would 404 in production, so the build rejects it. If your bundle only
contains such code as *text* — documentation, for instance — pass `allowComputedImports: true`.

## Caching

Everything in `assetsDir` is named by its content hash, so a changed file gets a new name: serve
`/assets/*` with `Cache-Control: public, max-age=31536000, immutable` (the manifest's `cache`
entry) and the browser never asks again. Your HTML must **not** be cached that way — it's what
points at the new names; keep it `no-cache` (revalidated). For a `_headers` host (Cloudflare Pages,
Netlify):

```
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

## Security

`build()` refuses — and leaves no assets behind — when:

- the output uses `eval` or `new Function` (a strict CSP has no `'unsafe-eval'`);
- anything is left to import at run time from outside the bundle (a URL, an unknown package), or a
  bare import reaches a package that isn't allowed — by default your `package.json`
  `dependencies`/`peerDependencies`, or your import map's names;
- a computed `import()` survives;
- public output would contain a source map or a `sourceMappingURL`, or this machine's paths;
- a credentials-looking file is imported (`.env`, `*.pem`, `*.key`, `id_rsa`, …) or the output
  contains a credential-shaped string (private keys; AWS, GitHub, npm, Slack, Stripe live keys).
  This catches common accidents, not every secret: never put secrets in client code.

Because the bundle loads only same-origin files, its own CSP needs are `script-src 'self'` and
`style-src 'self'` (`result.csp`); add `scriptHashes(html)` for your page's inline scripts. Once
the import map is gone, its hash — and any CDN origin it used — can leave your CSP.

**Static checks can't prove what code does at run time.** Keep browser tests that load the built
app under your real CSP — and Trusted Types policy, if you enforce one — and fail on violations.
Zoijs itself is Trusted-Types-clean; your own code (or a library's) may not be.

### Import-map integrity

If your unbundled app uses an import map with
[integrity](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps) hashes, pass it as
`importMap`. Then every pinned package must be installed at **exactly** the pinned version, and
**every bundled file** of those packages must match the map's hash for its URL — so the bundle
runs byte-identical framework code to what the import map serves. URLs must be versioned package
URLs (`…/npm/<name>@<version>/…` as on jsDelivr, or `…/<name>@<version>/…`). Apps without an
import map skip this.

### Source maps

None by default. With `sourceMapsDir` (which must be outside `outDir`), maps — with the original
sources — are written there and never into the public output, and the public files carry no
`sourceMappingURL`. Keep them private (a CI artifact, an error tracker), never deployed.

## Deployment and rollback

`build()` never touches the live `assets/` or manifest until the new build has passed every check:

- **A failed build changes nothing live.** It bundles into `<assetsDir>.staging-<id>` beside the
  live directory; if anything fails, only that staging directory is removed. The last good build
  — assets and manifest — stays exactly as it was. (With no previous build, nothing is left.)
- **Promotion replaces the pair, and undoes itself on failure.** The new manifest is written
  first (beside the old one); the live assets and manifest move together into
  `<assetsDir>.previous-<id>`; the new ones take their place. If any step fails, the previous pair
  is restored and `build()` throws. Only after both are in place is the previous build retired —
  deleted, or kept at `<assetsDir>.prev` with `keepPrevious: true`.
- **An interrupted promotion is undone next time.** If the process dies mid-promotion, the last
  good pair is still intact in `<assetsDir>.previous-<id>`; the next `build()` restores it before
  doing anything else (and reports `recovered: true`), and removes stale staging leftovers.
- **The manifest and the assets belong together.** Every file is listed with its integrity hash,
  and `buildId` hashes them all: a deploy step can check a manifest against the files.

Make your build script exit non-zero on error (an uncaught rejection does) so CI stops there.
Deploy `outDir` as you deploy today. To roll back, redeploy the previous output — or switch back to
the unbundled app, which never stopped working. Hashed names make mixed deploys safe: pages still
open in browsers keep loading their old files as long as they're served (`keepPrevious`, or keep
the previous `assets/` on your host for a release).

## Measuring

Compare the two builds under the same conditions (browser, network profile, cache state,
machine), over several runs, and compare medians: first visits (empty cache) and repeat visits.
Zoijs Insight's `scripts/load-bench.mjs` and zoijs.dev's are working examples (HTTP/2, throttled
with the DevTools Protocol). Serve over HTTP/2 — over HTTP/1.1 the unbundled app is penalized
unfairly.

## Known limitations

- Experimental: the API may change before 1.0.
- JavaScript (ES modules) and plain CSS only — no TypeScript, JSX, CSS preprocessing or asset
  imports (images, fonts). CSS is concatenated in the order given, not bundled from `@import`s.
- One build per call; one stylesheet per build.
- Credential scanning matches known patterns only.
- The computed-`import()` check is a **text match** on the bundled output, not syntax analysis.
  esbuild bundles string imports and template/concatenated ones with a fixed prefix
  (`` import(`./pages/${name}.js`) `` becomes one chunk per matching file); any other `import(`
  left in the output is flagged. Prose that looks like such code can be flagged too (hence
  `allowComputedImports`), and code built in ways that defeat a text match can slip through. A
  syntax-aware check is planned; until then, test lazy routes in a browser.
- Promotion is a sequence of renames in one directory, each atomic, with rollback and recovery —
  not a single atomic operation. A reader that loads the manifest and the files at the very moment
  of promotion can see one without the other; deploy `outDir` after `build()` returns, not while
  it runs.
- Supported platforms: Linux, macOS and Windows (Node.js 20+). The package's tests run on all three
  in CI; the apps that use it are tested on Linux.

## License

MIT
