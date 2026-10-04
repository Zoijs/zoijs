// Bootstrap for csp-two-cores.html: counts zoijs policy creations, then renders from both core
// copies and across them (shared reactivity, SEC-1 results, CORE-1 components, CORE-3 onError).
window.__violations = [];
document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(`${e.violatedDirective} ${e.blockedURI || ""}`.trim()));
window.__r = { policies: 0, error: null, reports: [], done: false };

const factory = window.trustedTypes;
const create = factory.createPolicy.bind(factory);
factory.createPolicy = (name, rules) => (window.__r.policies++, create(name, rules));

try {
  const A = await import("/src/index.js");
  const B = await import("/browser-tests/fixtures/core-copy/index.js");
  window.__r.distinctCopies = A !== B; // two module instances, as with a CDN copy + a bundled one

  const count = A.createState(0); // state from copy A …
  A.mount(() => A.html`<p id="from-a">A ${() => count.get()}</p>`, "#a");
  B.mount(() => B.html`<p id="from-b">B ${() => count.get()}</p>`, "#b"); // … rendered by copy B too

  const Child = () => B.html`<i id="child">child of B</i>`; // CORE-1: returned uncalled
  const show = A.createState(true);
  B.configure({ onError: (error, info) => window.__r.reports.push(`${info.kind}:${error.message}`) }); // CORE-3, realm-wide
  A.mount(
    () => A.html`<section>${B.html`<b id="b-result">B template in A</b>`}${() => (show.get() ? Child : null)}${() => { throw new Error("boom"); }}</section>`,
    "#mixed"
  );
  window.__r.inc = () => count.set(count.get() + 1);
  try { A.html(["<img src=x onerror=alert(1)>"]); } catch (e) { window.__r.sec2 = e.message.slice(0, 6); }
} catch (err) {
  window.__r.error = String((err && err.message) || err);
}
window.__r.done = true;
