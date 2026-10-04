// runtime.js — reactive state shared by all compatible @zoijs/core copies in a
// realm: one graph, one owner tree. Key = runtime protocol (see VERSIONING.md).

const P = 1;
const PRE = "zoijs.runtime@";
const KEY = Symbol.for(PRE + P);
const g = globalThis;
const make = () => ({ protocol: P, observer: null, owner: null, queue: new Set(), scheduled: false, dev: true, inspector: null });

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
