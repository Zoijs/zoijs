// dom.js — small helpers over native DOM APIs.
//
// Intentionally thin: the framework prefers using the platform directly.

import { runtime as rt } from "../reactivity/runtime.js";

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
// strings + markers — html() accepts only tagged-template strings, and dynamic
// values never reach it (the scanner forbids that) — so a pass-through policy is safe. Pages enforcing Trusted Types
// must allow the `zoijs` policy (e.g. `trusted-types zoijs`).
// The policy lives on the shared runtime (rt.tt: undefined = not tried yet, null = none), so
// compatible copies of the core create it once and reuse it — a second createPolicy("zoijs")
// would be refused under `trusted-types zoijs`. If creation fails, there is no policy: the raw
// string goes to innerHTML and an enforcing page refuses it (never a silent bypass).
function trustedHTML(htmlText) {
  if (rt.tt === undefined) {
    rt.tt = null;
    try {
      const tt = typeof window !== "undefined" ? window.trustedTypes : undefined;
      if (tt && tt.createPolicy) rt.tt = tt.createPolicy("zoijs", { createHTML: (s) => s });
    } catch {
      /* policy name not allowed by the page's CSP */
    }
  }
  return rt.tt ? rt.tt.createHTML(htmlText) : htmlText;
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
