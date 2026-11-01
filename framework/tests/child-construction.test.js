// CORE-1 — a component returned UNCALLED from a reactive content binding is
// constructed by the renderer, untracked, so state read during its setup does not
// subscribe the parent binding.
//
//   ${() => show.get() ? Child : null}                    ← supported idiom
//   ${() => show.get() ? () => Child({ id: () => id.get() }) : null}   ← with props
//
// binding function   → tracked   (decides whether / which child)
// returned component → untracked (child setup; its reads belong to the child)
//
// A DIRECT call — ${() => show.get() ? Child() : null} — runs Child() inside the
// tracked selector itself; a runtime without a compiler cannot tell those reads
// from intentional selector reads. That remains a documented limitation (pinned
// at the end of this file).

import test from "node:test";
import assert from "node:assert/strict";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";
import { each } from "../src/core/each.js";
import { boundary } from "../src/core/boundary.js";
import { createState } from "../src/reactivity/state.js";
import { effect } from "../src/reactivity/effect.js";
import { onCleanup } from "../src/reactivity/owner.js";

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;
const tick = () => new Promise((r) => setTimeout(r));

function setup(component) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const unmount = mount(component, root);
  return { root, unmount, remove: () => { unmount(); root.remove(); } };
}

// ---- 1. basic setup count -------------------------------------------------------

test("child setup runs once; unrelated writes to state read in setup do not rebuild it", { skip }, async () => {
  const show = createState(true);
  const x = createState(0);
  let setups = 0;
  function Child() {
    setups++;
    x.get(); // read during setup
    return html`<div class="child">Child</div>`;
  }
  const app = setup(() => html`<section>${() => (show.get() ? Child : null)}</section>`);
  assert.equal(setups, 1);
  for (let i = 1; i <= 10; i++) {
    x.set(i);
    await tick();
  }
  assert.equal(setups, 1, "1 initial setup + 10 unrelated writes = 1 total setup");
  app.remove();
});

// ---- 2. the selector stays reactive ------------------------------------------------

test("show=true/false/true mounts, disposes and genuinely remounts the child", { skip }, async () => {
  const show = createState(true);
  const x = createState(0);
  let setups = 0;
  let cleanups = 0;
  function Child() {
    setups++;
    x.get();
    onCleanup(() => cleanups++);
    return html`<div class="child">Child</div>`;
  }
  const app = setup(() => html`<section>${() => (show.get() ? Child : null)}</section>`);
  assert.ok(app.root.querySelector(".child"));
  x.set(1);
  await tick();
  assert.deepEqual([setups, cleanups], [1, 0], "unrelated update → no setup, no cleanup");

  show.set(false);
  await tick();
  assert.equal(app.root.querySelector(".child"), null, "child removed");
  assert.deepEqual([setups, cleanups], [1, 1], "removal → cleanup exactly once");

  show.set(true);
  await tick();
  assert.ok(app.root.querySelector(".child"), "child back");
  assert.deepEqual([setups, cleanups], [2, 1], "remount → a new lifecycle (setup runs again)");
  x.set(2);
  await tick();
  assert.deepEqual([setups, cleanups], [2, 1]);
  app.remove();
  assert.equal(cleanups, 2, "unmounting the app disposes the live child");
});

test("the selector can switch between components", { skip }, async () => {
  const tab = createState("a");
  const x = createState(0);
  const runs = { a: 0, b: 0 };
  const A = () => { runs.a++; x.get(); return html`<p class="a">A</p>`; };
  const B = () => { runs.b++; x.get(); return html`<p class="b">B</p>`; };
  const app = setup(() => html`<main>${() => (tab.get() === "a" ? A : B)}</main>`);
  x.set(1); await tick();
  assert.deepEqual(runs, { a: 1, b: 0 });
  tab.set("b"); await tick();
  assert.ok(app.root.querySelector(".b") && !app.root.querySelector(".a"));
  x.set(2); await tick();
  assert.deepEqual(runs, { a: 1, b: 1 });
  app.remove();
});

