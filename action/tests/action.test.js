// Tests for @zoijs/action. Reactive state settles on a microtask, so the async
// tests `await tick()` before asserting the DOM.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount } from "@zoijs/core";
import { action } from "../src/index.js";

const domSkip = typeof document === "undefined" ? "needs a DOM (jsdom)" : false;

const tick = () => new Promise((resolve) => setTimeout(resolve));

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("successful async run sets result + done", async () => {
  const save = action(async (x) => x * 2);
  assert.equal(save.pending(), false);

  const returned = await save.run(5);
  assert.equal(returned, 10);
  assert.equal(save.result(), 10);
  assert.equal(save.done(), true);
  assert.equal(save.pending(), false);
  assert.equal(save.error(), null);
});

test("failed async run sets error and resolves undefined (never rejects)", async () => {
  const boom = new Error("nope");
  const save = action(async () => {
    throw boom;
  });
  const returned = await save.run();
  assert.equal(returned, undefined);
  assert.equal(save.error(), boom);
  assert.equal(save.done(), false);
  assert.equal(save.pending(), false);
});

test("synchronous function success", async () => {
  const save = action((n) => n + 1);
  await save.run(1);
  assert.equal(save.result(), 2);
  assert.equal(save.done(), true);
});

test("synchronous function throw is captured as error", async () => {
  const save = action(() => {
    throw new Error("sync fail");
  });
  await save.run();
  assert.equal(save.error().message, "sync fail");
  assert.equal(save.done(), false);
});

test("pending is true while running, false after", async () => {
  const d = deferred();
  const save = action(() => d.promise);
  const p = save.run();
  assert.equal(save.pending(), true);
  assert.equal(save.done(), false);
  d.resolve("ok");
  await p;
  assert.equal(save.pending(), false);
  assert.equal(save.done(), true);
});

test("a new run clears the previous error and done", async () => {
  const save = action(async (ok) => {
    if (!ok) throw new Error("bad");
    return "good";
  });
  await save.run(false);
  assert.equal(save.error().message, "bad");
  assert.equal(save.done(), false);

  const p = save.run(true);
  assert.equal(save.error(), null); // cleared at the start of the new run
  await p;
  assert.equal(save.done(), true);
  assert.equal(save.result(), "good");
});

test("reset() clears all state", async () => {
  const save = action(async () => "value");
  await save.run();
  assert.equal(save.result(), "value");
  assert.equal(save.done(), true);

  save.reset();
  assert.equal(save.result(), undefined);
  assert.equal(save.done(), false);
  assert.equal(save.error(), null);
  assert.equal(save.pending(), false);
});

test("latest run wins — a slower older result can't overwrite a newer one", async () => {
  const d1 = deferred();
  const d2 = deferred();
  let call = 0;
  const save = action(() => (++call === 1 ? d1.promise : d2.promise));

  const pA = save.run(); // id 1
  const pB = save.run(); // id 2 (latest)

  d2.resolve("B");
  await tick();
  assert.equal(save.result(), "B");
  assert.equal(save.pending(), false);

  d1.resolve("A"); // older, arrives late — must be ignored
  await tick();
  assert.equal(save.result(), "B");

  await Promise.all([pA, pB]);
});

test("ignores a result that resolves after the owner is disposed", { skip: domSkip }, async () => {
  const d = deferred();
  let save;
  const target = document.createElement("div");
  const unmount = mount(() => {
    save = action(() => d.promise);
    save.run();
    return html`<p>${() => (save.pending() ? "P" : "idle")}</p>`;
  }, target);

  assert.equal(target.querySelector("p").textContent, "P");
  unmount();
  d.resolve("late");
  await tick();
  assert.equal(save.done(), false); // disposed guard prevented the writes
  assert.equal(save.result(), undefined);
});

test("works inside an html binding (idle → saving → saved)", { skip: domSkip }, async () => {
  const d = deferred();
  const target = document.createElement("div");
  mount(() => {
    const save = action(() => d.promise);
    return html`<button onclick=${() => save.run()}>
      ${() => (save.pending() ? "Saving" : save.done() ? "Saved" : "Save")}
    </button>`;
  }, target);

  const btn = target.querySelector("button");
  assert.equal(btn.textContent.trim(), "Save");

  btn.click();
  await tick();
  assert.equal(btn.textContent.trim(), "Saving");

  d.resolve("ok");
  await tick();
  assert.equal(btn.textContent.trim(), "Saved");
});
