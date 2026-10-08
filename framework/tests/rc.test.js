// RC hardening tests: conditional rendering, onCleanup, parser edge cases.

import test from "node:test";
import assert from "node:assert/strict";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { each } from "../src/core/each.js";
import { createState } from "../src/reactivity/state.js";
import { onCleanup } from "../src/reactivity/owner.js";
import { flush } from "../src/reactivity/scheduler.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

function mountInto(component) {
  const target = document.createElement("div");
  const unmount = mount(component, target);
  return { target, unmount };
}

// ---- conditional rendering ---------------------------------------------------

test("a falsy conditional (`cond && html`) renders nothing, not 'false'", { skip }, () => {
  const show = createState(false);
  const { target } = mountInto(() => html`<div>${() => show.get() && html`<p>hi</p>`}</div>`);
  assert.equal(target.querySelector("p"), null);
  assert.equal(target.querySelector("div").textContent, "");

  show.set(true);
  flush();
  assert.equal(target.querySelector("p").textContent, "hi");

  show.set(false);
  flush();
  assert.equal(target.querySelector("p"), null);
  assert.equal(target.querySelector("div").textContent, "");
});

test("null and undefined render nothing; 0 and strings render", { skip }, () => {
  assert.equal(mountInto(() => html`<p>${() => null}</p>`).target.querySelector("p").textContent, "");
  assert.equal(mountInto(() => html`<p>${() => undefined}</p>`).target.querySelector("p").textContent, "");
  assert.equal(mountInto(() => html`<p>${() => 0}</p>`).target.querySelector("p").textContent, "0");
  assert.equal(mountInto(() => html`<p>${() => "x"}</p>`).target.querySelector("p").textContent, "x");
});

// ---- onCleanup ---------------------------------------------------------------

test("onCleanup runs teardown when a component is unmounted", { skip }, () => {
  let cleaned = false;
  const { unmount } = mountInto(() => {
    onCleanup(() => (cleaned = true));
    return html`<p>x</p>`;
  });
  assert.equal(cleaned, false);
  unmount();
  assert.equal(cleaned, true);
});

test("onCleanup in a list item runs when that item is removed", { skip }, () => {
  const items = createState([{ id: 1 }, { id: 2 }]);
  const cleaned = [];
  mountInto(() => html`<ul>${each(
    () => items.get(),
    (x) => x.id,
    (x) => {
      onCleanup(() => cleaned.push(x.id));
      return html`<li>${() => x.id}</li>`;
    }
  )}</ul>`);

  items.set([{ id: 1 }]); // remove id 2
  flush();
  assert.deepEqual(cleaned, [2]);
});

// ---- parser edge cases -------------------------------------------------------

test("single-quoted dynamic attribute", { skip }, () => {
  const t = mountInto(() => html`<div class='${"box"}'>x</div>`).target;
  assert.equal(t.querySelector("div").getAttribute("class"), "box");
});

test("static HTML comments pass through and are not treated as markers", { skip }, () => {
  const c = createState("hi");
  const t = mountInto(() => html`<div><!-- a note -->${() => c.get()}</div>`).target;
  assert.equal(t.querySelector("div").textContent, "hi");
  c.set("bye"); flush();
  assert.equal(t.querySelector("div").textContent, "bye");
});

test("self-closing void element with dynamic attributes", { skip }, () => {
  const v = createState("typed");
  const t = mountInto(() => html`<input value=${() => v.get()} placeholder="p" />`).target;
  assert.equal(t.querySelector("input").value, "typed");
  assert.equal(t.querySelector("input").getAttribute("placeholder"), "p");
});

test("adjacent text holes render in order", { skip }, () => {
  const t = mountInto(() => html`<p>${() => "a"}${() => "b"}${() => "c"}</p>`).target;
  assert.equal(t.querySelector("p").textContent, "abc");
});

test("nested each() (list of lists)", { skip }, () => {
  const groups = createState([
    { id: "g1", items: [{ id: 1, n: "a" }, { id: 2, n: "b" }] },
    { id: "g2", items: [{ id: 3, n: "c" }] },
  ]);
  const t = mountInto(() => html`<div>${each(
    () => groups.get(),
    (g) => g.id,
    (g) => html`<ul>${each(() => g.items, (i) => i.id, (i) => html`<li>${() => i.n}</li>`)}</ul>`
  )}</div>`).target;
  assert.equal(t.querySelectorAll("ul").length, 2);
  assert.deepEqual([...t.querySelectorAll("li")].map((li) => li.textContent), ["a", "b", "c"]);
});
