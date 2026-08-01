// @zoijs/sanitize — turn an untrusted HTML string into safe DOM nodes.
//
//   import { html, mount } from "@zoijs/core";
//   import { sanitize } from "@zoijs/sanitize";
//
//   // markdown/CMS body → safe nodes, dropped into a text slot as-is
//   html`<article>${() => sanitize(post.bodyHtml)}</article>`;
//
// Zoijs has NO raw-HTML API by design: a string in a text slot is inert text, and
// there is deliberately no `unsafeHTML`. But real apps still need to render *rich*
// HTML they mostly trust — the output of a markdown renderer, a CMS field. That's
// the single most security-critical boundary in a front end, and until now Zoijs
// left you to solve it alone. `sanitize()` makes it a supported, tested path.
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
const TAG_ATTRS = {
  a: new Set(["href", "target", "rel", "name", "hreflang", "type"]),
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

function cleanElement(el) {
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
    if (!attrAllowed(tag, name)) {
      el.removeAttribute(name);
      continue;
    }
    if (URL_ATTRS.has(name.toLowerCase()) && !isSafeUrl(attr.value)) {
      el.removeAttribute(name);
    }
  }
  // Reverse-tabnabbing guard: a link opening a new context must not hand it a live
  // window.opener reference.
  if (tag === "a") {
    const target = el.getAttribute("target");
    if (target && target !== "_self") el.setAttribute("rel", hardenRel(el.getAttribute("rel")));
  }
  cleanChildren(el);
}

function cleanChildren(parent) {
  // Snapshot first — we mutate as we go (removing disallowed nodes).
  for (const child of Array.from(parent.childNodes)) {
    const type = child.nodeType;
    if (type === 1) cleanElement(child); // element
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
 * @param {unknown} dirty  the untrusted HTML string (coerced with String())
 * @returns {Node[]}       top-level sanitized nodes, adopted into `document`
 */
export function sanitize(dirty) {
  if (dirty === null || dirty === undefined) return [];
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    throw new Error(
      "@zoijs/sanitize: sanitize() needs a DOM (browser). It returns live nodes, so it " +
        "is client-only — sanitize on the client, or use a server sanitizer for SSR output."
    );
  }
  const doc = new DOMParser().parseFromString(String(dirty), "text/html");
  cleanChildren(doc.body);
  const out = [];
  for (const node of Array.from(doc.body.childNodes)) out.push(document.adoptNode(node));
  return out;
}
