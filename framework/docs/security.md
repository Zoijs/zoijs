# Security

Zoijs is **secure by default**. The safe path is the only path you'll normally use — you have to go out of your way to do something dangerous, and several dangerous things are simply blocked.

## Threat model

Untrusted data (user input, API responses, URL params, stored content) flows into your templates. The goal: that data can **never** become executable script, markup, an event handler, or a dangerous URL.

The core guarantee: **dynamic values fill text and attribute *slots* only — they can never change a template's structure.** The template scanner keeps your static HTML and your `${}` values in separate channels and refuses to put a value where a tag name, attribute name, or raw-HTML sink would go.

## Safe rendering rules

| What you write | What happens | Safe? |
|---|---|---|
| `${() => value}` in text | rendered as an **inert Text node** (escaped) | ✅ always |
| `attr=${() => value}` | set via `setAttribute` (or property for `value`/`checked`) | ✅ |
| URL attrs (`href`, `src`, `action`, `formaction`, `poster`, `ping`, `data`, `xlink:href`) | **scheme-checked** | ✅ unsafe schemes blocked |
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
[`@zoijs/sanitize`](../../sanitize/README.md); otherwise build real elements.

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
| `el.innerHTML = data` (your own code) | **bypasses Zoijs entirely** | never assign untrusted data to `innerHTML` |

There is intentionally **no raw-HTML rendering API** in Zoijs. If you genuinely need to render *rich* HTML you broadly trust (e.g. markdown or CMS output), use the optional [`@zoijs/sanitize`](../../sanitize/README.md) package: `sanitize(dirtyHtml)` parses the string inertly and returns **safe DOM nodes** (allowlist-based, reusing the same URL/attribute guards described above) that drop straight into a text binding — `html\`<article>${() => sanitize(body)}</article>\``. For fully adversarial input in high-value contexts, prefer a dedicated, independently-audited sanitizer (e.g. DOMPurify) and treat that boundary as security-critical.

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

A recommended baseline:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; require-trusted-types-for 'script'; trusted-types zoijs;
```

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
- No `eval`, no Virtual DOM, no raw-HTML API. CSP- and Trusted-Types-friendly.
- The one rule that keeps you safe: **let Zoijs render your data — never hand untrusted data to `innerHTML` yourself.**
