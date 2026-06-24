// Tests for @zoijs/resource. The reactive state settles on a microtask, so the
// async tests `await tick()` before asserting.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount } from "@zoijs/core";
import { resource } from "../src/index.js";

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

test("starts in the loading state and loads on creation", async () => {
  const user = resource(() => Promise.resolve({ name: "Ada" }));
  assert.equal(user.loading(), true);
  assert.equal(user.data(), undefined);
  assert.equal(user.error(), null);

  await tick();
  assert.equal(user.loading(), false);
  assert.deepEqual(user.data(), { name: "Ada" });
  assert.equal(user.error(), null);
});

test("captures a rejected fetch as the error", async () => {
  const boom = new Error("boom");
  const user = resource(() => Promise.reject(boom));
  await tick();
  assert.equal(user.loading(), false);
  assert.equal(user.error(), boom);
  assert.equal(user.data(), undefined);
});

test("captures a synchronous throw as the error", async () => {
  const user = resource(() => {
    throw new Error("sync");
  });
  await tick();
  assert.equal(user.error().message, "sync");
  assert.equal(user.loading(), false);
});

test("accepts a synchronous (non-promise) fetcher", async () => {
  const n = resource(() => 42);
  await tick();
  assert.equal(n.data(), 42);
  assert.equal(n.loading(), false);
});

test("refresh() loads again and keeps old data until it resolves", async () => {
  let count = 0;
  const r = resource(() => Promise.resolve(++count));
  await tick();
  assert.equal(r.data(), 1);

  const d = deferred();
  const r2State = resource(() => d.promise);
  await tick();
  // (separate resource just to show data persists across a pending refresh)
  void r2State;

  r.refresh();
  assert.equal(r.loading(), true);
  assert.equal(r.data(), 1); // old value still readable while refreshing
  await tick();
  assert.equal(r.data(), 2);
  assert.equal(r.loading(), false);
});

test("a stale (superseded) load cannot overwrite a newer result", async () => {
  const d1 = deferred();
  const d2 = deferred();
  let call = 0;
  const r = resource(() => (++call === 1 ? d1.promise : d2.promise));

  r.refresh(); // second load supersedes the first
  d2.resolve("second");
  await tick();
  assert.equal(r.data(), "second");

  d1.resolve("first"); // arrives late — must be ignored
  await tick();
  assert.equal(r.data(), "second");
});

test("multiple resources are independent", async () => {
  const a = resource(() => Promise.resolve("A"));
  const b = resource(() => Promise.reject(new Error("B failed")));
  await tick();
  assert.equal(a.data(), "A");
  assert.equal(a.error(), null);
  assert.equal(b.data(), undefined);
  assert.equal(b.error().message, "B failed");
});

test("works inside an html binding (loading → data)", { skip: domSkip }, async () => {
  const d = deferred();
  const target = document.createElement("div");
  mount(() => {
    const r = resource(() => d.promise);
    return html`<p>${() => (r.loading() ? "Loading" : r.error() ? "Error" : r.data())}</p>`;
  }, target);

  const p = target.querySelector("p");
  assert.equal(p.textContent, "Loading");
  d.resolve("Hello");
  await tick();
  assert.equal(p.textContent, "Hello");
});

test("works inside an html binding (loading → error)", { skip: domSkip }, async () => {
  const d = deferred();
  const target = document.createElement("div");
  mount(() => {
    const r = resource(() => d.promise);
    return html`<p>${() => (r.loading() ? "Loading" : r.error() ? "Error" : r.data())}</p>`;
  }, target);

  const p = target.querySelector("p");
  assert.equal(p.textContent, "Loading");
  d.reject(new Error("nope"));
  await tick();
  assert.equal(p.textContent, "Error");
});

test("ignores a result that resolves after the owner is disposed", { skip: domSkip }, async () => {
  const d = deferred();
  let r;
  const target = document.createElement("div");
  const unmount = mount(() => {
    r = resource(() => d.promise);
    return html`<p>${() => (r.loading() ? "L" : String(r.data()))}</p>`;
  }, target);

  assert.equal(target.querySelector("p").textContent, "L");
  unmount(); // dispose the owner before the fetch resolves
  d.resolve("late");
  await tick();
  assert.equal(r.data(), undefined); // disposed guard prevented the write
});
