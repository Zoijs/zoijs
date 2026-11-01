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

// ---- { initial }: server-seeded resources (SSR hydration) -------------------

test("with { initial }, starts settled and does NOT auto-load", { skip: domSkip }, async () => {
  let called = 0;
  let r;
  mount(() => {
    r = resource(() => { called++; return Promise.resolve("fetched"); }, { initial: "seeded" });
    return html`<p>${() => String(r.data())}</p>`;
  }, document.createElement("div"));

  assert.equal(r.data(), "seeded"); // the provided value, immediately
  assert.equal(r.loading(), false); // already settled — no spinner
  assert.equal(r.error(), null);
  await tick();
  assert.equal(called, 0); // fetcher was never invoked — no refetch, no flash
});

test("{ initial } accepts null as a real settled value (no auto-load)", { skip: domSkip }, async () => {
  let called = 0;
  let r;
  mount(() => {
    r = resource(() => { called++; return Promise.resolve("x"); }, { initial: null });
    return html`<p>x</p>`;
  }, document.createElement("div"));
  await tick();
  assert.equal(r.data(), null);
  assert.equal(called, 0); // presence of the `initial` key — not its value — skips the load
});

test("refresh() still loads on demand after { initial }", { skip: domSkip }, async () => {
  const d = deferred();
  let r;
  mount(() => {
    r = resource(() => d.promise, { initial: "seeded" });
    return html`<p>${() => (r.loading() ? "L" : String(r.data()))}</p>`;
  }, document.createElement("div"));

  assert.equal(r.data(), "seeded");
  r.refresh();
  assert.equal(r.loading(), true); // an explicit load is in flight
  d.resolve("fresh");
  await tick();
  assert.equal(r.data(), "fresh");
});

// CORE-1 integration: a resource created in a component returned UNCALLED from a
// reactive binding (`${() => show.get() ? Profile : null}`) belongs to that child.
// State read during the child's setup — including synchronously inside the
// fetcher — must not rebuild the child, re-run the request, or dispose the
// resource; genuine removal must still dispose it.
test("a resource in an uncalled-component child is not recreated by unrelated writes", { skip: domSkip }, async () => {
  const { createState } = await import("@zoijs/core");
  const show = createState(true);
  const userId = createState(7);
  const theme = createState("light");
  const pending = [];
  let fetches = 0;
  function Profile() {
    theme.get(); // a setup read that used to subscribe the parent binding
    const user = resource(() => {
      fetches++;
      const d = deferred();
      pending.push({ id: userId.get(), d }); // fetcher reads state synchronously
      return d.promise;
    });
    return html`<p class="p">${() => (user.loading() ? "loading" : user.data())}</p>`;
  }
  const root = document.createElement("div");
  const unmount = mount(() => html`<section>${() => (show.get() ? Profile : null)}</section>`, root);

  theme.set("dark"); await tick();
  userId.set(8); await tick();
  assert.equal(fetches, 1, "initial request not repeated");
  assert.equal(root.querySelector(".p").textContent, "loading", "pending work not restarted");

  pending[0].d.resolve("user 7");
  await tick();
  assert.equal(root.querySelector(".p").textContent, "user 7", "the original request settles into the same child");

  show.set(false); await tick();
  show.set(true); await tick();
  assert.equal(fetches, 2, "a genuine remount creates a new resource");
  show.set(false); await tick();
  pending[1].d.resolve("late");
  await tick();
  assert.equal(root.querySelector(".p"), null, "removed child stays removed (late result ignored)");
  unmount();
});

// CORE-3: a failure that becomes the resource's error() state is also reported to
// configure({ onError }) — once, with the original value. Stale (superseded) and
// post-dispose results are ignored by the resource, so they are not reported.
test("CORE-3: failures that land in error() are reported to onError once", async () => {
  const { configure } = await import("@zoijs/core");
  const calls = [];
  configure({ onError: (error, info) => calls.push({ error, info }) });
  try {
    // rejected fetcher
    const rejected = new Error("404");
    const r1 = resource(() => Promise.reject(rejected));
    await tick();
    assert.equal(r1.error(), rejected, "error state unchanged");
    assert.deepEqual(calls, [{ error: rejected, info: { kind: "resource" } }]);

    // synchronous throw
    const thrown = new Error("sync");
    const r2 = resource(() => { throw thrown; });
    await tick();
    assert.equal(r2.error(), thrown);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].error, thrown);

    // superseded request: its rejection is stale → ignored → not reported
    const first = deferred();
    const second = deferred();
    let n = 0;
    const r3 = resource(() => (n++ === 0 ? first.promise : second.promise));
    r3.refresh();
    second.resolve("fresh");
    first.reject(new Error("stale"));
    await tick();
    assert.equal(r3.data(), "fresh");
    assert.equal(calls.length, 2, "stale failure not reported");

    // success → nothing reported
    resource(() => Promise.resolve(1));
    await tick();
    assert.equal(calls.length, 2);
  } finally {
    configure({ onError: null });
  }
});

test("CORE-3: a failure after the owning component is disposed is not reported", { skip: domSkip }, async () => {
  const { configure } = await import("@zoijs/core");
  const calls = [];
  configure({ onError: (e) => calls.push(e) });
  try {
    const d = deferred();
    const root = document.createElement("div");
    const unmount = mount(() => { resource(() => d.promise); return html`<p></p>`; }, root);
    unmount();
    d.reject(new Error("after unmount"));
    await tick();
    assert.deepEqual(calls, []);
  } finally {
    configure({ onError: null });
  }
});

// Reporting goes through the core's shared runtime (no @zoijs/core/internal import). With no
// reporter — a core older than 1.9 has no runtime — a failure still lands in error(), quietly.
test("without a runtime reporter, a failed fetch still sets error() and nothing throws", async () => {
  const rt = globalThis[Symbol.for("zoijs.runtime@1")];
  const saved = rt.report;
  rt.report = undefined;
  try {
    const err = new Error("offline");
    const r = resource(() => Promise.reject(err));
    await new Promise((res) => setTimeout(res, 0));
    assert.equal(r.error(), err);
  } finally {
    rt.report = saved;
  }
});
