// Tests for @zoijs/devtools — the headless graph model and the panel. Both run
// against the real DOM (jsdom) and the real @zoijs/core engine.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, createState, computed, effect, configure } from "@zoijs/core";
import { createInspector, inspect } from "../src/index.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

test("createInspector models states, computeds, and effects", () => {
  const ins = createInspector().attach();
  try {
    const s = createState(1);
    const d = computed(() => s.get() * 2);
    effect(() => d.get());
    const stats = ins.model.stats();
    assert.equal(stats.states, 1);
    assert.equal(stats.computeds, 1);
    assert.equal(stats.effects, 1);
    assert.equal(stats.total, 3);
  } finally {
    ins.detach();
  }
});

test("model resolves edges: a state's observer reads it back", () => {
  const ins = createInspector().attach();
  try {
    const s = createState(0);
    const d = computed(() => s.get() + 1);
    d.get(); // establish the edge
    const stateRec = ins.model.nodes().find((r) => r.kind === "state");
    const observers = ins.model.observers(stateRec);
    assert.equal(observers.length, 1);
    assert.equal(observers[0].kind, "computed");
    assert.ok(ins.model.sources(observers[0]).includes(stateRec));
  } finally {
    ins.detach();
  }
});

test("run/write counters and activity advance on change", async () => {
  const ins = createInspector().attach();
  try {
    const s = createState(0);
    const host = document.createElement("div");
    mount(() => html`<p>${() => s.get()}</p>`, host);
    const effectRec = ins.model.nodes().find((r) => r.kind === "effect");
    const runsBefore = effectRec.runs;
    s.set(5);
    await tick(); // let the microtask flush re-run the binding
    const stateRec = ins.model.nodes().find((r) => r.kind === "state");
    assert.equal(stateRec.writes, 1);
    assert.equal(effectRec.runs, runsBefore + 1);
    assert.ok(effectRec.lastActive > 0);
  } finally {
    ins.detach();
  }
});

test("subscribe is notified of graph changes", () => {
  const ins = createInspector().attach();
  const seen = [];
  const off = ins.subscribe((change) => seen.push(change.type));
  try {
    createState(0);
    assert.ok(seen.includes("create"));
  } finally {
    off();
    ins.detach();
  }
});

test("dispose marks a node not-alive but keeps it in the model", () => {
  const ins = createInspector().attach();
  try {
    const e = effect(() => {});
    const rec = ins.model.nodes().find((r) => r.kind === "effect");
    assert.equal(rec.alive, true);
    e.dispose();
    assert.equal(rec.alive, false);
    assert.equal(ins.model.stats().alive, 0);
  } finally {
    ins.detach();
  }
});

test("inspect() mounts a panel and renders a row per node", async () => {
  const s = createState(0);
  const host = document.createElement("div");
  document.body.appendChild(host);
  mount(() => html`<button>${() => s.get()}</button>`, host);

  const handle = inspect();
  try {
    const panel = document.querySelector("[data-zoijs-devtools]");
    assert.ok(panel, "panel is in the document");
    s.set(1);
    await tick();
    await new Promise((r) => requestAnimationFrame(() => r())); // let the panel paint
    const stats = handle.model.stats();
    assert.ok(stats.total >= 2); // at least the state + the binding effect
    assert.ok(panel.textContent.includes("e")); // stats line mentions effects
  } finally {
    handle.close();
    assert.equal(document.querySelector("[data-zoijs-devtools]"), null, "panel removed on close");
  }
});

test("inspect() honours production mode (no observation, panel inert)", () => {
  configure({ dev: false });
  try {
    const handle = inspect();
    createState(0);
    effect(() => {});
    assert.equal(handle.model.stats().total, 0); // hook is a no-op in prod
    handle.close();
  } finally {
    configure({ dev: true });
  }
});
