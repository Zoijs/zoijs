// Regression tests for the reactivity lifecycle fixes (R2 observer-unlink on dispose,
// R3 onCleanup-under-disposed-owner, R4 runaway-effect disposal).

import test from "node:test";
import assert from "node:assert/strict";
import { createState } from "../src/reactivity/state.js";
import { computed } from "../src/reactivity/computed.js";
import { effect } from "../src/reactivity/effect.js";
import { flush } from "../src/reactivity/scheduler.js";
import { createOwner, runWithOwner, disposeOwner, onCleanup } from "../src/reactivity/owner.js";
import { configure } from "../src/reactivity/env.js";

// R3 — a cleanup registered into an already-disposed owner must run NOW (not leak into a
// disposers array that has already been drained and will never run again).
test("onCleanup under a disposed owner runs immediately", () => {
  const owner = createOwner();
  disposeOwner(owner);
  let torn = false;
  runWithOwner(owner, () => onCleanup(() => (torn = true)));
  assert.equal(torn, true);
});

// R2 — disposing a computed's owner severs it in both directions; a dependent effect keeps
// working through its still-live dependencies and nothing crashes.
test("disposing a computed's owner severs it cleanly; dependent effect keeps working", () => {
  const a = createState(1);
  const b = createState(10);
  const child = createOwner();
  let c;
  runWithOwner(child, () => {
    c = computed(() => a.get() * 2);
  });
  let seen;
  effect(() => (seen = c.get() + b.get()));
  flush();
  assert.equal(seen, 12); // 1*2 + 10
  disposeOwner(child); // c is disposed; the effect must not break
  b.set(20);
  flush();
  assert.equal(seen, 22); // c's last value (2) + 20 — no crash, no phantom subscription firing
});

// R4 — a runaway (mutually-triggering) effect loop must be BOUNDED and disposed in every mode
// (not left frozen-DIRTY / not hang the process). Two effects ping-pong: each reads one signal
// and writes the other. Without the guard this never terminates; the test itself hanging would
// be the failure signal.
test("a runaway effect loop is bounded and settles, in the prod path", async () => {
  configure({ dev: false }); // exercise the prod path: the guard must fire without the dev warn
  const a = createState(0);
  const b = createState(0);
  let total = 0;
  effect(() => {
    total++;
    a.get();
    b.set(b.peek() + 1); // reads a, writes b
  });
  effect(() => {
    total++;
    b.get();
    a.set(a.peek() + 1); // reads b, writes a → ping-pong with the first
  });
  await Promise.resolve();
  await Promise.resolve();
  const afterLoop = total;
  assert.ok(afterLoop > 2, `the loop should have run several times before the guard fired, got ${afterLoop}`);
  // Settled: the guard stopped the loop, so a microtask later there is no unbounded churn.
  await Promise.resolve();
  assert.ok(total - afterLoop < 205, `the loop must not keep running unbounded, got ${total - afterLoop}`);
  configure({ dev: true });
});

// R1 — onCleanup inside an effect body is scoped PER RUN: the previous run's cleanup fires
// before the next run (and on dispose), instead of all accumulating on the enclosing owner.
test("onCleanup inside an effect body runs per-run, not just on owner dispose", () => {
  const s = createState(0);
  let cleanups = 0;
  const owner = createOwner();
  runWithOwner(owner, () => {
    effect(() => {
      s.get();
      onCleanup(() => cleanups++);
    });
  });
  flush();
  assert.equal(cleanups, 0); // first run: nothing to clean yet
  s.set(1);
  flush();
  assert.equal(cleanups, 1); // re-run: the first run's cleanup fired first (was 0 before the fix)
  s.set(2);
  flush();
  assert.equal(cleanups, 2);
  disposeOwner(owner);
  assert.equal(cleanups, 3); // dispose fires the last run's cleanup
});

// R1 — a nested effect created inside an effect body is disposed before the outer re-runs, so
// they don't accumulate (each outer run would otherwise leave another live inner effect behind).
test("a nested effect is disposed before its creating effect re-runs (no accumulation)", () => {
  const outer = createState(0);
  const inner = createState(0);
  let innerRuns = 0;
  const owner = createOwner();
  runWithOwner(owner, () => {
    effect(() => {
      outer.get();
      effect(() => {
        inner.get();
        innerRuns++;
      });
    });
  });
  flush();
  outer.set(1); // outer re-runs → creates a 2nd inner effect; the 1st must be disposed
  flush();
  const before = innerRuns;
  inner.set(1);
  flush();
  // Only the ONE live nested effect reacts (+1). Before the fix, N accumulated inner effects
  // would all fire.
  assert.equal(innerRuns - before, 1);
});
