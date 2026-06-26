// Tests for boundary() — render-time error containment (RFC 0004, core 1.3.0).

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../src/reactivity/state.js";
import { effect } from "../src/reactivity/effect.js";
import { flush } from "../src/reactivity/scheduler.js";
import { configure } from "../src/reactivity/env.js";
import { boundary } from "../src/core/boundary.js";
import { html } from "../src/core/html.js";
import { mount } from "../src/core/mount.js";

function captureError(fn) {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try {
    return fn();
  } finally {
    console.error = original;
  }
}

test("renders the child when it does not throw", () => {
  const result = boundary(() => "ok", () => "fallback");
  assert.equal(result, "ok");
});

test("renders the fallback when the child throws during setup", () => {
  const result = captureError(() =>
    boundary(() => {
      throw new Error("boom");
    }, () => "fallback")
  );
  assert.equal(result, "fallback");
});

test("the fallback receives the thrown error", () => {
  const result = captureError(() =>
    boundary(() => {
      throw new Error("bad input");
    }, (err) => `caught: ${err.message}`)
  );
  assert.equal(result, "caught: bad input");
});

test("accepts a plain (non-function) child and fallback", () => {
  assert.equal(boundary("hi", "fb"), "hi"); // child is a value, returned as-is
});

test("disposes work created before the throw (no zombie effect)", () => {
  const s = createState(0);
  let runs = 0;
  const result = captureError(() =>
    boundary(() => {
      effect(() => {
        runs++;
        s.get();
      }); // created + runs once, then the setup throws
      throw new Error("setup failed");
    }, () => "fallback")
  );
  assert.equal(result, "fallback");
  assert.equal(runs, 1); // ran once during setup
  s.set(1);
  flush();
  assert.equal(runs, 1); // disposed with the boundary's scope — never re-runs
});

test("logs in dev and is silent in production", () => {
  const errorsDuring = (fn) => {
    const original = console.error;
    const calls = [];
    console.error = (...a) => calls.push(a);
    try {
      fn();
    } finally {
      console.error = original;
    }
    return calls;
  };
  const throwOnce = () => boundary(() => { throw new Error("x"); }, () => "fb");

  configure({ dev: false });
  const prod = errorsDuring(throwOnce);
  configure({ dev: true });
  const dev = errorsDuring(throwOnce);

  assert.equal(prod.length, 0); // silent in production
  assert.ok(dev.length > 0); // logged in development
});

const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

test("renders the fallback into the DOM when a child component throws", { skip }, () => {
  const target = document.createElement("div");
  function Risky() {
    throw new Error("kaboom");
  }
  captureError(() =>
    mount(
      () => html`<div>${boundary(Risky, (err) => html`<p class="err">Failed: ${err.message}</p>`)}</div>`,
      target
    )
  );
  assert.equal(target.querySelector(".err").textContent, "Failed: kaboom");
});

test("renders the child subtree normally when it does not throw (in the DOM)", { skip }, () => {
  const target = document.createElement("div");
  function Ok() {
    return html`<span class="ok">hello</span>`;
  }
  mount(() => html`<div>${boundary(Ok, () => html`<p>fallback</p>`)}</div>`, target);
  assert.equal(target.querySelector(".ok").textContent, "hello");
  assert.equal(target.querySelector("p"), null);
});

test("a successful child's reactivity still works after the boundary", { skip }, () => {
  const target = document.createElement("div");
  const n = createState(1);
  function Counter() {
    return html`<b>${() => n.get()}</b>`;
  }
  mount(() => html`<div>${boundary(Counter, () => "fb")}</div>`, target);
  assert.equal(target.querySelector("b").textContent, "1");
  n.set(2);
  flush();
  assert.equal(target.querySelector("b").textContent, "2");
});
