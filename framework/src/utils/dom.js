// dom.js — small helpers over native DOM APIs.
//
// Intentionally thin: the framework prefers using the platform directly.

/**
 * Resolve a target that may be an element or a CSS selector string.
 * @param {Element|string} target
 * @returns {Element}
 */
export function resolveTarget(target) {
  const el = typeof target === "string" ? document.querySelector(target) : target;
  if (!el) {
    throw new Error(`Zoijs: mount target not found: ${String(target)}`);
  }
  return el;
}

// Trusted Types support. `template.innerHTML = string` is a Trusted-Types sink,
// so under a strict `require-trusted-types-for 'script'` CSP it would throw. The
// htmlText here is ALWAYS framework-generated from the author's static template
// strings + markers — dynamic values never reach it (the scanner forbids that) —
// so a pass-through policy is safe by construction. Pages enforcing Trusted Types
// must allow the `zoijs` policy (e.g. `trusted-types zoijs`).
let ttPolicy;
let ttChecked = false;
function trustedHTML(htmlText) {
  if (!ttChecked) {
    ttChecked = true;
    try {
      const tt = typeof window !== "undefined" ? window.trustedTypes : undefined;
      if (tt && tt.createPolicy) {
        ttPolicy = tt.createPolicy("zoijs", { createHTML: (s) => s });
      }
    } catch {
      ttPolicy = undefined; // policy name unavailable; fall back
    }
  }
  return ttPolicy ? ttPolicy.createHTML(htmlText) : htmlText;
}

/**
 * Build an inert <template> from an HTML string and return the element.
 * Parsing happens inside <template>, so no scripts run and no resources load.
 * @param {string} htmlText
 * @returns {HTMLTemplateElement}
 */
export function createTemplate(htmlText) {
  const template = document.createElement("template");
  template.innerHTML = trustedHTML(htmlText);
  return template;
}
