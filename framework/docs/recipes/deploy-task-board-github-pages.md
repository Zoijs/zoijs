# Recipe: Deploy the Task Board to GitHub Pages

A concrete, end-to-end walkthrough for putting a Zoijs app — the
[Task Board example](../../../examples/task-board) — online at a free GitHub
Pages URL like:

```
https://<your-username>.github.io/<your-repo>/
```

It uses the **simplest** beginner path: GitHub Pages serving a `/docs` folder
from your `main` branch. No build step, no Actions, no CLI.

If you just want the generic version (Netlify, Vercel, Nginx, …), see the
[deployment guide](../deployment.md). This page is the specific, copy-paste
GitHub Pages version.

## 1. What this recipe deploys

The Task Board app — Home, Tasks, New, Task details, About — running as a static
site. Because it uses [`@zoijs/router`](../../../router/README.md) in history
mode, two things need handling on GitHub Pages: **sub-path hosting** and **deep
links**. This recipe takes care of both.

## 2. Prerequisites

- A **GitHub repository** for your app (it can be just the app's files).
- **GitHub Pages** available (free on public repos).
- The `@zoijs/*` packages reachable from the browser, via either:
  - a **CDN** (simplest) — all packages are published on npm, so
    `https://esm.sh/@zoijs/core@1`, `https://esm.sh/@zoijs/router@0.1`, etc. work
    out of the box; or
  - **vendored source** — copy each package's `src/` into your repo and point the
    import map at the local files (zero runtime dependencies; see step 5's note).

## 3. Why GitHub Pages needs special handling

| Issue | Why | Fix |
|---|---|---|
| **Sub-path** | Project pages live under `/<repo>/`, not `/` | Router `base: "/<repo>"` |
| **Deep-link 404** | A refresh of `/<repo>/tasks/1` asks GitHub for a file that doesn't exist | A `404.html` copy of `index.html` |

GitHub Pages has no built-in SPA fallback, **but** it serves `404.html` for any
missing path. So copying `index.html` to `404.html` makes every deep link load
your app, which then routes correctly from the URL.

## 4. Configure the router base

In `app.js`, set `base` to your repository name:

```js
const router = createRouter(routes, {
  base: "/<repo-name>", // e.g. "/task-board"
});
```

Now `router.link("/tasks", …)` produces `/<repo-name>/tasks`, and a refresh on
that URL resolves to the Tasks page. (Deploying at a user/org root page or a
custom domain? Drop `base`.)

## 5. Prepare the deploy folder

Put the app's files in a `docs/` folder at the repo root:

```txt
docs/
  index.html
  404.html      ← created in step 6
  app.js
  fake-api.js
  style.css
```

In `docs/index.html`, map the package names to the CDN (pinned versions):

```html
<script type="importmap">
  {
    "imports": {
      "@zoijs/core": "https://esm.sh/@zoijs/core@1",
      "@zoijs/router": "https://esm.sh/@zoijs/router@0.1",
      "@zoijs/resource": "https://esm.sh/@zoijs/resource@0.1",
      "@zoijs/action": "https://esm.sh/@zoijs/action@0.1",
      "@zoijs/head": "https://esm.sh/@zoijs/head@0.1"
    }
  }
</script>
```

Use **relative** paths for your own assets (`./app.js`, `./style.css`) — an
absolute `/style.css` would point at the domain root, not your sub-path.

> **Want zero runtime dependencies?** Vendor instead: copy `framework/src` into
> `docs/zoijs/core/`, and each single-file package (`router`, `resource`,
> `action`, `head`) into `docs/zoijs/`, then map
> `"@zoijs/core": "./zoijs/core/index.js"`, `"@zoijs/router": "./zoijs/router.js"`,
> etc. The packages import `@zoijs/core` by name, which the import map resolves —
> so no code changes are needed.

## 6. Create the fallback

One command — the whole trick:

```bash
cp docs/index.html docs/404.html
```

Re-run it whenever you change `index.html`.

## 7. Publish to GitHub Pages

```bash
git add docs
git commit -m "Deploy Task Board to GitHub Pages"
git push
```

Then in your repo: **Settings → Pages → Build and deployment → Source:
"Deploy from a branch" → Branch: `main` / folder: `/docs` → Save.**

Wait a minute, then open `https://<your-username>.github.io/<your-repo>/`.

> Prefer a clean root? The alternative is a dedicated `gh-pages` branch
> containing only the deploy files, with Pages set to that branch's root. The
> `/docs` approach above avoids juggling branches, so it's the friendlier start.

## 8. Verify

- [ ] **Home** loads at `https://…/<repo>/`
- [ ] **Tasks** page loads and the list appears
- [ ] Refreshing on **`/<repo>/tasks`** still works (no 404)
- [ ] Refreshing on **`/<repo>/tasks/1`** still works (no 404)
- [ ] Nav links and back/forward work
- [ ] The browser-tab **title** changes per page

## 9. Troubleshooting

**Shows "Not Found" on first load.** The router `base` is missing or doesn't
match the repo name. It must be exactly `/<repo>` (leading slash, no trailing).

**Links go to `/tasks` instead of `/<repo>/tasks`.** Same cause — set `base`.
With it, `router.link(...)` adds the prefix for you.

**Refreshing a deep link 404s.** You skipped the `404.html` copy, or you edited
`index.html` and didn't re-copy. Run `cp docs/index.html docs/404.html` again.

**Imports fail (blank page, console errors).** Open DevTools → Network. Either a
CDN URL is wrong/unpublished, or a vendored path is off. Pin exact versions, or
switch to the vendored layout in step 5.

**CSS or assets don't load.** You used an absolute path (`/style.css`). Under a
sub-path that resolves to the domain root. Use relative paths (`./style.css`).
