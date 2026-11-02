// The lean entry in a real browser: renders and reacts under the strict CSP, and refuses to
// hydrate. The spec checks hydrate.js is never requested.
import { html, mount, createState } from "../../src/lean-prod.js";

window.__violations = [];
document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(e.violatedDirective));

const app = document.getElementById("app");
try {
  mount(() => html`<p>client</p>`, app, { hydrate: true });
  window.__hydrateError = null;
} catch (err) {
  window.__hydrateError = err.message;
}
window.__untouched = app.innerHTML === "<p>server html</p>";

const n = createState(0);
mount(() => html`<button id="counter" onclick=${() => n.set(n.get() + 1)}>${() => n.get()}</button>`, app);
