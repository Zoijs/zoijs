// @zoijs/sanitize — turn an untrusted HTML string into safe DOM nodes.
//
//   import { html, mount } from "@zoijs/core";
//   import { sanitize } from "@zoijs/sanitize";
//
//   // markdown/CMS body → safe nodes, dropped into a text slot as-is
//   html`<article>${() => sanitize(post.bodyHtml)}</article>`;
//
// In Zoijs a string in a text slot is always inert text. But real apps still need to
// render *rich* HTML they don't control — the output of a markdown renderer, a CMS
// field. That's the single most security-critical boundary in a front end, and
// `sanitize()` makes it a supported, tested path. (Trusted raw markup has a separate,
// explicit opt-in — `unsafeHTML()` from @zoijs/core/unsafe — which never sanitizes.)
//
// How it stays safe:
//   1. The string is parsed with `DOMParser` into an INERT document — scripts never
//      run and no resources load, because the document is never connected.
//   2. The tree is pruned against an ALLOWLIST: only known-safe elements and
//      attributes survive; everything else (script/style/iframe/object/svg/…, every
//      `on*` handler, `srcdoc`, unknown tags) is dropped — a denylist can't keep up
//      with parser quirks, an allowlist can.
//   3. URL-bearing attributes (`href`, `src`, `cite`) are scheme-checked with the
//      SAME `isSafeUrl` the core renderer uses, so `javascript:`/`data:text/html`
//      can't slip through and the decision can't drift from the rest of Zoijs.
//   4. `target="_blank"` links get `rel="noopener noreferrer"` (no reverse-tabnabbing).
//   5. Untrusted markup can't claim page-level names (DOM clobbering): `name` is always
//      removed, and every `id` is namespaced with a prefix (default `user-content-`), so
//      `<a id="__DATA__">` can't shadow `window.__DATA__`. Same-document references —
//      `href="#…"`, `headers`, and ARIA ID references — are rewritten to match.
//
// It returns an ARRAY OF NODES (not a string, not a fragment) so it composes with a
// Zoijs binding: each node is tracked and removed cleanly on update/unmount. Because
// it returns live DOM, it is a CLIENT helper — sanitized content is not part of
// `@zoijs/ssr` string output (see README "Server rendering").
//
// Scope, honestly: this is a conservative allowlist sanitizer for rich text you
// broadly trust. It forbids foreign content (SVG/MathML) and raw-text elements,
// which removes the common mutation-XSS classes — but it is not a substitute for a
// dedicated, independently-audited library (e.g. DOMPurify) when the input is fully
// adversarial and the stakes are high. See README "Threat model & limits".

import { isSafeUrl, isSafeAttributeName } from "@zoijs/core/server";

// ---- allowlists --------------------------------------------------------------

// Block- and inline-level content elements only. No interactive form controls, no
// embedded/foreign content (iframe/object/embed/svg/math), no raw-text elements
// (script/style/textarea/title), no document metadata (link/meta/base).
const ALLOWED_TAGS = new Set(
  (
    "a abbr address article aside b bdi bdo blockquote br caption cite code col " +
    "colgroup dd del details dfn div dl dt em figcaption figure footer h1 h2 h3 h4 " +
    "h5 h6 header hgroup hr i img ins kbd li main mark nav ol p pre q rp rt ruby s " +
    "samp section small span strong sub summary sup table tbody td tfoot th thead " +
    "time tr u ul var wbr"
  ).split(" ")
);

// Attributes allowed on ANY allowed element. `aria-*` and `data-*` are allowed by
// prefix (see attrAllowed). `style` is intentionally NOT here — it is the CSS
// injection surface, so it is dropped during sanitization.
const GLOBAL_ATTRS = new Set(["class", "id", "title", "dir", "lang", "role"]);

