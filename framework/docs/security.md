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
| URL attrs (`href`, `src`, `action`, `formaction`, `poster`, `ping`, `xlink:href`) | **scheme-checked** | ✅ unsafe schemes blocked |
| `onclick=${fn}` | `addEventListener` with a **function reference** | ✅ strings ignored |

### Text is always escaped

```js
html`<p>${() => userInput}</p>`;
// userInput = "<img src=x onerror=alert(1)>"  →  shown as literal text. No element, no execution.
```

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

## Unsafe patterns to avoid

These either **throw a clear error** or are **blocked**:

| Pattern | Result | Do this instead |
|---|---|---|
| `<${tag}>` (dynamic tag) | throws | use a conditional returning different templates |
| `<el ${x}>` (dynamic/spread attribute name) | throws | name attributes statically: `disabled=${cond}` |
| `<iframe srcdoc=${html}>` | attribute blocked | don't inject HTML; build real elements |
| `<textarea>${x}</textarea>` | throws | bind the property in code |
| `onclick="a ${fn}"` (multi-part handler) | throws | `onclick=${fn}` |
| `el.innerHTML = data` (your own code) | **bypasses Zoijs entirely** | never assign untrusted data to `innerHTML` |

There is intentionally **no raw-HTML rendering API** in Zoijs. If you genuinely need to render trusted HTML (e.g. sanitized markdown), sanitize it yourself with a vetted library and build DOM — and treat that boundary as security-critical.

### A note on `style`

Binding `style=${...}` from **untrusted** data is risky (CSS can exfiltrate data or enable clickjacking). Zoijs allows dynamic `style` (it's needed for legitimate cases), but only bind it from data you control.

### A note on returning DOM nodes

A text binding can return a DOM `Node` you constructed. Zoijs inserts it as-is — so if *your code* builds a `<script>` node from untrusted input and returns it, that's on you. Build nodes only from trusted data.

## CSP compatibility

Zoijs is friendly to a strict Content Security Policy:

- **No `eval` / `new Function`** anywhere → no `'unsafe-eval'` needed.
- **No inline scripts or inline event handlers** are injected → no `'unsafe-inline'` needed for scripts.
- **Trusted Types** (`require-trusted-types-for 'script'`): Zoijs uses `<template>.innerHTML` with framework-generated HTML built only from your *static* template strings (never data). Under Trusted Types it routes that through a pass-through policy named **`zoijs`**, which is safe by construction. Allow it in your CSP:

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
