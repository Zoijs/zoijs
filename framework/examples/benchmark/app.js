// Large-list benchmark — keyed rendering with each() (Milestone 3).
//
// Methodology (same as Milestone 2): wrap the state change in performance.now()
// and flush() to force the batched DOM work into the measured window. flush()
// now drains cascading effects, so per-item label updates are included. Heap
// delta is read from performance.memory when available (Chrome). Numbers are
// relative to each other, not absolute.

import { html, mount, each, createState } from "../../src/index.js";
import { flush } from "../../src/reactivity/scheduler.js";

const rows = createState([]);
let uid = 0;
const makeRow = () => ({ id: ++uid, label: `Item ${uid}` });
const build = (n) => Array.from({ length: n }, makeRow);

function measure(label, change) {
  const heapBefore = performance.memory ? performance.memory.usedJSHeapSize : 0;
  const t0 = performance.now();
  change();
  flush();
  const t1 = performance.now();
  const heapAfter = performance.memory ? performance.memory.usedJSHeapSize : 0;
  const mem = performance.memory ? ` | heap ${((heapAfter - heapBefore) / 1048576).toFixed(1)} MB` : "";
  document.querySelector("#result").textContent =
    `${label}: ${(t1 - t0).toFixed(1)} ms${mem} | nodes: ${document.querySelectorAll(".list li").length}`;
}

const renderRows = (n) => measure(`Initial render ${n}`, () => rows.set(build(n)));
const append = () => measure("Append 1", () => rows.set([...rows.get(), makeRow()]));
const prepend = () => measure("Prepend 1", () => rows.set([makeRow(), ...rows.get()]));
const removeFirst = () => measure("Remove first", () => rows.set(rows.get().slice(1)));
const reverse = () => measure("Reverse (reorder)", () => rows.set([...rows.get()].reverse()));
// update ONE: keep every other object reference, so only one item re-renders.
const updateOne = () =>
  measure("Update one label", () =>
    rows.set(rows.get().map((r, i) => (i === 0 ? { ...r, label: r.label + "*" } : r)))
  );
const updateAll = () =>
  measure("Update all labels", () => rows.set(rows.get().map((r) => ({ ...r, label: r.label + "*" }))));

function App() {
  return html`
    <div class="bench">
      <h1>Keyed List Benchmark</h1>
      <div class="row">
        <button onclick=${() => renderRows(1000)}>1,000</button>
        <button onclick=${() => renderRows(10000)}>10,000</button>
        <button onclick=${append}>Append</button>
        <button onclick=${prepend}>Prepend</button>
        <button onclick=${removeFirst}>Remove first</button>
        <button onclick=${reverse}>Reverse</button>
        <button onclick=${updateOne}>Update one</button>
        <button onclick=${updateAll}>Update all</button>
        <button onclick=${() => rows.set([])}>Clear</button>
      </div>
      <div id="result">Click a button to run a benchmark.</div>
      <ul class="list">${each(
        () => rows.get(),
        (r) => r.id,
        (r) => html`<li>${() => r.label}</li>`
      )}</ul>
    </div>
  `;
}

mount(App, document.querySelector("#app"));
