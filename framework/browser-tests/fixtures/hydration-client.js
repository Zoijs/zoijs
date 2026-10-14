// Browser half of hydration.spec.js: hydrate the server HTML already in #app on demand, so the
// test can interact with the page first (typing, focus) like a user before the app's JS runs.
import * as core from "../../src/index.js";
import { makeApps } from "./hydration-apps.js";

const apps = makeApps(core);
window.__violations = [];
document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(e.violatedDirective));
window.__hydrate = (which) => {
  const warnings = [];
  const warn = console.warn;
  console.warn = (...a) => warnings.push(a.join(" "));
  try {
    return { hydration: core.mount(apps[which], "#app", { hydrate: true }).hydration, warnings };
  } finally {
    console.warn = warn;
  }
};
window.__ready = true;
