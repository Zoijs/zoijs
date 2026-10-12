// sanitize() under enforced Trusted Types: records CSP violations and the outcome for sanitize.spec.js.
window.__violations = [];
document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(`${e.violatedDirective} ${e.sample || ""}`.trim()));
window.__r = { error: null, html: null };
try {
  const { html, mount } = await import("@zoijs/core");
  const { sanitize } = await import("@zoijs/sanitize");
  const nodes = sanitize('<p id="x">ok <b>bold</b></p><img src=x onerror="window.__xss=1"><script>window.__xss=1<\/script>');
  window.__r.html = nodes.map((n) => n.outerHTML ?? n.textContent).join("");
  mount(() => html`<article>${nodes}</article>`, "#app");
} catch (err) {
  window.__r.error = String((err && err.message) || err);
}
window.__r.done = true;
