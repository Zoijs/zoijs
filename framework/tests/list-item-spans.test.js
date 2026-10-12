// each() items with several root nodes and root-level bindings (found while reviewing Zoijs Insight;
// the audit's "Rn3"). A record kept a SNAPSHOT of its root nodes, so content a root-level binding
// added later (a conditional row, a nested list) wasn't part of it: on a reorder it stayed behind,
// and toggling it afterwards left orphaned rows. Records now track their LIVE span of nodes.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, each, createState, onCleanup } from "../src/index.js";
import { flush } from "../src/reactivity/scheduler.js";

const host = () => document.body.appendChild(document.createElement("div"));
const rows = (el) => [...el.querySelectorAll("li")].map((l) => l.textContent).join(",");

function list(template) {
  const el = host();
  const items = createState([{ id: 1, show: true }, { id: 2, show: true }, { id: 3, show: false }]);
  mount(() => html`<ul>${each(() => items.get(), (i) => i.id, template)}</ul>`, el);
  const set = (...pairs) => (items.set(pairs.map(([id, show]) => ({ id, show }))), flush());
  return { el, set };
}

test("trailing root binding: its content moves with the item and never orphans", () => {
  const { el, set } = list((i) => html`<li>a${i.id}</li>${() => (i.show ? html`<li>b${i.id}</li>` : null)}`);
  assert.equal(rows(el), "a1,b1,a2,b2,a3");
  set([2, true], [1, true], [3, true]);
  assert.equal(rows(el), "a2,b2,a1,b1,a3,b3");
  set([1, false], [2, true], [3, true]);
  set([3, true], [2, true], [1, true]);
  assert.equal(rows(el), "a3,b3,a2,b2,a1,b1");
  set([2, true]);
  assert.equal(rows(el), "a2,b2", "removed items take their binding content with them");
});

test("leading root binding (content before the item's first static node)", () => {
  const { el, set } = list((i) => html`${() => (i.show ? html`<li>b${i.id}</li>` : null)}<li>a${i.id}</li>`);
  assert.equal(rows(el), "b1,a1,b2,a2,a3");
  set([3, true], [1, true], [2, false]);
  assert.equal(rows(el), "b3,a3,b1,a1,a2");
  set([2, true], [3, false], [1, true]);
  assert.equal(rows(el), "b2,a2,a3,b1,a1");
  set([1, true]);
  assert.equal(rows(el), "b1,a1");
});

test("an item that is only a binding, and a nested list at the root of an item", () => {
  const el = host();
  const groups = createState([{ id: "x", kids: [1, 2] }, { id: "y", kids: [3] }]);
  mount(
    () => html`<ul>${each(() => groups.get(), (g) => g.id, (g) => html`${each(() => g.kids, (k) => k, (k) => html`<li>${g.id}${k}</li>`)}`)}</ul>`,
    el
  );
  assert.equal(rows(el), "x1,x2,y3");
  groups.set([{ id: "y", kids: [3, 4] }, { id: "x", kids: [2] }]);
  flush();
  assert.equal(rows(el), "y3,y4,x2");
  groups.set([{ id: "x", kids: [] }]);
  flush();
  assert.equal(rows(el), "");
  groups.set([{ id: "x", kids: [5] }, { id: "z", kids: [6] }]);
  flush();
  assert.equal(rows(el), "x5,z6");
});

test("node identity is kept on moves, and cleanup runs for removed items", () => {
  const cleaned = [];
  const { el, set } = list((i) => {
    onCleanup(() => cleaned.push(i.id));
    return html`<li>a${i.id}</li>${() => (i.show ? html`<li>b${i.id}</li>` : null)}`;
  });
  const a1 = [...el.querySelectorAll("li")].find((l) => l.textContent === "a1");
  set([2, true], [1, true]);
  assert.equal([...el.querySelectorAll("li")].find((l) => l.textContent === "a1"), a1, "the item's static node moved, not re-rendered");
  assert.deepEqual(cleaned, [3]);
  assert.equal(rows(el), "a2,b2,a1,b1");
});

test("single-root items are unchanged (no extra nodes)", () => {
  const el = host();
  mount(() => html`<ul>${each([1, 2], (n) => n, (n) => html`<li>${n}</li>`)}</ul>`, el);
  const ul = el.querySelector("ul");
  assert.equal([...ul.childNodes].filter((n) => n.nodeType === 3).length, 0);
});
