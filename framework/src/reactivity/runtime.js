// runtime.js — reactive state shared by all compatible @zoijs/core copies in a
// realm: one graph, one owner tree. Key = runtime protocol (see VERSIONING.md).

const P = 1;
const PRE = "zoijs.runtime@";
const KEY = Symbol.for(PRE + P);
const g = globalThis;
const make = () => ({ protocol: P, observer: null, owner: null, queue: new Set(), scheduled: false, dev: true, inspector: null });

let rt = g[KEY];
if (!rt) Object.defineProperty(g, KEY, { value: (rt = make()) }); // first copy's object, never replaced
else if (rt.protocol !== P) rt = make(); // unrecognized: stay private

for (const s of Object.getOwnPropertySymbols(g)) {
  const d = s.description;
  if (rt.dev && d && d.startsWith(PRE) && g[s] !== rt)
    console.error(`ZJS201: incompatible @zoijs/core copies loaded (runtime protocol ${g[s]?.protocol ?? d.slice(PRE.length)} vs ${P}); they don't share reactivity.`);
}

export const runtime = rt;
