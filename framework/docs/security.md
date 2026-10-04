# Security

Zoijs is **secure by default**. The safe path is the only path you'll normally use — you have to go out of your way to do something dangerous, and several dangerous things are simply blocked.

This page explains the rendering model. To deploy, use the
[production security checklist](production-security.md).

## Threat model

Untrusted data (user input, API responses, URL params, stored content) flows into your templates. The goal: that data can **never** become executable script, markup, an event handler, or a dangerous URL.

The core guarantee: **dynamic values fill text and attribute *slots* only — they can never change a template's structure.** The template scanner keeps your static HTML and your `${}` values in separate channels and refuses to put a value where a tag name, attribute name, or raw-HTML sink would go.

## Safe rendering rules

| What you write | What happens | Safe? |
|---|---|---|
| `${() => value}` in text | rendered as an **inert Text node** (escaped) | ✅ always |
| `attr=${() => value}` | set via `setAttribute` (or property for `value`/`checked`) | ✅ |
| URL attrs (`href`, `src`, `action`, `formaction`, `poster`, `ping`, `data`, `xlink:href`) | **scheme-checked** | ✅ unsafe schemes blocked |
| `srcset` / `imagesrcset`, `<meta http-equiv="refresh"> content`, SVG `<animate>`/`<set>` values aimed at `href` | **every URL inside is scheme-checked** | ✅ one unsafe URL refuses the value |
| `<base …=${x}>`, `<meta http-equiv=${x}>`, SVG `attributeName=${x}` | **compile error** | ✅ data can't steer resolution/navigation |
| `target="_blank"` on `<a>`/`<area>`/`<form>` | **`rel` gets `noopener noreferrer`** | ✅ no `window.opener`, no Referer |
| `onclick=${fn}` | `addEventListener` with a **function reference** | ✅ strings ignored |

### Text is always escaped

```js
html`<p>${() => userInput}</p>`;
// userInput = "<img src=x onerror=alert(1)>"  →  shown as literal text. No element, no execution.
```

Only results created by `html` and `each()` are rendered as markup. They carry a
Symbol brand that JSON and other data can't reproduce, so an object from an API
shaped like an internal result (`{"__zoijsTemplate": true, …}`) is still just data
and renders as text, on the client and under `@zoijs/ssr`.

### URLs are scheme-validated

Allowed: `http`, `https`, `mailto`, `tel`, relative URLs, and raster `data:image/*` (png/jpeg/gif/webp/avif/bmp/ico). Blocked: `javascript:`, `vbscript:`, `data:text/html`, `data:image/svg+xml`, and any unknown scheme. The check also strips control characters first, so tricks like `java\tscript:` don't slip through.

```js
html`<a href=${() => url}>link</a>`;
// url = "javascript:alert(1)"  →  href is not set.
```

The same check covers every URL a bound value can carry, in every mode (dev or production), on
the client and in `@zoijs/ssr`. A refused value is not set (development mode warns, naming the
attribute but not the value):

- **`srcset` / `imagesrcset`** — each candidate URL is checked (parsed as HTML does, so a
  `data:image/…` URL keeps its commas); one unsafe candidate refuses the whole value.
- **`<meta http-equiv="refresh" content=${…}>`** — the refresh URL (`0;url=…`, `0;URL='…'`, or
  `0 …`) is found the way the browser finds it and checked; a value that isn't a valid refresh is
  refused rather than guessed. Binding `http-equiv` itself is a compile error.
- **SVG `<animate>`/`<set>`** — `from`/`to`/`by`/`values` are checked when the (static)
  `attributeName` is a URL attribute such as `href`; binding `attributeName` is a compile error.
- **`<base>`** — can't be bound at all (compile error), however safe the value looks: it changes
  how every relative URL on the page resolves. Write it in the source (`<base href="/app/">`), or
  use the router's `base` option.

### `target="_blank"` opens without `window.opener`

