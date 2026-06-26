// External bootstrap for the strict-CSP fixture (loaded as script-src 'self', so
// csp.html needs no 'unsafe-inline'). It records any CSP violation, then renders a
// small reactive app. The spec asserts the app rendered AND no violations fired.

window.__violations = [];
document.addEventListener("securitypolicyviolation", (e) => {
  window.__violations.push(
    `${e.violatedDirective} blocked ${e.blockedURI || e.sourceFile || "(inline)"}`.trim()
  );
});

window.__rendered = false;
window.__error = null;

try {
  const { html, mount, createState } = await import("/src/index.js");
  const count = createState(0);
  mount(
    () =>
      html`<button id="counter" onclick=${() => count.set(count.get() + 1)}>
        ${() => count.get()}
      </button>`,
    "#app"
  );
  window.__rendered = true;
} catch (err) {
  window.__error = String((err && err.message) || err);
}
