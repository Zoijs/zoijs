// bench/dom.mjs — micro-benchmarks for @zoijs/core's hot paths, in jsdom.
//
// Measures the framework's OWN overhead (keyed reconcile, fine-grained bindings)
// reproducibly. It is not a cross-framework or real-browser benchmark — jsdom is
// slower than a browser and absolute numbers don't transfer. Its value is showing
// the cost model (work scales with what changed) and catching algorithmic
// regressions (e.g. the each() LIS move-minimization).

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
for (const k of ["Node", "NodeFilter", "Element", "HTMLElement", "Text", "Comment", "DocumentFragment", "Event", "CustomEvent"]) {
  if (dom.window[k]) globalThis[k] = dom.window[k];
}

// Internal flush → measure an update synchronously (bench is repo tooling, so it
// may reach into src; apps never do this).
const { html, mount, createState, each } = await import("../framework/src/index.js");
const { flush } = await import("../framework/src/reactivity/scheduler.js");
const { configure } = await import("../framework/src/index.js");
configure({ dev: false }); // production mode — no dev warnings in the hot loop

const N = Number(process.env.BENCH_N || 1000);
const ITERS = Number(process.env.BENCH_ITERS || 5);

const data = (n, gen = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `row ${i + 1} · ${gen}` }));

function mountList(initial) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const rows = createState(initial);
  const unmount = mount(
    () => html`<table><tbody>${each(
      () => rows.get(),
      (r) => r.id,
      (r) => html`<tr><td>${() => r.id}</td><td>${() => r.label}</td></tr>`
    )}</tbody></table>`,
    target
  );
  return { rows, unmount: () => { unmount(); target.remove(); } };
}

function bench(label, { setup = () => null, op, teardown = () => {}, iters = ITERS }) {
  { const c = setup(); op(c); teardown(c); } // warmup
  let total = 0;
  for (let i = 0; i < iters; i++) {
    const c = setup();
    const t = performance.now();
    op(c);
    total += performance.now() - t;
    teardown(c);
  }
  return { label, ms: +(total / iters).toFixed(2) };
}

const mounted = () => { const c = mountList(data(N)); flush(); return c; };
const results = [];

results.push(bench(`create ${N} rows`, {
  op: () => { const c = mountList(data(N)); flush(); c.unmount(); },
}));
results.push(bench(`update all ${N} labels`, {
  setup: mounted, teardown: (c) => c.unmount(),
  op: (c) => { c.rows.set(data(N, 1)); flush(); },
}));
results.push(bench(`update 1 of ${N}`, {
  setup: mounted, teardown: (c) => c.unmount(),
  op: (c) => { const d = c.rows.peek().slice(); d[N >> 1] = { ...d[N >> 1], label: "changed" }; c.rows.set(d); flush(); },
}));
results.push(bench(`swap 2 rows (of ${N})`, {
  setup: mounted, teardown: (c) => c.unmount(),
  op: (c) => { const d = c.rows.peek().slice(); [d[1], d[N - 2]] = [d[N - 2], d[1]]; c.rows.set(d); flush(); },
}));
results.push(bench(`reverse ${N} rows`, {
  setup: mounted, teardown: (c) => c.unmount(),
  op: (c) => { c.rows.set(c.rows.peek().slice().reverse()); flush(); },
}));
results.push(bench(`clear ${N} rows`, {
  setup: mounted, teardown: (c) => c.unmount(),
  op: (c) => { c.rows.set([]); flush(); },
}));

console.log(`@zoijs/core DOM benchmarks — ${N} rows, ${ITERS} iters, jsdom (median-ish mean)\n`);
const pad = Math.max(...results.map((r) => r.label.length));
for (const r of results) console.log(`  ${r.label.padEnd(pad)}  ${r.ms.toFixed(2)} ms`);

if (process.argv.includes("--json")) {
  console.log("\n" + JSON.stringify({ n: N, iters: ITERS, results }, null, 2));
}