A Zoijs-rendered `<a>`, `<area>`, or `<form>` whose `target` is `_blank` — bound or written
statically — always gets `rel` tokens `noopener` (the new page can't reach `window.opener`) and
`noreferrer` (no `Referer` header is sent, a privacy default). They are merged into your own
tokens (`rel="external"` → `external noopener noreferrer`), never duplicated, kept in place when
`rel` updates, and dropped again if `target` changes away from `_blank` — whatever the attribute
order. (Modern browsers already imply `noopener` for `_blank`; this makes it explicit everywhere,
including server HTML.) Static markup elsewhere is your code and isn't rewritten — and
`unsafeHTML()` markup is inserted exactly as written.

### Event handlers are functions, never strings

```js
html`<button onclick=${doThing}>x</button>`;     // ✅ function reference
html`<button onclick=${"doThing()"}>x</button>`; // ⚠️ ignored — a string is never wired up or eval'd
```

### Markup comes only from tagged templates

Zoijs accepts markup through `html` tagged templates. Runtime data such as API responses,
JSON, storage values, URL parameters, strings, and ordinary arrays cannot be passed to
`html()` and compiled as markup — calling it as a function is rejected (`ZJS010`) before
anything is parsed, before the Trusted Types policy, and before any `innerHTML`:

```js
html`<p>${value}</p>`;            // ✅ markup from source; value is data
html(["<p>runtime markup</p>"]);  // ❌ throws ZJS010 — html is not an innerHTML
```

Never pass runtime HTML through `html`. For HTML from users, a CMS, or markdown, use
[`@zoijs/sanitize`](../../sanitize/README.md); otherwise build real elements. Sanitized
content can't clobber page globals: `name` is removed and every `id` is namespaced
(`user-content-…`), so it can't claim names like `__DATA__` that your bootstrap code reads.

**What this check is — and isn't.** The guarantee is that data cannot cross the markup
boundary, accidentally or through attacker-controlled serialization: nothing JSON,
`structuredClone`, storage, or ordinary array code produces passes. It is a structural
check, not a cryptographic or intrinsically unforgeable one. JavaScript currently provides
no standard runtime API for proving that a template strings object came from the
JavaScript parser, so trusted application code *can* deliberately reconstruct the same
object shape. Such code already has equivalent authority to call DOM HTML sinks directly
and is outside the attacker-data boundary. As defense in depth for developer-authored
code, the [`zoijs/no-html-call`](../../eslint-plugin/README.md) lint rule (on in
`recommended`) flags every direct call — `html(…)`, `html.call(…)`, `html.apply(…)`,
`Reflect.apply(html, …)`.

## Unsafe patterns to avoid

These either **throw a clear error** or are **blocked**:

| Pattern | Result | Do this instead |
|---|---|---|
| `<${tag}>` (dynamic tag) | throws | use a conditional returning different templates |
| `<el ${x}>` (dynamic/spread attribute name) | throws | name attributes statically: `disabled=${cond}` |
| `<iframe srcdoc=${html}>` | attribute blocked | don't inject HTML; build real elements |
| `<script>${x}</script>` / `<style>${x}</style>` | throws | never interpolate into script/style (injection surface) |
| `onclick="a ${fn}"` (multi-part handler) | throws | `onclick=${fn}` |
| `html([...])` / `html(strings)` (calling `html` as a function) | throws `ZJS010` | write a tagged template; for untrusted HTML use `@zoijs/sanitize` |
| `el.innerHTML = data` (your own code) | **bypasses Zoijs entirely** | never assign untrusted data to `innerHTML`; for trusted markup use `unsafeHTML()` (reviewable, Trusted-Types-aware) |
| `title=${unsafeHTML(…)}` (or any attribute) | throws | `unsafeHTML()` is for content positions only |

## Markup, untrusted HTML, and trusted raw HTML

There are exactly three ways markup reaches the page:

| Source | Use | What happens |
|---|---|---|
| Markup you write | `` html`…` `` | static structure from your source; every `${}` value is data |
| Untrusted HTML (users, a CMS, markdown) | [`@zoijs/sanitize`](../../sanitize/README.md): `` html`<article>${() => sanitize(body)}</article>` `` | parsed inertly, allowlist-filtered, returned as **safe DOM nodes** |
| HTML you have deliberately established as trusted | `unsafeHTML()` from **`@zoijs/core/unsafe`** | inserted **raw** — no escaping, no filtering |

For fully adversarial input in high-value contexts, prefer a dedicated, independently-audited
sanitizer (e.g. DOMPurify) and treat that boundary as security-critical.

### `unsafeHTML()` — the one escape hatch

> **`unsafeHTML()` bypasses normal escaping. Never pass API, database, URL, storage, or user input
> to it unless that content has been independently established as trusted.** It does not sanitize.

```js
import { unsafeHTML } from "@zoijs/core/unsafe";

// Markup your own build or publishing pipeline produced and controls end to end.
html`<article>${unsafeHTML(trustedCmsFragment)}</article>`;
```

If the CMS content can be written by users or third parties, it is **untrusted** — use
`sanitize()` instead. Don't wrap `sanitize()` output in `unsafeHTML()`: `sanitize()` already returns
DOM nodes that render directly.

How it's fenced in:

- **Opt-in by import.** It is only exported from `@zoijs/core/unsafe` — never from `@zoijs/core` —
  so every use is a visible import, `grep -R unsafeHTML` finds them all, and the
  [`zoijs/no-unsafe-html`](../../eslint-plugin/README.md) lint rule warns on each one (keep a
  reviewed use with `// eslint-disable-next-line zoijs/no-unsafe-html -- <why it's trusted>`).
  The default entry never loads it.
- **Data can't impersonate it.** Results carry a Symbol brand (like `html` results), so JSON or
  other data shaped like one renders as text.
- **Content positions only.** It works where a child value goes (`${…}` between tags, including
  `${() => unsafeHTML(src.get())}`, which replaces its nodes on change). In an attribute, a URL, an
  event handler, a `ref`, or `<textarea>`/`<title>` content it throws instead of being stringified;
  `<script>`/`<style>` holes remain compile errors.
- **Trusted Types.** It accepts a string or a real `TrustedHTML`, and passes the value to the DOM
  as-is — never through Zoijs's own `zoijs` policy. On a page that enforces Trusted Types, a plain
  string is therefore refused (a clear `TypeError` when it's inserted); create the `TrustedHTML`
  with your own policy (`trusted-types zoijs my-app`). Without Trusted Types, a string works, and
  development mode warns once that it bypasses escaping.
- **On the server** (`@zoijs/ssr`), it is the only output that isn't escaped. Node has no
  `TrustedHTML`, so a string is accepted: by calling `unsafeHTML()` the server code asserts trust.
- `<script>` elements in the markup are parsed but don't execute on the client; everything else —
  event-handler attributes, `javascript:` links, styles — is live. That is the point, and the risk.

### A note on `style`

Binding `style=${...}` from a **string** built out of **untrusted** data is risky (CSS can exfiltrate data with `background:url(…)` or enable clickjacking). Zoijs still allows a dynamic string `style` — it's needed for legitimate cases — but prefer the **object form**, which is injection-safe:

```js
html`<div style=${() => ({ width: pct + "%", color: theme })}>…</div>`;
```

Keys and values come from an object, not string concatenation, so a value can never break out of the attribute or inject extra declarations — a value containing `;`/`{`/`}` is dropped, exactly as the browser's CSSOM would reject it. camelCase keys are hyphenated (`backgroundColor` → `background-color`) and custom properties (`--x`) pass through. The server (`@zoijs/ssr`) emits the identical CSS string, so it hydrates cleanly.

If you do pass a **string** `style`, bind it only from data you control. In dev mode, a string `style` containing a risky token (`url(`, `expression(`, a CSS comment) logs a one-time warning nudging you to the object form.

### A note on returning DOM nodes

A text binding can return a DOM `Node` you constructed. Zoijs inserts it as-is — so if *your code* builds a `<script>` node from untrusted input and returns it, that's on you. Build nodes only from trusted data.

## CSP compatibility

Zoijs is friendly to a strict Content Security Policy:

- **No `eval` / `new Function`** anywhere → no `'unsafe-eval'` needed.
- **No inline scripts or inline event handlers** are injected → no `'unsafe-inline'` needed for scripts.
- **Trusted Types** (`require-trusted-types-for 'script'`): Zoijs uses `<template>.innerHTML` with framework-generated HTML built only from your *static* template strings (never data): `html` accepts only tagged-template strings, and interpolated values never enter that HTML. Under Trusted Types it routes the HTML through a pass-through policy named **`zoijs`**, which is only ever reached from that path. Allow it in your CSP:

  ```
  Content-Security-Policy: require-trusted-types-for 'script'; trusted-types zoijs;
  ```

  Trusted Types covers Zoijs's own parsing; it doesn't make your code's direct sinks safe.
  Compatible copies of the core share one runtime and so one `zoijs` policy (created once — no
  `'allow-duplicates'` needed). Current limit: `@zoijs/sanitize` parses with `DOMParser` without
  a policy, so it fails under enforcement.

Two things a strict policy must allow explicitly: an inline **import map** (by its `sha256`
hash, or a nonce) and, if your templates use `style` attributes, `style-src-attr 'unsafe-inline'`
(a `style=${…}` binding is applied as an attribute).

**The full production policy** — `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`,
`frame-ancestors 'none'`, the self-hosted vs CDN differences, and copy-paste headers for
Netlify, Cloudflare Pages, Vercel, nginx, Apache, and GitHub Pages — is in the
[production security checklist](production-security.md#4-set-a-strict-content-security-policy).

## Enforcement (CI gates)

These guarantees are tested on every change, not just asserted here:

- **XSS-corpus fuzzing** (`tests/xss-corpus.test.js`) — a battery of known injection
  vectors pushed through every dynamic channel (text, URL, attribute, event),
  asserting none execute or inject.
- **CSP / Trusted-Types** (`browser-tests/csp.spec.js`) — the app is rendered in a
  real browser under the strict CSP above (`require-trusted-types-for 'script';
  trusted-types zoijs`) and must produce **zero** policy violations.
- **Targeted regressions** (`tests/security.test.js`, `browser-tests/security.spec.js`)
  — scheme checks, blocked sinks, string-handler rejection, dev/prod parity.
- **Supply-chain** (`scripts/check-deps.mjs`) — zero runtime dependencies and the
  star topology (see [`scope.md`](scope.md) §4).

A change that weakens any of these fails the build.

## Summary

- Text → inert, escaped. URLs → scheme-checked. Handlers → functions only.
- `on*` and `srcdoc` attributes are blocked from data; dynamic tag/attribute *names* throw.
- No `eval`, no Virtual DOM. One explicit raw-HTML opt-in, `unsafeHTML()` from `@zoijs/core/unsafe`, for trusted markup only. CSP- and Trusted-Types-friendly.
- The one rule that keeps you safe: **let Zoijs render your data — never hand untrusted data to `innerHTML` yourself.**
- Deploying? Go through the [production security checklist](production-security.md) — CSP and headers, CSRF, credentials, `serialize()`, route params, secrets, and monitoring.
