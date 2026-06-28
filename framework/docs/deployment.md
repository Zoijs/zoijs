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

- **From a CDN** (simplest): import from a versioned URL.
  ```js
  import { html, mount } from "https://esm.sh/@zoijs/core@1";
  ```
- **Vendored** (most control): copy the package's `src/` into your project and
  point an [import map](installation.md) at the local files. Nothing is fetched
  at runtime from a third party.

> **Production tip:** always pin a version (`@zoijs/core@1`) or vendor the files.
> Never ship `@latest` to users — a surprise major version could break your app.

## Deploying a static app (the easy case)

If your app **doesn't use the router**, deployment is trivial — drag the folder
to any host below and you're done. Skip to your host of choice; you don't need
any fallback configuration.

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

## Checklist

1. Will users ever **hard-refresh** a non-root URL? If yes, set up the **fallback**
   for your host.
2. Is the app at a **sub-path**? If yes, set the router **`base`** to that path.
3. **Pin or vendor** the `@zoijs/*` versions you import.
4. Upload the folder. Done.

## What you do *not* need

No build, no Node server, no Docker, no CI to ship — a static host is enough. CI
(see the repo's [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) is
for *testing* the framework, not for building your app.
