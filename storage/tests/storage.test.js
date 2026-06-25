// Tests for @zoijs/storage. Reactive updates settle on a microtask, so the
// DOM-binding tests `await tick()` before asserting.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount } from "@zoijs/core";
import { storage } from "../src/index.js";

const tick = () => new Promise((resolve) => setTimeout(resolve));
const domSkip = typeof document === "undefined" ? "needs a DOM (jsdom)" : false;

const clear = () => {
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
};

test("uses the initial value when the key is empty", () => {
  clear();
  const theme = storage("theme", "light");
  assert.equal(theme.get(), "light");
  assert.equal(theme.peek(), "light");
});

test("reads an existing JSON value from storage", () => {
  clear();
  window.localStorage.setItem("count", JSON.stringify(42));
  const count = storage("count", 0);
  assert.equal(count.get(), 42);
});

test("reads non-primitive JSON (objects and arrays)", () => {
  clear();
  window.localStorage.setItem("prefs", JSON.stringify({ a: 1, b: [2, 3] }));
  const prefs = storage("prefs", {});
  assert.deepEqual(prefs.get(), { a: 1, b: [2, 3] });
});

test("set() writes JSON to storage", () => {
  clear();
  const theme = storage("theme", "light");
  theme.set("dark");
  assert.equal(theme.get(), "dark");
  assert.equal(window.localStorage.getItem("theme"), JSON.stringify("dark"));
});

test("falls back to the initial value when stored JSON is corrupt", () => {
  clear();
  window.localStorage.setItem("broken", "{ not valid json");
  const s = storage("broken", "default");
  assert.equal(s.get(), "default");
});

test("a new instance reads the value persisted by an earlier one", () => {
  clear();
  const a = storage("shared", 0);
  a.set(7);
  const b = storage("shared", 0);
  assert.equal(b.get(), 7);
});

test("get() is reactive inside an html binding", { skip: domSkip }, async () => {
  clear();
  const s = storage("live", "one");
  const target = document.createElement("div");
  mount(() => html`<p>${() => s.get()}</p>`, target);

  assert.equal(target.querySelector("p").textContent, "one");
  s.set("two");
  await tick();
  assert.equal(target.querySelector("p").textContent, "two");
});

test("peek() reads without subscribing", { skip: domSkip }, async () => {
  clear();
  const s = storage("peeky", "a");
  let runs = 0;
  const target = document.createElement("div");
  mount(() => html`<p>${() => { runs++; return s.peek(); }}</p>`, target);

  assert.equal(target.querySelector("p").textContent, "a");
  const before = runs;
  s.set("b");
  await tick();
  assert.equal(runs, before); // peek did not subscribe → the binding did not re-run
  assert.equal(target.querySelector("p").textContent, "a");
});

test("degrades to in-memory state when localStorage access throws", { skip: domSkip }, async () => {
  // Shadow the prototype's localStorage with a throwing getter (private mode).
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    },
  });
  try {
    const s = storage("nope", "init");
    assert.equal(s.get(), "init"); // initial value, no crash

    const target = document.createElement("div");
    mount(() => html`<p>${() => s.get()}</p>`, target);
    s.set("changed");
    await tick();
    assert.equal(s.get(), "changed"); // still reactive, purely in memory
    assert.equal(target.querySelector("p").textContent, "changed");
  } finally {
    delete window.localStorage; // restore the prototype's localStorage
  }
});

test("set() does not crash when setItem throws (e.g. quota exceeded)", () => {
  clear();
  const stub = {
    getItem: () => null,
    setItem() {
      throw new Error("QuotaExceededError");
    },
    removeItem() {},
    clear() {},
  };
  Object.defineProperty(window, "localStorage", { configurable: true, get: () => stub });
  try {
    const s = storage("quota", "a");
    assert.doesNotThrow(() => s.set("b"));
    assert.equal(s.get(), "b"); // in-memory value still updates
  } finally {
    delete window.localStorage;
  }
});

test("set() does not throw on a non-serializable value", () => {
  clear();
  const s = storage("circular", { ok: true });
  const circular = {};
  circular.self = circular; // JSON.stringify throws on this
  assert.doesNotThrow(() => s.set(circular));
  assert.equal(s.get(), circular); // reactive value updates even though it can't persist
});
