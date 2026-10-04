// runtime.js — reactive state shared by all compatible @zoijs/core copies in a
// realm: one graph, one owner tree, one onError reporter, one Trusted Types policy.
// Key = runtime protocol (see VERSIONING.md); protocol 1 ships with core 1.9.0.

const P = 1;
const PRE = "zoijs.runtime@";
const KEY = Symbol.for(PRE + P);
const g = globalThis;
const make = () => {
  const r = { protocol: P, observer: null, owner: null, queue: new Set(), scheduled: false, dev: true, inspector: null, onError: null, reporting: false, tt: undefined,
    // Hand a contained error to configure({ onError }). Lives here, not in a core import, so
    // @zoijs/* packages call globalThis[Symbol.for("zoijs.runtime@1")].report(…) and need no
    // import-map entry. The hook never receives its own failures, and an error raised while it
    // runs is logged rather than re-reported — no recursion.
    report(error, info) {
      if (!r.onError) return;
      if (r.reporting) return void console.error("Zoijs: error raised inside onError (not re-reported):", error);
      r.reporting = true;
      try {
        r.onError(error, info);
      } catch (hookError) {
        console.error("Zoijs: the onError hook threw:", hookError);
      } finally {
        r.reporting = false;
      }
    },
  };
  return r;
};

let rt = g[KEY];
const created = !rt || rt.protocol !== P;
if (!rt) Object.defineProperty(g, KEY, { value: (rt = make()) }); // first copy's object, never replaced
else if (created) rt = make(); // unrecognized: stay private

// Dev diagnostics run once the module graph has loaded, so the production entry
// (prod.js) or an app's own configure({ dev }) applies first. Browser-only host check.
queueMicrotask(() => {
  if (!rt.dev) return;
  for (const s of Object.getOwnPropertySymbols(g)) {
    const d = s.description;
    if (d && d.startsWith(PRE) && g[s] !== rt)
      console.error(`ZJS201: incompatible @zoijs/core copies loaded (runtime protocol ${g[s]?.protocol ?? d.slice(PRE.length)} vs ${P}); they don't share reactivity.`);
  }
  const h = g.location?.hostname;
  if (h && !/^(localhost|127(\.\d+){3}|\[::1\]|0\.0\.0\.0)$|\.localhost$/.test(h))
    console.warn(`Zoijs is running in development mode on ${h}. For production load @zoijs/core/prod (or call configure({ dev: false })).`);
});

export { rt as runtime, created };