// ---- 3 + 4. local state and DOM identity survive -------------------------------------

test("child-local state and DOM identity survive unrelated writes", { skip }, async () => {
  const x = createState(0);
  let setups = 0;
  function Child() {
    setups++;
    x.get();
    const local = createState(0);
    return html`<button class="inc" onclick=${() => local.set(local.get() + 1)}>${() => local.get()}</button>`;
  }
  const app = setup(() => html`<section>${() => (true ? Child : null)}</section>`);
  const original = app.root.querySelector(".inc");
  original.click();
  original.click();
  await tick();
  assert.equal(original.textContent, "2");

  x.set(1);
  await tick();
  x.set(2);
  await tick();
  assert.equal(app.root.querySelector(".inc"), original, "same element");
  assert.equal(original.textContent, "2", "local state intact");
  assert.equal(setups, 1);
  app.remove();
});

// ---- 5. focus ------------------------------------------------------------------------

test("a focused input inside the child keeps focus across unrelated writes", { skip }, async () => {
  const x = createState(0);
  function Child() {
    x.get();
    return html`<input class="field" />`;
  }
  const app = setup(() => html`<form>${() => Child}</form>`);
  const input = app.root.querySelector(".field");
  input.focus();
  input.value = "typed";
  assert.equal(document.activeElement, input);
  x.set(1);
  await tick();
  assert.equal(app.root.querySelector(".field"), input, "same input");
  assert.equal(document.activeElement, input, "focus preserved");
  assert.equal(input.value, "typed", "typed value preserved");
  app.remove();
});

// ---- 6. cleanup semantics ---------------------------------------------------------------

test("cleanup: none on unrelated writes, exactly once on removal, nested order unchanged", { skip }, async () => {
  // Reference order: the same tree rendered statically (no reactive binding).
  const order = (log) => {
    function Grandchild() {
      onCleanup(() => log.push("grandchild"));
      return html`<i>g</i>`;
    }
    function Child() {
      onCleanup(() => log.push("child"));
      const inner = createState(0);
      effect(() => { inner.get(); onCleanup(() => log.push("child-effect")); });
      return html`<b>${Grandchild()}</b>`;
    }
    return Child;
  };
  const staticLog = [];
  const s = setup(() => html`<section>${order(staticLog)()}</section>`);
  s.remove();

  const x = createState(0);
  const show = createState(true);
  const reactiveLog = [];
  const Child = order(reactiveLog);
  const Tracked = () => { x.get(); return Child(); };
  const r = setup(() => html`<section>${() => (show.get() ? Tracked : null)}</section>`);
  x.set(1); await tick();
  assert.deepEqual(reactiveLog, [], "unrelated write → no cleanup");
  show.set(false); await tick();
  assert.deepEqual(reactiveLog, staticLog, "removal runs each cleanup once, in the static-render order");
  r.remove();
  assert.deepEqual(reactiveLog, staticLog, "nothing runs twice");
});

// ---- 7. nested components ------------------------------------------------------------------

test("reads in Child and Grandchild setup do not leak into the parent binding", { skip }, async () => {
  const a = createState(0);
  const b = createState(0);
  const counts = { child: 0, grandchild: 0 };
  function Grandchild() {
    counts.grandchild++;
    b.get();
    return html`<i class="g">g</i>`;
  }
  function Child() {
    counts.child++;
    a.get();
    return html`<div>${Grandchild()}</div>`;
  }
  const app = setup(() => html`<section>${() => Child}</section>`);
  const g = app.root.querySelector(".g");
  a.set(1); b.set(1); await tick();
  a.set(2); b.set(2); await tick();
  assert.deepEqual(counts, { child: 1, grandchild: 1 });
  assert.equal(app.root.querySelector(".g"), g);
  app.remove();
});

