// Type definitions for @zoijs/sanitize.
//
// Authored in plain JavaScript; these declarations add editor autocomplete and
// optional type-checking without requiring TypeScript.

/**
 * Sanitize an untrusted HTML string into an array of safe DOM nodes, ready to drop
 * into a Zoijs text binding:
 *
 * ```js
 * html`<article>${() => sanitize(post.bodyHtml)}</article>`;
 * ```
 *
 * Allowlist-based: only known-safe elements and attributes survive; scripts, event
 * handlers, foreign content (SVG/MathML), and dangerous URLs are removed. URL
 * attributes are scheme-checked with the same predicate the core renderer uses.
 * Returns `[]` for `null` / `undefined` / empty input.
 *
 * A **client** helper — it returns live DOM nodes, so it needs a browser DOM and
 * throws when called without one (e.g. during server rendering).
 *
 * @param dirty The untrusted HTML string (coerced with `String()`).
 * @returns Top-level sanitized nodes, adopted into `document`.
 */
export function sanitize(dirty: unknown): Node[];
