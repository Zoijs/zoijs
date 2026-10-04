# Production security checklist

The one page to read before you deploy a Zoijs app. Zoijs's rendering is safe by default
([how it works](security.md)); this page covers what **you** configure around it — the
entry you load, the headers your host sends, and how your server treats requests.

Each section is short and copyable. Package docs link here instead of repeating it.

> **Versions.** This page describes Zoijs as it is in the repository today. Some protections
> land in the **next** `@zoijs/core` release (the changes after 1.8.0) and are marked
> *(next release)*: the `@zoijs/core/prod` entry, `configure({ onError })`, the `html()`
> tagged-template check (`ZJS010`), Symbol-branded results, and `@zoijs/sanitize`'s id
> namespacing. On 1.8.0, use `configure({ dev: false })` instead of the production entry.

## The checklist

Copy this into your release process.

- [ ] **Production entry** — the import map (or bundler) loads `@zoijs/core/prod`. [→ 1](#1-use-the-production-entry)
- [ ] **Exact versions** — every `@zoijs/*` URL names an exact version; npm apps commit a lockfile and install with `npm ci`. [→ 2](#2-pin-exact-framework-versions)
- [ ] **Integrity** — every CDN module file has an import-map `integrity` hash, or the framework is vendored. [→ 3](#3-use-integrity-for-external-modules)
- [ ] **CSP** — the [baseline policy](#the-baseline-policy) is sent as a response header, with only the additions your app needs. [→ 4](#4-set-a-strict-content-security-policy)
- [ ] **CSRF** — the server protects every state-changing request that uses cookies. [→ 5](#5-protect-state-changing-requests-against-csrf)
- [ ] **Credentials** — `credentials: "include"` appears only where cross-origin cookies are intended, and the server's CORS allows exactly those origins. [→ 6](#6-configure-credentials-deliberately)
- [ ] **Authorization on the server** — no data or action is protected only by hidden UI or a client-side route check. [→ 7](#7-authorize-on-the-server)
- [ ] **`serialize()` only in a script body** — never in an attribute, URL, style, or raw HTML. [→ 8](#8-embed-serialize-output-only-in-a-script-body)
- [ ] **Untrusted HTML goes through `@zoijs/sanitize`** — never `innerHTML`; every `unsafeHTML()` use is reviewed (`grep -R unsafeHTML`, lint rule `zoijs/no-unsafe-html`). [→ 9](#9-sanitize-untrusted-html) · [→ 10](#10-avoid-raw-dom-sinks)
- [ ] **Route params are validated** before they reach a path, URL, or permission decision. [→ 11](#11-treat-router-parameters-as-data)
- [ ] **URLs you build are validated** — redirects, API URLs, URLs handed to other libraries. [→ 12](#12-validate-the-urls-your-code-builds)
- [ ] **No secrets in the browser** — nothing in modules, import maps, config, or storage is secret. [→ 13](#13-keep-secrets-off-the-client)
- [ ] **Error monitoring** — `configure({ onError })` sends scrubbed reports. [→ 14](#14-monitor-errors-with-onerror)
- [ ] **HTTPS everywhere**, with `Secure` cookies. [→ 15](#15-serve-over-https)
- [ ] **The dev server never faces the internet** — deploy the static files to a real host. [→ 16](#16-never-deploy-the-development-server)
- [ ] **Headers verified** on the live site (`curl -sI`). [→ 17](#17-set-and-verify-deployment-headers)
- [ ] **Compatible versions** — every `@zoijs/*` package's peer range includes your core. [→ 18](#18-keep-package-versions-compatible)

---

## 1. Use the production entry

Deploy with `@zoijs/core/prod` *(next release)*. It is the same API as `@zoijs/core`, but it
starts in production mode:

```html
<script type="importmap">
  { "imports": { "@zoijs/core": "./vendor/zoijs/core/prod.js" } }
</script>
```

A bundler's production build selects it automatically through the package's `"production"`
export condition. For a CDN, map to the exact `…/src/prod.js` URL (its integrity hash is
generated alongside the others — see [3](#3-use-integrity-for-external-modules)).

What production mode changes, and what it doesn't:

| | Production mode |
|---|---|
| Development warnings and the devtools hook | **off** |
| Escaping, URL/attribute guards, forged-result rejection, the `html` tagged-template check | **unchanged — always on** |
| Error containment and `configure({ onError })` | **unchanged — always on** |

If a page runs the development entry on a non-`localhost` host, Zoijs warns once in the
console. Details: [Production mode](concepts/production-mode.md).

## 2. Pin exact framework versions

Two different things, both needed:

- **No-build / CDN apps — reproducible URLs.** Use exact versions and exact file URLs:
  `https://cdn.jsdelivr.net/npm/@zoijs/core@1.8.0/src/index.js`, never `@1`, `@latest`, or a
  package root that the CDN resolves for you. A floating URL changes what your users run
  without a deploy.
- **npm apps — reproducible installs.** Commit `package-lock.json` and install with
  `npm ci`. Keep normal semver ranges (`^1.8.0`) in `package.json`; the lockfile is what
  pins. Don't exact-pin `peerDependencies` — package peer ranges state *compatibility*
  ([18](#18-keep-package-versions-compatible)), not the version you ship.

Also: review dependency updates before merging them, and prefer `npm ci --ignore-scripts`
where your dependencies don't need install scripts (Zoijs packages have none).

## 3. Use integrity for external modules

If you load modules from a CDN, give **every module file** an import-map `integrity`
entry. The browser then refuses any file whose bytes differ (supported in Chrome 127+,
Firefox 138+, Safari 18+; older browsers ignore the field and load without the check).

The exact, generated map is in [Installation → From a CDN](installation.md#from-a-cdn),
with the command that produces it from the published npm tarball. Use jsDelivr's
`/npm/` file URLs — they serve the tarball's files unmodified. Services that rewrite
modules (e.g. esm.sh) can't be integrity-pinned.

The alternative is to **vendor** the files (copy `src/` of an exact released version into
your project). Then nothing is fetched from a third party at runtime, and
`script-src 'self'` covers it.

## 4. Set a strict Content Security Policy

Send the policy as an HTTP **response header** (see [17](#17-set-and-verify-deployment-headers)
for hosts). A `<meta http-equiv>` policy ignores `frame-ancestors`, so use it only where you
can't set headers.

### The baseline policy

For a self-hosted (vendored or npm + import map) Zoijs app:

<!-- csp-baseline:start -->
```
default-src 'self'; script-src 'self' 'sha256-REPLACE_WITH_YOUR_IMPORT_MAP_HASH'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
```
<!-- csp-baseline:end -->

`REPLACE_WITH_YOUR_IMPORT_MAP_HASH` is not a real value — compute yours as shown in
[Import maps and CSP](#import-maps-and-csp). If your app has no inline import map, drop that
source and keep `script-src 'self'`.

What each directive does:

| Directive | Why |
|---|---|
| `default-src 'self'` | Anything not listed below loads only from your origin. |
| `script-src 'self' 'sha256-…'` | Scripts from your origin, plus exactly your inline import map. Zoijs needs no `'unsafe-eval'` and injects no inline scripts or handlers. |
| `style-src 'self'` | Stylesheets from your origin. See [style attributes](#style-attributes) if you bind `style`. |
| `img-src 'self'` | Images from your origin. |
| `connect-src 'self'` | `fetch` (including `resource`/`action` fetchers) only to your origin. |
| `object-src 'none'` | No `<object>`/`<embed>` plugin content. Zoijs never needs it. |
| `base-uri 'none'` | Blocks a `<base>` element, which would change how every relative URL — including your module and import-map URLs — resolves. Zoijs never uses `<base>`; the router's `base` option is plain JavaScript and is unaffected. |
| `form-action 'self'` | Forms submit only to your origin. |
| `frame-ancestors 'none'` | No site (including yours) can frame the page — clickjacking protection. |

**`frame-ancestors`: `'none'` vs `'self'`.** `'none'` is the safer default for apps that are
never framed. If your app intentionally frames its own pages, use `'self'`; if a known partner
embeds it, list that exact origin (`frame-ancestors https://partner.example`). Never use `*`.

### Application-specific additions

Add only what your app actually uses, as exact origins (never `*`):

| Your app… | Add |
|---|---|
| loads `@zoijs/*` from jsDelivr | `https://cdn.jsdelivr.net` to `script-src` — see [CDN vs self-hosted](#cdn-vs-self-hosted) |
| calls an API on another origin | that origin to `connect-src` (e.g. `connect-src 'self' https://api.example.com`) |
| shows images from a CDN or user uploads | that origin to `img-src` |
| renders `data:image/*` URLs (Zoijs allows raster `data:` images in `src`) | `data:` to `img-src` |
| submits a `<form>` to another origin | that exact origin to `form-action` |
| uses web fonts from another origin | that origin to `font-src` |
| binds `style` or writes static `style="…"` attributes | `style-src-attr 'unsafe-inline'` — see [style attributes](#style-attributes) |
| server-renders inline data with an executable `<script>` | a per-request nonce — see [8](#8-embed-serialize-output-only-in-a-script-body) |

### CDN vs self-hosted

| | Self-hosted / vendored | jsDelivr CDN |
|---|---|---|
| `script-src` | `'self' 'sha256-<import map>'` | `'self' https://cdn.jsdelivr.net 'sha256-<import map>'` |
| Third party at runtime | none | jsDelivr |
| Integrity | not needed (your origin) | **required** — import-map `integrity` for every file |

`script-src 'self'` alone does **not** allow CDN modules — the browser blocks them. You can
narrow the CDN source to a path, `https://cdn.jsdelivr.net/npm/@zoijs/`, so other packages on
the same CDN aren't allowed; add each other package's path the same way.

### Import maps and CSP

An inline `<script type="importmap">` is governed by `script-src`, and browsers don't
support external import maps (`src=`). So a strict policy must allow the map explicitly:

- **Hash (static hosting).** Add `'sha256-<hash>'` of the map's exact contents — every
  character between `<script type="importmap">` and `</script>`, whitespace included. The
  hash changes whenever the map changes (switching to the production entry, a version bump,
  reformatting), so compute it from the file you deploy, as a deploy step:

  ```bash
  node -e 'const s=require("fs").readFileSync("index.html","utf8");for(const m of s.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g))console.log("sha256-"+require("crypto").createHash("sha256").update(m[1]).digest("base64"))'
  ```

- **Nonce (server-rendered pages).** If a server renders each response, put a fresh random
  `nonce` on the map (`<script type="importmap" nonce="…">`) and in `script-src 'nonce-…'`.
  Never reuse a nonce across responses.
- **No map at all.** Rewrite bare `@zoijs/*` specifiers to absolute vendored paths at build
  time; then `script-src 'self'` needs no hash.

Don't fall back to `'unsafe-inline'` to make the map load — it allows every inline script.

Also don't combine an inline import map with `modulepreload` on a host that hoists preloads
into a `Link` header — the map is discarded. See [Deployment](deployment.md#import-maps--modulepreload-can-cancel-each-other-out).

### Style attributes

`style-src 'self'` also blocks inline `style="…"` **attributes**, including ones Zoijs sets:
a `style=${…}` binding (string or object form) is applied with `setAttribute("style", …)`,
and `@zoijs/ssr` emits `style="…"` in its HTML. If your templates use `style` attributes,
add `style-src-attr 'unsafe-inline'` — it allows inline style attributes only, not `<style>`
elements or stylesheets. Otherwise, use classes (and CSS custom properties set from a class)
and keep `style-src 'self'`. The router outlet needs no exception on `@zoijs/router` ≥ 0.5.0
([details](deployment.md#a-strict-style-src-self-and-the-router-outlet)).

### Trusted Types (optional hardening)

Adding `require-trusted-types-for 'script'; trusted-types zoijs;` makes the browser reject
string assignments to HTML sinks (`innerHTML`, …) anywhere on the page. Zoijs's template
parsing goes through a policy named `zoijs`, which only ever receives HTML built from your
static template strings — and `html()` refuses runtime arrays and data (`ZJS010`,
*(next release)*), so data can't reach it. Know the current limits before enabling it:

- **`@zoijs/sanitize` doesn't support enforced Trusted Types yet.** It parses with
  `DOMParser`, a Trusted Types sink, without a policy, so under enforcement `sanitize()`
  will fail. Don't enable enforcement on pages that sanitize.
- **One copy of `@zoijs/core` per page.** Each copy tries to create the `zoijs` policy; a
  second copy's attempt is refused by `trusted-types zoijs` and its rendering fails. Map every
  package to one core (an import map does this), or add `'allow-duplicates'`.
- `unsafeHTML()` never uses the `zoijs` policy: pass it a `TrustedHTML` from your own policy
  (add that policy's name to `trusted-types`); a plain string is refused.
- Trusted Types complements correct input handling and CSP — it doesn't validate your data,
  and it doesn't make your own code's sinks safe; it only makes them fail loudly.

## 5. Protect state-changing requests against CSRF

**Zoijs does not replace server-side CSRF protection.** `resource`, `action`, and plain
`fetch` are just `fetch` — whatever the browser attaches automatically (cookies), it
attaches for an attacker's page too.

- **Cookie / session authentication: CSRF protection is required** on every
  state-changing request (POST/PUT/PATCH/DELETE — and never change state on GET). Use what
  your server framework provides, typically a combination of:
  - `SameSite=Lax` or `Strict` session cookies (a strong default, not complete on its own —
    e.g. same-site subdomains and top-level GETs);
  - a CSRF token (synchronizer token or signed double-submit) sent in a header or form field;
  - `Origin` (or `Referer`) validation against an allowlist on the server.
- **Bearer-token APIs** (`Authorization: Bearer …` added by your code, not by the browser):
  classic CSRF doesn't apply in the same way, because the browser doesn't attach the token
  to a forged request. The token itself then needs protecting from XSS — see
  [13](#13-keep-secrets-off-the-client).

Sending a token from an `action`:

```js
const save = action((data) =>
  fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify(data),
  }).then((r) => {
    if (!r.ok) throw new Error(`Save failed (${r.status})`);
    return r.json();
  })
);
```

Where `csrfToken` comes from is your server's choice (a cookie readable by script for
double-submit, a server-rendered value, a token endpoint). A client-side check never
replaces the server's verification.

## 6. Configure credentials deliberately

`fetch` defaults to `credentials: "same-origin"`: cookies go to your own origin and not
elsewhere. Change it only on purpose:

- `credentials: "include"` sends cookies to **another** origin. That origin must answer with
  `Access-Control-Allow-Credentials: true` and an exact `Access-Control-Allow-Origin` (never
  `*` — browsers refuse it with credentials, and a server that reflects any `Origin` back is
  equivalent to `*`). Every credentialed cross-origin endpoint is then CSRF-exposed and
  needs [5](#5-protect-state-changing-requests-against-csrf).
- `credentials: "omit"` for third-party APIs that shouldn't see your cookies.
- Add the API origin to `connect-src`.

Zoijs packages never add credentials on their own — `resource` and `action` run the
function you give them.

## 7. Authorize on the server

**Client-side route checks, hidden UI, and disabled buttons are not authorization.** Anyone
can call your API directly or edit the page's JavaScript. The server must check, on every
request, that the caller may read that data or perform that action. Client-side checks are
for user experience only — this includes any route guard, now or in the future.

## 8. Embed `serialize()` output only in a script body

[`serialize()`](../../ssr/README.md#passing-data-to-the-client-serialize) from `@zoijs/ssr`
escapes `<`, `>`, `&`, U+2028 and U+2029, so the output can't close a `<script>` element or
open an HTML comment inside it. It does **not** escape quotes. So:

> `serialize()` output is for the body of a `<script>` element, exactly as below. Do not move
> the serialized string into HTML attributes, raw HTML, URLs, `<style>` blocks, or any other
> context.

**Recommended (works under a strict CSP):** a JSON data block. It isn't executed, so it needs
no CSP allowance:

```js
// server
const page = `<script type="application/json" id="app-data">${serialize(data)}</script>
<div id="app">${body}</div>`;
```

```js
// client
const data = JSON.parse(document.getElementById("app-data").textContent);
```

The executable form, `<script>window.__DATA__ = ${serialize(data)}</script>`, is also safe
to embed, but it's an inline script: a strict CSP must allow it with a per-request nonce
(the data changes per request, so a hash doesn't fit).

**Page globals and ids.** Elements with an `id` become properties of `window` (DOM
clobbering), and `getElementById` returns the first match. So:

- Put the data block **before** any user content (e.g. in `<head>`), and read it by id
  before rendering.
- Content passed through `@zoijs/sanitize` can't claim your names: its ids are namespaced
  (`user-content-…`) and `name` is removed *(next release)*, so it can't become `__DATA__`
  or `app-data`. This complements safe serialization — it doesn't replace it.
- Don't bind `id=${…}` (or `name`) from untrusted data in your own templates.

## 9. Sanitize untrusted HTML

| Content | Use |
|---|---|
| Your markup | `` html`…` `` tagged templates. Interpolated values are always data. |
| HTML from users, a CMS, markdown | [`@zoijs/sanitize`](../../sanitize/README.md): `` html`<article>${() => sanitize(body)}</article>` `` |
| Raw HTML you have independently established as trusted | `unsafeHTML()` from `@zoijs/core/unsafe` *(next release)* — **bypasses escaping**; never for API, database, URL, storage or user input |

`html` can't be used as an HTML parser: calling it as a function with runtime data —
strings, arrays, JSON — throws `ZJS010` *(next release)*. `sanitize()` is allowlist-based,
reuses Zoijs's URL guards, removes `name`, and namespaces ids and same-document references
(`#fragment`, `headers`, ARIA ids) so sanitized content can't clobber page globals
*(next release)*. Pass `idPrefix` to change the prefix. For fully adversarial input in
high-value contexts, prefer an independently audited sanitizer such as DOMPurify.

**`unsafeHTML()`** is the one sanctioned raw-HTML route, for markup you control end to end (your own
build output, a fragment your trusted backend renders). It does not sanitize. Every use is an import
from `@zoijs/core/unsafe`, so review them with `grep -R unsafeHTML` and the `zoijs/no-unsafe-html`
lint warning; keep reviewed ones with an `eslint-disable-next-line … -- <reason>` comment. Under
enforced Trusted Types it needs a `TrustedHTML` from your own policy — a plain string is refused.
Details: [Security → `unsafeHTML()`](security.md#unsafehtml--the-one-escape-hatch).

## 10. Avoid raw DOM sinks

Zoijs can't protect code that bypasses it. Never give untrusted data to:

- `element.innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`;
- `DOMParser.parseFromString`, `Range.createContextualFragment`;
- `eval`, `new Function`, string `setTimeout`/`setInterval`;
- a DOM node you build from untrusted data and return from a binding (Zoijs inserts nodes
  as-is);
- `unsafeHTML()` — its whole purpose is to skip escaping.

If you need trusted raw markup, use `unsafeHTML()` rather than `ref` + `innerHTML`: it's
reviewable, lint-flagged, and respects Trusted Types.

The `zoijs/no-html-call` lint rule (in `recommended`) flags direct `html(…)` calls.

## 11. Treat router parameters as data

`@zoijs/router` passes params **decoded** with `decodeURIComponent`, after the path is split
into segments. An encoded slash therefore survives as a real `/` inside one param:

```
route "/files/:name",  URL /files/..%2Fadmin  →  params.name === "../admin"
```

(Malformed escapes are passed through undecoded.) Params come from the URL, so they're
attacker-controlled. Before using one:

- **Validate** it against the format you expect: `/^\d+$/` for an id, an allowlist for a
  section name.
- **Keep slashes encoded** with `createRouter(routes, { decodeSlash: false })` *(next release)*:
  `/files/..%2Fadmin` then gives `"..%2Fadmin"` instead of `"../admin"`.
- **Encode** it when building another URL: `` `/api/files/${encodeURIComponent(params.name)}` ``,
  never raw concatenation into an API path, filesystem path, or redirect.
- **Authorize on the server** — a param naming a resource doesn't mean the user may access it
  ([7](#7-authorize-on-the-server)).

Rendering a param in a template is safe (`` html`<h1>${params.id}</h1>` `` is text). The risk
is what *your code* does with it.

## 12. Validate the URLs your code builds

Zoijs scheme-checks the URLs a bound value can carry — URL attributes (`href`, `src`, `action`,
`formaction`, …), every `srcset` candidate, `<meta http-equiv="refresh">` content, and SVG
animation values aimed at `href` *(srcset/refresh/SVG: next release)*: `javascript:`, `vbscript:`,
`data:text/html`, SVG `data:` URLs and unknown schemes are dropped. `<base>` can't be bound at all,
and `target="_blank"` always gets `rel="noopener noreferrer"`. These checks are about
**executable schemes** and navigation contexts — they don't know your business rules, and they don't cover:

- URLs you pass to `fetch`, `location.assign`, `window.open`, or a third-party library;
- open redirects (`?next=https://evil.example` is a valid `https:` URL) — note `router.go()` takes
  only app paths and throws on absolute URLs *(next release)*, but `location.assign()` doesn't;
- which hosts your API calls may reach.

Validate those yourself — parse with `new URL(value, location.origin)` and check `origin`
against an allowlist for redirects and API calls.

## 13. Keep secrets off the client

**Anything shipped to the browser is public.** Never put database passwords, private API
keys, service credentials, or signing keys in JavaScript modules, import maps, HTML, config
files served with the app, or browser storage. Call a server you control, which holds the
secret.

Browser storage (`localStorage`, `sessionStorage`, IndexedDB — and therefore
`@zoijs/storage`) is readable by any script on your origin, so an XSS bug exposes it. Use it
for preferences, drafts, and UI state — not for secrets. For session authentication, prefer
server-set `HttpOnly` cookies (which page JavaScript can't read or set).

## 14. Monitor errors with `onError`

Zoijs contains many failures to keep the page running (a throwing binding, a `boundary`
fallback, a failed `resource`). Observe them in production *(next release)*:

```js
import { configure } from "@zoijs/core";

configure({
  onError(error, info) {
    monitoring.capture(scrub(error), { kind: info.kind, component: info.component });
  },
});
```

- It receives the failures Zoijs **contains** (`info.kind`: `binding`, `effect`, `computed`,
  `cleanup`, `boundary`, `resource`, `action`). Errors that already escape (a component
  throwing outside a `boundary`, event handlers, server rendering) still escape — keep your
  global `error`/`unhandledrejection` reporting too.
- Production mode does not disable it.
- Error messages can contain user or application data: **scrub before sending** to any
  external service. Any monitoring tool works; none is required.

Details: [Error monitoring](api-reference.md#error-monitoring-configure-onerror-).

## 15. Serve over HTTPS

Serve every page and module over HTTPS (most static hosts do by default), and redirect HTTP
to HTTPS. Once you're sure the whole site is HTTPS-only, add
`Strict-Transport-Security: max-age=31536000` at the host.

Cookies are set by your **server**, not by Zoijs: mark session cookies `Secure`, `HttpOnly`,
and an appropriate `SameSite` (`Lax` is a sensible default). Client-side code can't create
`HttpOnly` cookies.

## 16. Never deploy the development server

`create-zoijs`'s `dev-server.mjs` is for development only. It listens on `127.0.0.1` by
default, refuses dotfiles, traversal, and symlinks out of the project, and sends
`nosniff`/`no-store` — but it isn't a production web server. `ZOIJS_HOST=0.0.0.0` exposes your
project files to the network while it runs; use it only on a network you trust. Deploy the
static files to a real host ([Deployment](deployment.md#host-setup)). The generated
project's README (*Develop*) and the comment at the top of `dev-server.mjs` list its exact
behavior.

## 17. Set and verify deployment headers

The canonical header set:

```
Content-Security-Policy: <the baseline policy, plus your additions>
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Trim or extend `Permissions-Policy` to the features your app uses — the line above just turns
off three powerful ones most apps don't need.

In the recipes below, replace the CSP with your final policy (computed import-map hash
included). They are complete headers files for the hosts in [Deployment](deployment.md);
combine them with that page's SPA-fallback rules.

### Netlify and Cloudflare Pages — `_headers`

Both read a `_headers` file at the publish/output root, in the same format:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-REPLACE_WITH_YOUR_IMPORT_MAP_HASH'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Vercel — `vercel.json`

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'sha256-REPLACE_WITH_YOUR_IMPORT_MAP_HASH'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

(Keep your `rewrites` from [Deployment](deployment.md#vercel) in the same file.)

### nginx

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-REPLACE_WITH_YOUR_IMPORT_MAP_HASH'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
```

nginx drops inherited `add_header` lines in any block that declares its own, so repeat them
in a `location` that adds headers (e.g. a caching rule).

### Apache — `.htaccess`

```apache
<IfModule mod_headers.c>
  Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-REPLACE_WITH_YOUR_IMPORT_MAP_HASH'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
</IfModule>
```

### GitHub Pages

GitHub Pages doesn't let you set custom response headers. The closest option is a CSP
`<meta>` tag as the **first** element in `<head>` (before the import map):

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-REPLACE_WITH_YOUR_IMPORT_MAP_HASH'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'">
```

Browsers ignore `frame-ancestors` in a `<meta>` policy, so there's no clickjacking protection,
and `nosniff`, `Referrer-Policy`, and `Permissions-Policy` can't be set (a
`<meta name="referrer">` tag covers the referrer policy only). If you need those, put a CDN or
proxy that can set headers in front, or use another host.

### Verify

After every deploy, check the live response — not your config file:

```bash
curl -sI https://your-site.example/ | grep -iE 'content-security-policy|x-content-type-options|referrer-policy|permissions-policy'
```

Then open the site with the browser console open: a CSP violation (most often a stale
import-map hash) is reported there.

## 18. Keep package versions compatible

Each `@zoijs/*` package declares the lowest `@zoijs/core` it works with in
`peerDependencies`. Keep your core inside every package's range, load **one** copy of the
core per page (map every package to the same core URL), and upgrade the core first when a
package needs a newer one. Older cores lack security fixes — don't pin below the current
release line.

---

**Related:** [Security model](security.md) · [Deployment](deployment.md) ·
[Production mode](concepts/production-mode.md) · [Installation](installation.md)