test("a nested uncalled component inside the child is also isolated", { skip }, async () => {
  const x = createState(0);
  let inner = 0;
  const Inner = () => { inner++; x.get(); return html`<i>i</i>`; };
  const Child = () => html`<div>${() => Inner}</div>`;
  const app = setup(() => html`<section>${() => Child}</section>`);
  x.set(1); await tick();
  assert.equal(inner, 1);
  app.remove();
});

// ---- 8. reactivity INSIDE the child still works ------------------------------------------

test("the child's own reactive bindings update in place (no reconstruction)", { skip }, async () => {
  const x = createState(0);
  let setups = 0;
  function Child() {
    setups++;
    return html`<span class="v">${() => x.get()}</span>`;
  }
  const app = setup(() => html`<section>${() => Child}</section>`);
  const span = app.root.querySelector(".v");
  x.set(5);
  await tick();
  assert.equal(span.textContent, "5");
  assert.equal(app.root.querySelector(".v"), span);
  assert.equal(setups, 1);
  app.remove();
});

// ---- props --------------------------------------------------------------------------------

test("props wrapper: reads inside () => Child({ id: id.get() }) are untracked (a snapshot)", { skip }, async () => {
  const show = createState(true);
  const id = createState(1);
  let setups = 0;
  function Child({ id }) {
    setups++;
    return html`<p class="id">${id}</p>`;
  }
  const app = setup(() => html`<section>${() => (show.get() ? () => Child({ id: id.get() }) : null)}</section>`);
  id.set(2);
  await tick();
  // The wrapper runs inside the renderer's untracked invocation: id.get() there is
  // NOT a selector dependency, so the child is not rebuilt — and shows the value
  // captured at construction.
  assert.equal(setups, 1);
  assert.equal(app.root.querySelector(".id").textContent, "1");
  app.remove();
});

test("props wrapper with getters: reactive props update without reconstruction", { skip }, async () => {
  const show = createState(true);
  const id = createState(1);
  let setups = 0;
  function Child({ id }) {
    setups++;
    return html`<p class="id">${() => id()}</p>`;
  }
  const app = setup(() => html`<section>${() => (show.get() ? () => Child({ id: () => id.get() }) : null)}</section>`);
  const p = app.root.querySelector(".id");
  id.set(2);
  await tick();
  assert.equal(p.textContent, "2", "getter prop is live");
  assert.equal(app.root.querySelector(".id"), p);
  assert.equal(setups, 1);
  app.remove();
});

// ---- resources / owned work -----------------------------------------------------------------

test("owned work started in setup (effect + simulated request) is not restarted", { skip }, async () => {
  const show = createState(true);
  const userId = createState(7);
  const unrelated = createState(0);
  let requests = 0;
  let aborted = 0;
  const result = createState(null);
  function Profile() {
    unrelated.get(); // the read that used to rebuild the subtree
    const ctl = { cancelled: false };
    requests++;
    Promise.resolve().then(() => { if (!ctl.cancelled) result.set("loaded " + userId.peek()); });
    onCleanup(() => { ctl.cancelled = true; aborted++; });
    return html`<p class="profile">${() => result.get() ?? "loading"}</p>`;
  }
  const app = setup(() => html`<section>${() => (show.get() ? Profile : null)}</section>`);
  unrelated.set(1); await tick();
  unrelated.set(2); await tick();
  assert.equal(requests, 1, "initial request not repeated");
  assert.equal(aborted, 0, "pending work not cancelled");
  assert.equal(app.root.querySelector(".profile").textContent, "loaded 7");
  show.set(false); await tick();
  assert.equal(aborted, 1, "genuine removal disposes it");
  app.remove();
});

// ---- boundaries ------------------------------------------------------------------------------

