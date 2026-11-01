// Fixture for router.spec.js (L4–L6, L8): a router hosted under a base, with a custom link built
// from href/onLinkClick/isActive, replace navigation, and counters for path()/query() effects.
import { html, mount, effect } from "@zoijs/core";
import { createRouter } from "@zoijs/router";

const base = "/router/browser-tests/fixtures/links.html";
const router = createRouter(
  {
    "/": () => html`<h1>Home</h1>`,
    "/reports": () => html`<h1>Reports</h1>`,
    "/reports/:id": (p) => html`<h1>Report ${p.id}</h1>`,
    "/empty": () => null,
  },
  { base }
);
window.__counts = { path: 0, query: 0 };
window.__router = router;

mount(() => {
  effect(() => (router.path(), window.__counts.path++));
  effect(() => (router.query(), window.__counts.query++));
  return html`<nav>
      ${router.link("/", "Home")}
      <a class="custom" data-kind="nav" href=${router.href("/reports")} onclick=${router.onLinkClick("/reports")}
        aria-current=${() => (router.isActive("/reports", { exact: false }) ? "page" : null)}
        ><svg width="8" height="8" aria-hidden="true"><circle cx="4" cy="4" r="4" /></svg> Reports</a>
      ${router.link("/reports/7", html`<b>Report</b> 7`)}
      ${router.link("/empty", "Empty")}
    </nav>
    <main>${router.view()}</main>`;
}, "#app");
