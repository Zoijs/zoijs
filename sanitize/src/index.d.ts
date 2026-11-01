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
 * **DOM clobbering:** `name` attributes are always removed, and every `id` is
 * namespaced with `idPrefix` (default `"user-content-"`), so sanitized content can't
 * shadow page globals such as `window.__DATA__`. Same-document references
 * (`href="#…"`, `headers`, ARIA id references) are rewritten to match.
 *
 * A **client** helper — it returns live DOM nodes, so it needs a browser DOM and
 * throws when called without one (e.g. during server rendering).
 *
 * @param dirty The untrusted HTML string (coerced with `String()`).
 * @param options See {@link SanitizeOptions}.
 * @returns Top-level sanitized nodes, adopted into `document`.
 */
export function sanitize(dirty: unknown, options?: SanitizeOptions): Node[];

export interface SanitizeOptions {
  /**
   * Prefix added to every `id` (and to the references that point at them).
   * Default `"user-content-"`. `""` keeps ids exactly as written — only for content
   * you control, since it lets the markup claim any id on the page. `name` is removed
   * either way.
   */
  idPrefix?: string;
}
