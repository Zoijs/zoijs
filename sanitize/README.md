<div align="center">

# @zoijs/sanitize

**Turn an untrusted HTML string into safe DOM nodes for [Zoijs](https://zoijs.dev).** Allowlist-based, zero-dependency, and it reuses the core's own URL/attribute guards.

[![npm](https://img.shields.io/npm/v/@zoijs/sanitize.svg)](https://www.npmjs.com/package/@zoijs/sanitize)
[![license](https://img.shields.io/npm/l/@zoijs/sanitize.svg)](LICENSE)

[Documentation](https://zoijs.dev) · [Core package](https://www.npmjs.com/package/@zoijs/core)

</div>

---

`@zoijs/sanitize` is an **optional** package. Zoijs has **no raw-HTML API** by design — a string in a text slot is inert text, and there is deliberately no `unsafeHTML`. But real apps still need to render *rich* HTML they mostly trust: the output of a markdown renderer, a CMS body, an email preview. That boundary is the single most security-critical spot in a front end. `sanitize()` makes it a **supported, tested** path instead of one you solve alone.

## Install

```bash
npm install @zoijs/core @zoijs/sanitize
```

Or with no install, from a CDN: in an import map, point "@zoijs/core" and "@zoijs/sanitize" at
**exact-version** jsDelivr file URLs with integrity hashes, then import by name (so every
package shares one core). See the [CDN guide](https://zoijs.dev/installation#from-a-cdn).

```js
import { sanitize } from "@zoijs/sanitize";
```

## What `sanitize()` does

`sanitize(dirtyHtml)` takes an untrusted HTML string and returns an **array of safe DOM nodes**. It drops straight into a Zoijs text binding — a binding renders returned nodes as-is and tracks them for clean removal on update:

```js
import { html, mount } from "@zoijs/core";
import { sanitize } from "@zoijs/sanitize";

function Post({ bodyHtml }) {
  return html`<article>${() => sanitize(bodyHtml)}</article>`;
}

mount(() => Post({ bodyHtml: renderedMarkdown }), "#app");
```

Everything dangerous is removed; the safe rich text is kept:

```js
sanitize('<p onclick="steal()">Hi <strong>there</strong> <script>evil()</script></p>');
// → nodes for:  <p>Hi <strong>there</strong></p>
```

## Why it's safe

1. **Inert parse.** The string is parsed with `DOMParser` into a document that is never connected — so no script runs and no resource loads during parsing.
2. **Allowlist, not denylist.** Only known-safe elements and attributes survive. Everything else — `script`, `style`, `iframe`, `object`, `embed`, SVG/MathML, every `on*` handler, `srcdoc`, unknown tags — is removed. A denylist can't keep up with parser quirks; an allowlist can.
3. **Same URL guard as the core.** `href` / `src` / `cite` are scheme-checked with the *same* `isSafeUrl` the Zoijs renderer uses, so `javascript:` and `data:text/html` can't slip through — and the decision can never drift from the rest of the framework.
4. **Reverse-tabnabbing guard.** `target="_blank"` links get `rel="noopener noreferrer"`.
5. **No DOM clobbering.** Browsers expose elements by `id` (and some by `name`) as properties of `window`, `document` and forms — so untrusted `<a id="__DATA__">` could shadow `window.__DATA__` (the pattern [`serialize()`](../ssr) data uses) or a config global. Sanitized content therefore lives in its own namespace: `name` is always removed, and every `id` gets a prefix (below).

## IDs and in-page links

Every `id` in sanitized content is prefixed with **`user-content-`**, and the references that point at ids are rewritten to match, so in-page links and accessibility relationships keep working:

```js
sanitize('<a href="#chapter">Jump</a> … <h2 id="chapter">Chapter</h2>');
// → <a href="#user-content-chapter">Jump</a> … <h2 id="user-content-chapter">Chapter</h2>
```

Rewritten with the same prefix: `href="#…"` (same-document fragments only), `headers` on table cells, and the ARIA id references (`aria-labelledby`, `aria-describedby`, `aria-controls`, `aria-owns`, `aria-details`, `aria-errormessage`, `aria-activedescendant`, `aria-flowto`). Every id is prefixed — there's no list of "dangerous" names to keep up to date. Empty ids are removed; duplicate ids stay duplicates (namespaced). To link to a sanitized heading from outside the content, use the prefixed id (`#user-content-chapter`).

Options:

```js
sanitize(html, { idPrefix: "article-" }); // your own namespace
sanitize(html, { idPrefix: "" });         // keep ids exactly as written
```

`idPrefix: ""` is an explicit opt-out for content you control: it lets the markup claim **any** id on the page, which reopens the collision risk. `name` is removed either way. `idPrefix` must be a string (anything else throws a `TypeError`).

Because it returns **live DOM nodes** (not a string), there is no HTML sink for the browser to re-parse — the safe path stays the only path.

## What survives

**Elements** — text and structural content only:

`a` `abbr` `address` `article` `aside` `b` `bdi` `bdo` `blockquote` `br` `caption` `cite` `code` `col` `colgroup` `dd` `del` `details` `dfn` `div` `dl` `dt` `em` `figcaption` `figure` `footer` `h1`–`h6` `header` `hgroup` `hr` `i` `img` `ins` `kbd` `li` `main` `mark` `nav` `ol` `p` `pre` `q` `rp` `rt` `ruby` `s` `samp` `section` `small` `span` `strong` `sub` `summary` `sup` `table` `tbody` `td` `tfoot` `th` `thead` `time` `tr` `u` `ul` `var` `wbr`

**Attributes** — `class`, `id` (prefixed, see above), `title`, `dir`, `lang`, `role`, any `aria-*` / `data-*`, plus per-element ones like `href`, `src`, `alt`, `colspan`, `datetime`, `cite`. The `style` attribute is **dropped** (CSS is an injection surface — bind style through Zoijs's object form instead), and so is `name` (DOM clobbering).

Anything not on these lists is removed.

## The API

| Function | Purpose |
|---|---|
| `sanitize(dirty, options?)` | Sanitize an untrusted HTML string → `Node[]` (safe DOM nodes). `null`/`undefined`/`""` → `[]`. `options.idPrefix` (default `"user-content-"`) namespaces ids — see [IDs and in-page links](#ids-and-in-page-links). |

That's the whole package — one function.

## Server rendering

`sanitize()` returns **live DOM nodes**, so it is a **client** helper — it needs a browser DOM and throws without one. Sanitized content is therefore rendered on the client (it hydrates after load); it is not part of [`@zoijs/ssr`](../ssr) string output. If you need sanitized rich text in your *server-rendered* HTML for SEO, sanitize to a string with a server-side tool in your render pipeline and place it in your shell yourself.

## Threat model & limits

This is a **conservative allowlist sanitizer** for rich text you broadly trust (your own markdown/CMS pipeline). It forbids foreign content (SVG/MathML) and raw-text elements, which removes the common mutation-XSS classes, and it reuses the core's vetted URL/attribute predicates.

It is **not** a drop-in replacement for a dedicated, independently-audited sanitizer when the input is **fully adversarial** and the stakes are high. If you are sanitizing arbitrary attacker-controlled HTML in a high-value context, use a specialized, security-audited library (e.g. DOMPurify) and treat that boundary as security-critical — the same advice the core [security guide](../framework/docs/security.md) gives.

Never assign untrusted data to `innerHTML` yourself: that bypasses Zoijs (and this package) entirely.

**Trusted Types.** `sanitize()` parses with `DOMParser`, which is a Trusted Types sink, and doesn't use a policy — so it fails on pages that enforce `require-trusted-types-for 'script'`. Don't enable that enforcement on pages that sanitize (yet).

Deploying? See the [production security checklist](../framework/docs/production-security.md#9-sanitize-untrusted-html) — it covers sanitized content alongside CSP, `serialize()`, and DOM clobbering.

## License

[MIT](LICENSE) © Zoijs contributors
