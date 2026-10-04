# Installation

Zoijs has **no build step**. You need a browser and a way to serve files over `http://` (ES modules don't load from `file://`). Pick whichever option fits.

## From a CDN

Zero install: load Zoijs from **jsDelivr**, which serves the exact files of the published
npm package (unmodified, immutably cached). Two rules make this safe:

1. **Pin an exact version** (`@1.8.0`), never a range (`@1`) or `@latest` — you ship what
   you tested, and a CDN can't silently swap it.
2. **Add an integrity hash for every module file.** The browser then refuses any file whose
   bytes don't match (Chrome 127+, Firefox 138+, Safari 18+; older browsers ignore the
   `integrity` key and load without the check).

```html
<script type="importmap">
  {
    "imports": {
      "@zoijs/core": "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/index.js"
    },
    "integrity": {
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/core/boundary.js": "sha384-IQ7MJEJQjcYemF3C0nXUzhmtJMYLIfdJ74lHQ+NgDHkhxP0q0fWc3hp7J+8NmdA5",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/core/each.js": "sha384-dmivZrBb98RiAQA6JDBpWM+90WXrKGV16K2+MznUr65Dwe7QYMno0fCzqWVqtjuR",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/core/html.js": "sha384-eokPtOg2OKALqYTTvuT4VuV4qkA7PjqZCVv/Z4wDtJK1W8hJnEM4NTrv2xiVSO3U",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/core/mount.js": "sha384-eAm8c9K1SY4j66NnZ4pc4exzlek7iG67di9hU5U9S3PnaZnElkqRGpzOy2z4Uz2h",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/core/renderer.js": "sha384-U8lmuwr3m1X9VByHoEz7+llyNTBojEBIes+OzkM/OndBfgO5JaeqyaBfHngv48Rl",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/index.js": "sha384-dDKK+RVA9Pj7X7aJvv0zgepWNZQi9W20zZ1JgACZ4EbIQ9LjvLsss8gsQGiyvcRb",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/reactivity/computed.js": "sha384-nlAK86Jy1IR3yFSePE38l6cjZqcu5SdnYRVQxJh/+2YQL3WhTHdZ18yCKeKL4ffm",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/reactivity/core.js": "sha384-ZarTqipGKQj1fDd4f458q/elWtGRImklba48F0lhYFV0WlPkMUAWnlVOjW6C+VZh",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/reactivity/devtools.js": "sha384-2d17bQWgg87At3C1G8xbB/I099QSMQSQLdH3U0NTrQ0CTCUncYr965cZK+CCGVvg",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/reactivity/effect.js": "sha384-Dybr242NFaaG2ZUoDbSPm7jaU+o2D0JMA98LmTG0vsGF88sL6f98DqEWk7A4LR/+",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/reactivity/env.js": "sha384-kvYgg7qYJH6PqBIb/I3zh1pucmlVrkB8hlWVEJGp8T0mh6yshsLexn1/fP8iAawg",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/reactivity/owner.js": "sha384-UTiqLh7+HkGpqCBR4bhLhb/mfpD3Fr3KLM1N49aejUYABa7bkcTIW6eK/AlAD40m",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/reactivity/state.js": "sha384-w2HVkiWmSdb8h7qqr4OViqHJrDqlD/oInr+5Lal+lSvXWu3SPuZv35WWDPsEOgUq",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/utils/dom.js": "sha384-ggrwnqwnZJfeQXMM46YlzkiNtYXk+WsvUMqdSdPypC4WWl6xflaRN8HEsVjbpC64",
      "https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/utils/security.js": "sha384-YJPoeU3TzidNo/muNyzoZp9Tgre6kzpTocT5VxvVyIFTvD5qeXE53PVJr29TcbHx"
    }
  }
</script>
<script type="module">
  import { html, mount, createState } from "@zoijs/core";
  // your app here
</script>
```

That's every module in `@zoijs/core@1.8.0`'s graph (each one is fetched separately, so each
needs its own hash). Other `@zoijs/*` packages work the same way: map their names to exact
jsDelivr file URLs and import them by name, so they all share this one core. Build-service
CDNs that rewrite modules (e.g. esm.sh) can't be integrity-pinned, and may load a second
copy of the core.

**Generating the map for another version.** In the Zoijs repo,
`node scripts/cdn-importmap.mjs @zoijs/core@<version> [@zoijs/router@<version> …]` prints it
(add `--prod` to map the production entry). Without the repo, compute each file's hash from
the published package — never from a CDN response you haven't pinned:

```bash
npm pack @zoijs/core@1.8.0 && tar xzf zoijs-core-1.8.0.tgz
openssl dgst -sha384 -binary package/src/index.js | openssl base64 -A   # → sha384-<this>
```

**Content Security Policy.** Loading from a CDN means your CSP must allow it:
`script-src 'self' https://cdn.jsdelivr.net` (plus the import map's hash for the inline map).
For a strict `script-src 'self'`, vendor the files instead (below).

## npm + import map

Install the package and map the specifier `@zoijs/core` to it — still no build step:

```bash
npm install @zoijs/core
```

```html
<script type="importmap">
  { "imports": { "@zoijs/core": "/node_modules/@zoijs/core/src/index.js" } }
</script>
<script type="module">
  import { html, mount, createState } from "@zoijs/core";
</script>
```

If you already use a bundler (Vite, esbuild, etc.), `import { html } from "@zoijs/core"` just works — but Zoijs never *requires* one.

## Vendor the files

Copy the `src/` folder of an **exact released version** into your project — from the
published package (`npm pack @zoijs/core@1.8.0`), not from a CDN response — and import it.
Keep the version in the folder name (e.g. `vendor/zoijs-core-1.8.0/`) so upgrades are
deliberate and caches bust. Everything is then served from your own origin, so a strict
`script-src 'self'` works.

```js
import { html, mount, createState } from "./vendor/zoijs-core-1.8.0/index.js";
```

## Running the examples

```bash
git clone https://github.com/Zoijs/zoijs && cd zoijs/framework
npm run dev
# open http://localhost:7310/examples/counter/   ← keep the trailing slash
```

`npm run dev` just serves the folder over http — there's nothing to compile.

> **Why the trailing slash?** Without it, some static servers resolve a relative `./app.js` against the wrong directory and the app won't load. Always use `/examples/counter/`, not `/examples/counter`.

## TypeScript (optional)

Zoijs ships type definitions ([`src/index.d.ts`](../src/index.d.ts)); editors discover them automatically via the package. You get autocomplete and type-checking with **no framework build step**. See the [API Reference](api-reference.md#typescript).

---

Next: **[Your First App »](first-app.md)**
