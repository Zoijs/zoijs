# Deploying a Zoijs app

Zoijs apps are just **static files** — HTML, CSS, and JavaScript. There's no
build step, so "deploying" means *copying your files to a host that serves
static files*. That's it.

This guide covers the one thing that needs care: **history-mode routing** (if you
use [`@zoijs/router`](../../router/README.md)) needs the server to fall back to
`index.html` for deep links. Everything below explains when and how.

## What deployment means for Zoijs

A typical app is a folder like:

```
my-app/
  index.html
  app.js
  style.css
```

Upload that folder to any static host and you're live. No bundler, no
transpiler, no server runtime.

### Why no build step is required

Browsers run ES modules natively, so your `<script type="module">` loads `app.js`
directly. You get the framework one of two ways:

- **From a CDN** (simplest): an import map pointing at **exact-version** jsDelivr file
  URLs, with an integrity hash for every module file — see
  [Installation → From a CDN](installation.md#from-a-cdn). Your CSP must then allow the
  CDN: `script-src 'self' https://cdn.jsdelivr.net`.
- **Vendored** (most control): copy the `src/` of an exact released version (from the
  published package) into your project and point an [import map](installation.md) at the
  local files. Nothing is fetched at runtime from a third party, so a strict
  `script-src 'self'` works.

> **Production tip:** pin an exact version (`@1.8.0`, not `@1` or `@latest`) with integrity
> hashes, or vendor the files. A CDN URL that floats can change what your users run without
> a deploy — and a build service that rewrites modules can't be integrity-pinned at all.

## Deploying a static app (the easy case)

If your app **doesn't use the router**, deployment is trivial — drag the folder
to any host below and you're done. Skip to your host of choice; you don't need
any fallback configuration.

## Ship production mode

Load the production entry in what you deploy so development warnings and the
devtools hook are off: map `"@zoijs/core"` to `…/src/prod.js` (or the `/prod` subpath
on a CDN) in your import map. Bundlers' production builds select it automatically.
See [Production mode](concepts/production-mode.md).

## History-mode routing needs an `index.html` fallback

The router uses the History API, so navigating to `/tasks/1` **in the app** never
contacts the server — it's instant and needs no configuration. The catch is a
**hard load** of that URL: a refresh, a bookmark, or someone pasting
`https://yoursite.com/tasks/1` into the address bar.

Now the browser asks your server for the file `/tasks/1`. There is no such file —
only `index.html` exists — so the server returns **404**.

The fix is a **SPA fallback**: tell the server "for any path you don't recognize,
serve `index.html`." Then `index.html` loads, your app starts, and the router
reads `/tasks/1` from the URL and shows the right page.

> **Rule of thumb:** in-app clicks → no config needed. Hard refresh of a deep
> link → you need the fallback below.

## App base path vs route path

Two different "paths" — keep them straight:

| Term | What it is | Example |
|---|---|---|
| **Base path** | *Where the app is hosted* | `/my-app` (a project sub-folder) |
| **Route path** | *A page inside the app* | `/tasks/1` |
| **Full URL path** | base + route | `/my-app/tasks/1` |

- Hosting at a **root domain** (`https://app.com/`)? No base needed.
- Hosting under a **sub-path** (`https://you.github.io/my-app/`)? Tell the router
  with `base` so your route patterns stay clean:

  ```js
  const router = createRouter(routes, { base: "/my-app" });
  ```

  See the [router base docs](../../router/README.md#hosting-under-a-sub-path-base).

You configure these in two different places: **`base`** in your app code, and the
**fallback** on your host. A sub-path app needs both.

## Host setup

Pick your host. Each snippet does the same thing: serve `index.html` for unknown
paths.

### GitHub Pages

GitHub Pages has **no SPA fallback**, but it serves `404.html` for missing paths —
so just **copy `index.html` to `404.html`** and the app loads either way:

```bash
cp index.html 404.html
```

Project pages live under `https://<user>.github.io/<repo>/`, so also set the
router base to match:

```js
const router = createRouter(routes, { base: "/<repo>" });
```

(A custom domain or a user/org page served at the root needs no base.)

> 📖 **Step-by-step:** the [Deploy the Task Board to GitHub Pages](recipes/deploy-task-board-github-pages.md)
> recipe walks through this end to end, with a verification checklist and
> troubleshooting.

### Netlify

Add a `_redirects` file at your publish root:

```
/*  /index.html  200
```

Or in `netlify.toml`:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Vercel

Add `vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Cloudflare Pages

Add a `_redirects` file at your output root:

```
/*  /index.html  200
```

### Static server / Nginx

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

### Apache

Add `.htaccess` next to `index.html`:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

## Content Security Policy, import maps, and caching

None of this is required to ship, but if you run a **strict CSP** or vendor the framework, three
real-world traps are worth knowing. Each was hit by a production Zoijs app; all three have a clean fix.

### A strict `style-src 'self'` and the router outlet

Under `style-src 'self'` the browser blocks **inline `style="…"` attributes** (and they show up in
pre-rendered HTML, so the block is visible on first load). Zoijs is built to avoid inline styles, with
one thing to know: `@zoijs/router`'s `view()` outlet.

- On **`@zoijs/router` ≥ 0.5.0** the outlet is a class (`<div class="zoijs-router-outlet">`), not an
  inline style. Add one CSS rule to keep it layout-transparent:

  ```css
  .zoijs-router-outlet { display: contents; }
  ```

- The inline **import map** (`<script type="importmap">`) is a *script*, so `script-src` — not
  `style-src` — governs it. Allow exactly it with its sha256 hash (compute the hash from the built
  HTML so it can't drift); never fall back to `'unsafe-inline'`.

### Import maps + `modulepreload` can cancel each other out

If you resolve `@zoijs/*` with an inline import map, **do not also ship
`<link rel="modulepreload" href="…">`** for those modules on a host that promotes preloads to an HTTP
`Link:` header (Cloudflare's *Early Hints* does this automatically). The header starts a module preload
**before the body — and therefore the import map — is parsed**, and per spec *an import map is rejected
once any module load or preload has started*. The map is then discarded and every bare specifier fails
with `Failed to resolve module specifier "@zoijs/core"`. **Firefox enforces this strictly; Chromium is
lenient**, so it can pass every Chrome check and still be broken in Firefox.

Fixes (pick one):
- **Drop the `modulepreload` tags.** Simplest and host-agnostic — nothing can be hoisted ahead of the
  map. Verify with `curl -sI https://your-site/ | grep -i link:` (there must be no `rel=modulepreload`).
- **Skip the import map entirely** by rewriting bare `@zoijs/*` specifiers to absolute vendored paths
  at build time. With no map to race, `modulepreload` is safe again.
- Or turn off the host's Early Hints (a dashboard toggle — weaker, since it can be re-enabled).

### Caching a vendored framework

If you vendor `@zoijs/*` into `/vendor/…` and serve it **`immutable`** for speed, re-vendoring changes
the file *contents* but not the *URL* — so a returning visitor keeps the year-old cached copy and can
silently run stale framework code. Two safe options:

- **Content-hash the URL**: emit `/vendor/zoijs-<hash>/…` (hash the vendored tree at build time) and
  point the import map / rewrite at it. New content ⇒ new URL ⇒ `immutable` caches bust cleanly, and
  versioning the whole directory also busts the framework's internal relative imports.
- **Or serve `/vendor/*` with `Cache-Control: public, max-age=0, must-revalidate`** — a cheap 304 per
  file, never stale. Correct, just slightly slower than immutable.

## Checklist

1. Will users ever **hard-refresh** a non-root URL? If yes, set up the **fallback**
   for your host.
2. Is the app at a **sub-path**? If yes, set the router **`base`** to that path.
3. **Pin or vendor** the `@zoijs/*` versions you import.
4. Running a **strict CSP**? Add `.zoijs-router-outlet { display: contents }`, hash the inline import
   map in `script-src`, and don't ship `modulepreload` **and** an import map together (see above).
5. Serving vendored `@zoijs/*` as **`immutable`**? **Content-hash the URL** so re-vendoring busts caches.
6. Does the import map load the **production entry** (`…/src/prod.js` or `@zoijs/core/prod`)?
   Want failures in your monitoring? Add `configure({ onError })` (works in production).
7. Upload the folder. Done.

## What you do *not* need

No build, no Node server, no Docker, no CI to ship — a static host is enough. CI
(see the repo's [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) is
for *testing* the framework, not for building your app.
