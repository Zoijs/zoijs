// Milestone 5 tests: value-gated computeds, owner scopes, disposal, dev/prod.

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../src/reactivity/state.js";
import { computed } from "../src/reactivity/computed.js";
import { effect } from "../src/reactivity/effect.js";
import { flush } from "../src/reactivity/scheduler.js";
import { createOwner, runWithOwner, onCleanup, disposeOwner } from "../src/reactivity/owner.js";
import { configure } from "../src/reactivity/env.js";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { each } from "../src/core/each.js";

function captureConsole(method, fn) {
  const original = console[method];
  const calls = [];
  console[method] = (...args) => calls.push(args);
  try {
    fn();
  } finally {
    console[method] = original;
  }
  return calls;
}

// ---- value gating -----------------------------------------------------------

test("an unchanged computed result does not wake downstream effects", () => {
  const count = createState(0);
  const parity = computed(() => (count.get() % 2 === 0 ? "even" : "odd"));
  let runs = 0;
  effect(() => (parity.get(), runs++));
  assert.equal(runs, 1);

  count.set(2); // still "even"
  flush();
  assert.equal(runs, 1); // not woken

  count.set(3); // now "odd"
  flush();
  assert.equal(runs, 2); // woken once
});

test("value gating holds through nested computeds", () => {
  const n = createState(0);
  const isEven = computed(() => n.get() % 2 === 0);
  const label = computed(() => (isEven.get() ? "even" : "odd"));
  let runs = 0;
  effect(() => (label.get(), runs++));
  assert.equal(runs, 1);

  n.set(2); // isEven stays true, label stays "even"
  flush();
  assert.equal(runs, 1);

  n.set(1); // isEven false, label "odd"
  flush();
  assert.equal(runs, 2);
});

test("computed stays lazy and cached", () => {
  const s = createState(1);
  let runs = 0;
  const c = computed(() => (runs++, s.get() * 2));
  assert.equal(runs, 0); // lazy
  c.get();
  c.get();
  assert.equal(runs, 1); // cached
});

// ---- owner scopes & disposal ------------------------------------------------

test("disposeOwner runs registered cleanups (children first)", () => {
  const order = [];
  const parent = createOwner();
  runWithOwner(parent, () => {
    onCleanup(() => order.push("parent"));
    const child = createOwner();
    runWithOwner(child, () => onCleanup(() => order.push("child")));
  });
  disposeOwner(parent);
  assert.deepEqual(order, ["child", "parent"]);
});

test("a computed is disposed with its owner scope", () => {
  const s = createState(1);
  let runs = 0;
  let c;
  const owner = createOwner();
  runWithOwner(owner, () => {
    c = computed(() => (runs++, s.get()));
    c.get();
  });
  assert.equal(runs, 1);

  disposeOwner(owner);
  s.set(2);
  assert.equal(c.get(), 1); // disposed → not recomputed
  assert.equal(runs, 1);
});

test("an effect created in a scope stops when the scope is disposed", () => {
  const s = createState(0);
  let runs = 0;
  const owner = createOwner();
  runWithOwner(owner, () => effect(() => (s.get(), runs++)));
  assert.equal(runs, 1);
  disposeOwner(owner);
  s.set(1);
  flush();
  assert.equal(runs, 1);
});

// ---- DOM-backed (jsdom) -----------------------------------------------------

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

test("removed list items dispose their per-item effects", { skip }, () => {
  const items = createState([{ id: 1 }, { id: 2 }]);
  const ext = createState(0);
  let runs = 0;
  const target = document.createElement("div");
  mount(
    () => html`<ul>${each(
      () => items.get(),
      (x) => x.id,
      (x) => html`<li>${() => { ext.get(); runs++; return x.id; }}</li>`
    )}</ul>`,
    target
  );
  assert.equal(runs, 2); // both items rendered once

  ext.set(1); flush();
  assert.equal(runs, 4); // both re-ran

  // remove id 2, keeping id 1's object reference stable
  items.set(items.get().filter((x) => x.id === 1)); flush();
  const after = runs;

  ext.set(2); flush();
  assert.equal(runs, after + 1); // only the surviving item's effect re-ran
});

test("unmount() fully detaches DOM and reactive subscriptions", { skip }, () => {
  const c = createState(0);
  const target = document.createElement("div");
  let runs = 0;
  const unmount = mount(() => html`<span>${() => (c.get(), runs++, c.get())}</span>`, target);
  assert.equal(target.querySelector("span").textContent, "0");

  unmount();
  assert.equal(target.childNodes.length, 0); // DOM detached

  const before = runs;
  c.set(1); flush();
  assert.equal(runs, before); // subscription gone
});

// ---- dev / production mode --------------------------------------------------

test("duplicate-key warnings appear in dev and are silent in production", { skip }, () => {
  const dupList = () => {
    const s = createState([{ id: 1 }, { id: 1 }]);
    const t = document.createElement("div");
    mount(() => html`<ul>${each(() => s.get(), (x) => x.id, (x) => html`<li>${() => x.id}</li>`)}</ul>`, t);
  };

  configure({ dev: true });
  const devWarns = captureConsole("warn", dupList);
  configure({ dev: false });
  const prodWarns = captureConsole("warn", dupList);
  configure({ dev: true }); // reset

  assert.ok(devWarns.some((w) => String(w[0]).includes("duplicate key")));
  assert.equal(prodWarns.length, 0);
});

test("self-trigger warnings appear in dev and are silent in production", () => {
  const selfTrigger = () => {
    const c = createState(0);
    effect(() => c.set(c.get() + 1));
    flush();
  };

  configure({ dev: false });
  const prodWarns = captureConsole("warn", selfTrigger);
  configure({ dev: true });
  const devWarns = captureConsole("warn", selfTrigger);
  configure({ dev: true }); // reset

  assert.equal(prodWarns.length, 0);
  assert.ok(devWarns.length > 0);
});