test("a boundary child under an uncalled component is isolated and still catches", { skip }, async () => {
  const show = createState(true);
  const x = createState(0);
  const fail = createState(false);
  let setups = 0;
  let cleanups = 0;
  function Child() {
    setups++;
    x.get();
    onCleanup(() => cleanups++);
    if (fail.peek()) throw new Error("boom");
    return html`<p class="ok">ok</p>`;
  }
  const origError = console.error;
  console.error = () => {};
  try {
    const app = setup(() => html`<section>${() => (show.get() ? () => boundary(Child, () => html`<p class="fallback">fallback</p>`) : null)}</section>`);
    x.set(1); await tick();
    assert.deepEqual([setups, cleanups], [1, 0], "no rebuild, no cleanup");
    show.set(false); await tick();
    assert.equal(cleanups, 1, "boundary child disposed on removal");
    fail.set(true);
    show.set(true); await tick();
    assert.ok(app.root.querySelector(".fallback"), "boundary still catches");
    assert.equal(cleanups, 2, "the failed attempt's scope was disposed by the boundary");
    app.remove();
  } finally {
    console.error = origError;
  }
});

// ---- the selector is NOT over-untracked -------------------------------------------------------

test("ordinary reactive expressions remain fully tracked", { skip }, async () => {
  const count = createState(1);
  const cond = createState(true);
  const items = createState([1, 2]);
  const nested = html`<b class="n">n</b>`;
  const app = setup(() => html`
    <p class="c">${() => count.get()}</p>
    <p class="y">${() => (cond.get() ? "yes" : "no")}</p>
    <p class="l">${() => items.get().length}</p>
    <p class="t">${() => cond.get() && nested}</p>`);
  count.set(2); cond.set(false); items.set([1, 2, 3]);
  await tick();
  const q = (s) => app.root.querySelector(s).textContent;
  assert.deepEqual([q(".c"), q(".y"), q(".l"), q(".t")], ["2", "no", "3", ""]);
  app.remove();
});

test("a selector that reads state and returns a component re-runs on THAT state", { skip }, async () => {
  const user = createState("ada");
  let setups = 0;
  const Badge = () => { setups++; return html`<b class="u">${user.peek()}</b>`; };
  const app = setup(() => html`<section>${() => (user.get() ? Badge : null)}</section>`);
  user.set("lin");
  await tick();
  // user.get() was read by the SELECTOR → it is a dependency; the selector re-ran
  // and the branch was rebuilt. Only reads inside the component are untracked.
  assert.equal(setups, 2);
  assert.equal(app.root.querySelector(".u").textContent, "lin");
  app.remove();
});

test("a returned function's result renders like any other value", { skip }, () => {
  const app = setup(() => html`<p class="s">${() => () => "plain text"}</p><p class="n">${() => () => null}</p>`);
  assert.equal(app.root.querySelector(".s").textContent, "plain text");
  assert.equal(app.root.querySelector(".n").textContent, "");
  app.remove();
});

// ---- each() keeps its behavior ------------------------------------------------------------------

test("each() items using the idiom behave the same as top-level bindings", { skip }, async () => {
  const x = createState(0);
  const open = createState(1);
  let setups = 0;
  const Detail = () => { setups++; x.get(); return html`<em>d</em>`; };
  const app = setup(() => html`<ul>${each([{ id: 1 }, { id: 2 }], (r) => r.id, (r) => html`<li>${() => (open.get() === r.id ? Detail : null)}</li>`)}</ul>`);
  x.set(1); await tick();
  assert.equal(setups, 1);
  open.set(2); await tick();
  assert.equal(setups, 2);
  assert.equal(app.root.querySelectorAll("em").length, 1);
  app.remove();
});

// ---- documented limitation ---------------------------------------------------------------------

test("LIMITATION (documented): a direct Child() call inside the selector is still tracked", { skip }, async () => {
  // Child() runs while the selector is being evaluated, so its setup reads are
  // indistinguishable from selector reads. Use `? Child : null` instead.
  const x = createState(0);
  let setups = 0;
  const Child = () => { setups++; x.get(); return html`<p>c</p>`; };
  const app = setup(() => html`<section>${() => (true ? Child() : null)}</section>`);
  x.set(1); await tick();
  assert.equal(setups, 2);
  app.remove();
});
