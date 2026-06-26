// security.js — secure-by-default helpers.
//
// These are NOT optional add-ons; the renderer routes every dynamic value
// through them so the safe path is the default path. See docs/security.md.

/**
 * Coerce a value to a string for safe insertion as TEXT.
 * Text slots are written via a Text node (inert), so this is just predictable
 * coercion: null/undefined become "".
 * @param {any} value
 * @returns {string}
 */
export function toText(value) {
  return value === null || value === undefined ? "" : String(value);
}

// HTML-escaping for SERVER string rendering (@zoijs/ssr). The client renderer
// never needs these — it writes text via Text nodes and values via setAttribute,
// both of which are inert/escaped by the platform. On a server there is no DOM, so
// the same safety must be applied by escaping into the HTML string. Kept here so
// escaping lives in one place alongside the other security predicates.

/** Escape a value for insertion as HTML TEXT content. */
export function escapeText(value) {
  return toText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape a value for insertion inside a double-quoted attribute value. */
export function escapeAttr(value) {
  return toText(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// Attribute names that carry a URL — their values are scheme-checked (isSafeUrl).
// Shared by the client renderer (DOM) and @zoijs/ssr (string) so both make the
// exact same safety decision.
export const URL_ATTRS = new Set(["href", "src", "action", "formaction", "poster", "ping", "xlink:href"]);

// Allowlisted URL schemes for URL-bearing attributes (href, src, ...).
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);
// data: is allowed only for raster image MIME types (never text/html, never SVG,
// which can carry script when navigated to).
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|bmp|x-icon)[;,]/;

/**
 * Is this URL safe for a URL-bearing attribute (href, src, action, ...)?
 * Relative URLs (no scheme) are allowed; otherwise only an allowlist of schemes.
 * @param {string} url
 * @returns {boolean}
 */
export function isSafeUrl(url) {
  // Browsers strip ASCII control characters (incl. TAB/CR/LF) before parsing a
  // URL, so "java\tscript:alert(1)" becomes "javascript:". Strip them first, or
  // the scheme check can be bypassed.
  const cleaned = String(url).replace(/[\x00-\x1F]/g, "").trim();
  const match = cleaned.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (!match) return true; // relative URL (no scheme) — safe
  const scheme = match[1].toLowerCase();
  if (scheme === "data") return SAFE_DATA_IMAGE.test(cleaned.toLowerCase());
  return SAFE_SCHEMES.has(scheme);
}

// Attribute names that must never be bound from data.
const DANGEROUS_ATTRS = new Set(["srcdoc"]); // iframe srcdoc = raw-HTML sink

/**
 * Reject attribute names that should never be bound from data: inline event
 * handlers (`on*`, which have their own safe path) and raw-HTML sinks (`srcdoc`).
 * @param {string} name
 * @returns {boolean} true if the attribute name is allowed
 */
export function isSafeAttributeName(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith("on")) return false;
  if (DANGEROUS_ATTRS.has(lower)) return false;
  return true;
}
