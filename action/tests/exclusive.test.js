// SEC-10 — action(fn, { exclusive: true }): while a run is pending, run() joins it instead of
// calling fn again, so a double-click can't send a non-idempotent request twice.

import test from "node:test";
import assert from "node:assert/strict";
import { configure } from "@zoijs/core";
import { action } from "../src/index.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

test("default (non-exclusive): overlapping runs each call fn; the latest wins (unchanged)", async () => {
  const calls = [];
  const gates = [deferred(), deferred()];
  const a = action((n) => (calls.push(n), gates[n].promise));
  const p0 = a.run(0);
  const p1 = a.run(1);
  assert.deepEqual(calls, [0, 1]);
  gates[0].resolve("first");
  gates[1].resolve("second");
  assert.deepEqual([await p0, await p1], ["first", "second"]);
  assert.equal(a.result(), "second");
});

test("exclusive: two run() calls in the same tick start fn once and share the outcome", async () => {
  let calls = 0;
  const gate = deferred();
  const a = action((x) => (calls++, gate.promise.then((v) => v + x)), { exclusive: true });
  const p1 = a.run("!");
  const p2 = a.run("?"); // joined: its argument is ignored
  assert.equal(calls, 1);
  assert.equal(p2, p1, "the duplicate gets the pending run's promise");
  assert.equal(a.pending(), true);
  gate.resolve("saved");
  assert.equal(await p2, "saved!");
  assert.equal(a.pending(), false);
  assert.equal(a.done(), true);
});

test("exclusive: the lock is taken before fn runs (a re-entrant run() can't start it again)", async () => {
  let calls = 0;
  let inner;
  const a = action(() => {
    calls++;
    inner = a.run();
    return "ok";
  }, { exclusive: true });
  const outer = a.run();
  assert.equal(calls, 1);
  assert.equal(inner, outer);
  assert.equal(await outer, "ok");
});

test("exclusive: after success, and after failure, the next run is allowed", async () => {
  let calls = 0;
  const outcomes = [() => "ok", () => { throw new Error("nope"); }, () => "again"];
  const a = action(async () => outcomes[calls++](), { exclusive: true });
  assert.equal(await a.run(), "ok");
  assert.equal(await a.run(), undefined, "failure still resolves undefined");
  assert.equal(a.error().message, "nope");
  assert.equal(a.pending(), false);
  assert.equal(await a.run(), "again", "not left locked after a failure");
  assert.equal(calls, 3);
  assert.equal(a.error(), null);
});

test("exclusive: a failing run is reported to onError once; joined duplicates report nothing", async () => {
  const reports = [];
  configure({ onError: (error, info) => reports.push(info.kind) });
  try {
    const gate = deferred();
    const a = action(() => gate.promise, { exclusive: true });
    const runs = [a.run(), a.run(), a.run()];
    gate.reject(new Error("boom"));
    assert.deepEqual(await Promise.all(runs), [undefined, undefined, undefined]);
    assert.deepEqual(reports, ["action"]);
  } finally {
    configure({ onError: null });
  }
});

test("exclusive: reset() releases the lock (an explicit reset may start a new run)", async () => {
  let calls = 0;
  const gate = deferred();
  const a = action(() => (calls++, gate.promise), { exclusive: true });
  a.run();
  a.reset();
  assert.equal(a.pending(), false);
  a.run();
  assert.equal(calls, 2);
  gate.resolve("x");
});

test("exclusive applies in production mode", async () => {
  configure({ dev: false });
  try {
    let calls = 0;
    const gate = deferred();
    const a = action(() => (calls++, gate.promise), { exclusive: true });
    a.run();
    a.run();
    assert.equal(calls, 1);
    gate.resolve();
  } finally {
    configure({ dev: true });
  }
});