// Extra attributes allowed on specific elements.
// `name` is deliberately absent everywhere: on untrusted markup it only ever creates
// named properties (window.<name>, form.<name>) — DOM clobbering — and no allowed
// element needs it (in-page anchors use `id`).
const TAG_ATTRS = {
  a: new Set(["href", "target", "rel", "hreflang", "type"]),
  img: new Set(["src", "alt", "width", "height", "loading", "decoding"]),
  blockquote: new Set(["cite"]),
  q: new Set(["cite"]),
  del: new Set(["cite", "datetime"]),
  ins: new Set(["cite", "datetime"]),
  time: new Set(["datetime"]),
  ol: new Set(["start", "reversed", "type"]),
  li: new Set(["value"]),
  td: new Set(["colspan", "rowspan", "headers", "abbr"]),
  th: new Set(["colspan", "rowspan", "headers", "scope", "abbr"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  details: new Set(["open"]),
};

// Attribute names whose value is a URL — scheme-checked with the core's isSafeUrl.
const URL_ATTRS = new Set(["href", "src", "cite", "xlink:href"]);

// Allowed attributes whose value is a space-separated list of element ids (IDREF /
// IDREFS). They're rewritten with the same prefix as `id` so the references still
// resolve. (`aria-*` is allowed by prefix, so all ARIA id-reference attributes apply.)
const IDREF_ATTRS = new Set([
  "headers", "aria-labelledby", "aria-describedby", "aria-controls", "aria-owns",
  "aria-details", "aria-errormessage", "aria-activedescendant", "aria-flowto",
]);

const DEFAULT_ID_PREFIX = "user-content-";

function attrAllowed(tag, name) {
  const n = name.toLowerCase();
  if (n.startsWith("on")) return false; // event handler — never (defense in depth)
  if (n === "style") return false; // CSS injection surface — dropped
  if (!isSafeAttributeName(n)) return false; // core backstop (on*, srcdoc)
  if (n.startsWith("aria-") || n.startsWith("data-")) return true;
  if (GLOBAL_ATTRS.has(n)) return true;
  const t = TAG_ATTRS[tag];
  return t ? t.has(n) : false;
}

// Merge noopener + noreferrer into an existing rel, preserving other tokens.
function hardenRel(existing) {
  const tokens = new Set((existing || "").split(/\s+/).filter(Boolean));
  tokens.add("noopener");
  tokens.add("noreferrer");
  return [...tokens].join(" ");
}

// ---- pruning -----------------------------------------------------------------

function cleanElement(el, prefix) {
  const tag = el.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) {
    // Not on the allowlist → drop the element AND its subtree. Conservative on
    // purpose: unwrapping unknown elements risks surfacing content an author never
    // intended, and the dangerous tags (script/style/iframe/…) must never survive.
    el.remove();
    return;
  }
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name;
    const n = name.toLowerCase();
    if (!attrAllowed(tag, name)) {
      el.removeAttribute(name);
      continue;
    }
    if (URL_ATTRS.has(n) && !isSafeUrl(attr.value)) {
      el.removeAttribute(name);
      continue;
    }
    // Namespace ids and the same-document references to them (deterministic prefix,
    // so references can be rewritten in the same single pass — order doesn't matter).
    if (n === "id") {
      if (!attr.value.trim()) el.removeAttribute(name); // an empty id is no id
      else if (prefix) el.setAttribute(name, prefix + attr.value);
    } else if (prefix && IDREF_ATTRS.has(n)) {
      el.setAttribute(name, attr.value.split(/\s+/).filter(Boolean).map((ref) => prefix + ref).join(" "));
    } else if (prefix && n === "href" && attr.value.trim().startsWith("#") && attr.value.trim().length > 1) {
      el.setAttribute(name, "#" + prefix + attr.value.trim().slice(1));
    }
  }
  // Reverse-tabnabbing guard: a link opening a new context must not hand it a live
  // window.opener reference.
  if (tag === "a") {
    const target = el.getAttribute("target");
    if (target && target !== "_self") el.setAttribute("rel", hardenRel(el.getAttribute("rel")));
  }
  cleanChildren(el, prefix);
}

function cleanChildren(parent, prefix) {
  // Snapshot first — we mutate as we go (removing disallowed nodes).
  for (const child of Array.from(parent.childNodes)) {
    const type = child.nodeType;
    if (type === 1) cleanElement(child, prefix); // element
    else if (type === 3) continue; // text — inert, kept verbatim
    else child.remove(); // comment / CDATA / processing-instruction → dropped
  }
}

// ---- public API --------------------------------------------------------------

/**
 * Sanitize an untrusted HTML string into an array of safe DOM nodes, ready to drop
 * into a Zoijs text binding: `html\`<div>${() => sanitize(dirty)}</div>\``.
 *
 * Allowlist-based: only known-safe elements/attributes survive; scripts, event
 * handlers, foreign content, and dangerous URLs are removed. Returns `[]` for
 * null/undefined/empty input. A CLIENT helper — it needs a DOM (throws otherwise).
 *
 * Every `id` gets the `idPrefix` (default `"user-content-"`) and `name` is always
 * removed, so sanitized content can't clobber page globals; `href="#…"`, `headers` and
 * ARIA id references are rewritten to match. Pass `{ idPrefix: "" }` to keep ids
 * as written (only for content you control — it reopens the collision risk).
 *
 * @param {unknown} dirty  the untrusted HTML string (coerced with String())
 * @param {{ idPrefix?: string }} [options]
 * @returns {Node[]}       top-level sanitized nodes, adopted into `document`
 */
export function sanitize(dirty, options) {
  if (options !== undefined && (options === null || typeof options !== "object")) {
    throw new TypeError("@zoijs/sanitize: options must be an object, e.g. { idPrefix: \"user-content-\" }");
  }
  const prefix = options?.idPrefix === undefined ? DEFAULT_ID_PREFIX : options.idPrefix;
  if (typeof prefix !== "string") {
    throw new TypeError(`@zoijs/sanitize: idPrefix must be a string (got ${prefix === null ? "null" : typeof prefix}); use "" to keep ids unprefixed`);
  }
  if (dirty === null || dirty === undefined) return [];
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    throw new Error(
      "@zoijs/sanitize: sanitize() needs a DOM (browser). It returns live nodes, so it " +
        "is client-only — sanitize on the client, or use a server sanitizer for SSR output."
    );
  }
  const doc = new DOMParser().parseFromString(String(dirty), "text/html");
  cleanChildren(doc.body, prefix);
  const out = [];
  for (const node of Array.from(doc.body.childNodes)) out.push(document.adoptNode(node));
  return out;
}
