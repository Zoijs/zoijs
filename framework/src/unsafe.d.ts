// Type surface for `@zoijs/core/unsafe` — the one deliberate raw-HTML escape hatch.

declare const unsafeHTMLResult: unique symbol;

/** An opaque marker: renders as raw markup in a content position (`${…}` between tags). */
export interface UnsafeHTMLResult {
  readonly [unsafeHTMLResult]: true;
}

/** The DOM's `TrustedHTML` where the TypeScript DOM lib declares it; otherwise `never`. */
export type TrustedHTMLValue = typeof globalThis extends { TrustedHTML: { prototype: infer T } } ? T : never;

/**
 * Render trusted markup as raw HTML. **Bypasses escaping** — never pass API, database,
 * URL, storage, or user input unless it has been independently established as trusted.
 * For untrusted HTML use `@zoijs/sanitize`. On pages that enforce Trusted Types, pass a
 * `TrustedHTML` from your own policy; a plain string is refused when it's inserted.
 */
export function unsafeHTML(value: string | TrustedHTMLValue): UnsafeHTMLResult;
