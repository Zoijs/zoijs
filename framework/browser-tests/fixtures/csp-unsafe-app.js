// Bootstrap for csp-unsafe.html (external: script-src 'self'). Records CSP violations and
// the outcome of each unsafeHTML() case for browser-tests/csp.spec.js.

window.__violations = [];
document.addEventListener("securitypolicyviolation", (e) => {
  window.__violations.push(`${e.violatedDirective} ${e.blockedURI || ""}`.trim());
});
window.__unsafe = { done: false, error: null, string: null };

try {
  const { html, mount } = await import("/src/index.js");
  const { unsafeHTML } = await import("/src/unsafe.js");
  const policy = window.trustedTypes.createPolicy("app", { createHTML: (s) => s });

  // 1. The app's own TrustedHTML renders as raw markup.
  mount(() => html`<p>${unsafeHTML(policy.createHTML('<b class="raw">trusted</b>'))}</p>`, "#trusted");

  // 2. A plain string must be refused — not silently passed through the zoijs policy.
  try {
    mount(() => html`<p>${unsafeHTML('<b class="raw">string</b>')}</p>`, "#string");
    window.__unsafe.string = "rendered";
  } catch (err) {
    window.__unsafe.string = String(err && err.message);
  }
} catch (err) {
  window.__unsafe.error = String((err && err.message) || err);
}
window.__unsafe.done = true;
