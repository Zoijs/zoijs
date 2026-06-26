// Tests for the devtools inspection hook (@zoijs/core/devtools, RFC 0005).
//
// The hook is dev-only and read-only: it reports node lifecycle (create / run /
// write / dispose) to an attached inspector, and tags binding effects with the
// DOM they update. The hot read path (.get()) is intentionally NOT reported.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../src/reactivity/state.js";
import { computed } from "../src/reactivity/computed.js";
import { effect } from "../src/reactivity/effect.js";
import { flush } from "../src/reactivity/scheduler.js";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { configure } from "../src/reactivity/env.js";
import { attachInspector, inspecting } from "../src/reactivity/devtools.js";

// A recording inspector: every callback pushes to `events`, plus quick indexes.
function recorder() {
  const events = [];
  const created = new Map(); // node -> { kind, label }
  return {
    events,
    created,
    onCreate(node, kind, label) {
      created.set(node, { kind, label });
      events.push({ type: "create", node, kind, label });
    },
    onRun(node) {
      events.push({ type: "run", node });
    },
    onWrite(node) {
      events.push({ type: "write", node });
    },
    onDispose(node) {
      events.push({ type: "dispose", node });
    },
  };
}

const countOf = (rec, type) => rec.events.filter((e) => e.type === type).length;

test("reports create with the right kind for each primitive", () => {
  const rec = recorder();
  const detach = attachInspector(rec);
  try {
    createState(0);
    computed(() => 1);
    effect(() => {});
    const kinds = rec.events.filter((e) => e.type === "create").map((e) => e.kind);
    assert.deepEqual(kinds, ["state", "computed", "effect"]);
  } finally {
    detach();
  }
});

test("write fires only on an actual change (equality-gated)", () => {
  const rec = recorder();
  const detach = attachInspector(rec);
  try {
    const s = createState(0);
    s.set(0); // no change → no write report
    assert.equal(countOf(rec, "write"), 0);
    s.set(1); // change → one write
    assert.equal(countOf(rec, "write"), 1);
  } finally {
    detach();
  }
});

test("run fires when a computed/effect recomputes, not on reads", () => {
  const rec = recorder();
  const detach = attachInspector(rec);
  try {
    const s = createState(1);
    const doubled = computed(() => s.get() * 2);
    effect(() => doubled.get()); // effect's first run
    const runsAfterSetup = countOf(rec, "run");
    doubled.get();
    doubled.get(); // pure reads: no recompute, no run reports
    assert.equal(countOf(rec, "run"), runsAfterSetup);
    s.set(2);
    flush(); // computed recomputes + effect re-runs → two more runs
    assert.equal(countOf(rec, "run"), runsAfterSetup + 2);
  } finally {
    detach();
  }
});

test("dispose fires when an effect leaves the graph", () => {
  const rec = recorder();
  const detach = attachInspector(rec);
  try {
    const e = effect(() => {});
    assert.equal(countOf(rec, "dispose"), 0);
    e.dispose();
    assert.equal(countOf(rec, "dispose"), 1);
  } finally {
    detach();
  }
});

test("edges are readable on demand from the raw node", () => {
  const rec = recorder();
  const detach = attachInspector(rec);
  try {
    const s = createState(1);
    let stateNode;
    for (const [node, meta] of rec.created) if (meta.kind === "state") stateNode = node;
    const d = computed(() => s.get() + 1);
    d.get(); // establish the edge state → computed
    // The inspector never instrumented the read, but can still walk the graph.
    assert.equal(stateNode.observers.size, 1);
    const observer = [...stateNode.observers][0];
    assert.ok(observer.sources.has(stateNode));
  } finally {
    detach();
  }
});

test("binding effects are labelled with the DOM node they update", () => {
  const rec = recorder();
  const detach = attachInspector(rec);
  try {
    const count = createState(0);
    const host = document.createElement("div");
    const unmount = mount(
      () => html`<button title=${() => `c${count.get()}`}>${() => count.get()}</button>`,
      host
    );
    const labels = [...rec.created.values()].filter((m) => m.kind === "effect" && m.label).map((m) => m.label);
    // One text binding (the button's content) and one attribute binding (title).
    assert.ok(labels.some((l) => l.kind === "text"));
    const attr = labels.find((l) => l.kind === "attr");
    assert.ok(attr && attr.name === "title");
    assert.equal(attr.el.tagName, "BUTTON");
    unmount();
  } finally {
    detach();
  }
});

test("a state update runs exactly one binding effect (fine-grained)", () => {
  const rec = recorder();
  const detach = attachInspector(rec);
  try {
    const count = createState(0);
    const host = document.createElement("div");
    const unmount = mount(() => html`<p>${() => count.get()}</p>`, host);
    const before = countOf(rec, "run");
    count.set(1);
    flush();
    // Exactly one effect re-ran — the one bound to this <p>'s text — not a re-render.
    assert.equal(countOf(rec, "run"), before + 1);
    assert.equal(host.querySelector("p").textContent, "1");
    unmount();
  } finally {
    detach();
  }
});

test("detach stops further reports", () => {
  const rec = recorder();
  const detach = attachInspector(rec);
  detach();
  assert.equal(inspecting(), false);
  createState(0);
  effect(() => {});
  assert.equal(rec.events.length, 0);
});

test("attachInspector is a no-op in production mode", () => {
  configure({ dev: false });
  try {
    const rec = recorder();
    const detach = attachInspector(rec);
    assert.equal(inspecting(), false); // never attached
    createState(0);
    effect(() => {});
    assert.equal(rec.events.length, 0);
    detach(); // the returned no-op is safe to call
  } finally {
    configure({ dev: true }); // restore for the rest of the suite
  }
});
