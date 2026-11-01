// unsafe.js — `@zoijs/core/unsafe`: the ONE deliberate raw-HTML escape hatch (SEC-3).
// Renders trusted markup as live HTML; it does NOT sanitize (use @zoijs/sanitize for
// untrusted HTML). A separate, obviously named subpath: every use is a visible import,
// greppable, and flagged by `zoijs/no-unsafe-html`; the default entry never loads it.

import { UNSAFE_HTML } from "./core/brand.js";
import { isDev } from "./reactivity/env.js";

// Every result's prototype: the Symbol brand (unforgeable by JSON; Symbol.for, so other
// core copies render it) and a throwing toPrimitive — it can never become a string.
const RESULT = Object.freeze({
  [UNSAFE_HTML]: true,
  [Symbol.toPrimitive]() {
    throw new TypeError("Zoijs: unsafeHTML() is content-only, never a string or attribute");
  },
});

let warned = false;

/** Raw HTML for a content slot. Bypasses escaping — trusted input only. @param {string | TrustedHTML} value */
export function unsafeHTML(value) {
  const tt = globalThis.trustedTypes;
  const trusted = !!(tt && tt.isHTML && tt.isHTML(value));
  if (!trusted && typeof value !== "string") throw new TypeError("Zoijs: unsafeHTML() takes a string or a TrustedHTML value");
  if (!trusted && !warned && isDev()) {
    warned = true;
    console.warn("Zoijs: unsafeHTML() bypasses escaping. Only pass trusted HTML — use @zoijs/sanitize for anything else.");
  }
  return Object.freeze(Object.create(RESULT, { html: { value } }));
}
