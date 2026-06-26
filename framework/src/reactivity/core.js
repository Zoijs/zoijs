// core.js — the reactive graph: states, computeds, effects.
//
// One unified push-pull algorithm (CLEAN / CHECK / DIRTY) gives value-gated,
// lazy, cached updates:
//
//   - A write marks observers DIRTY and their observers CHECK ("maybe dirty"),
//     and enqueues affected effects (batched on a microtask).
//   - On run, an effect/computed PULLS its sources: it only recomputes if a
//     source is actually DIRTY. A computed that recomputes to the SAME value
//     does not wake its observers — that is the value gating (Task 1).
//
// Nodes:
//   state    { value, observers, equals, fn:null }
//   computed { value, observers, sources, state, equals, fn, isEffect:false }
//   effect   {        observers, sources, state,         fn, isEffect:true  }

import { onCleanup } from "./owner.js";
import { isDev } from "./env.js";
import { reportCreate, reportRun, reportWrite, reportDispose } from "./devtools.js";

const CLEAN = 0;
const CHECK = 1;
const DIRTY = 2;

let currentObserver = null;

// ---- batching scheduler -----------------------------------------------------

const queue = new Set();
let scheduled = false;
const RUNAWAY_LIMIT = 100;

function enqueue(node) {
  queue.add(node);
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
}

/** Run all queued effects (and anything they schedule) to completion, in order. */
export function flush() {
  scheduled = false;
  const runCounts = new Map();
  while (queue.size) {
    const nodes = [...queue];
    queue.clear();
    for (const node of nodes) {
      const count = (runCounts.get(node) || 0) + 1;
      runCounts.set(node, count);
      if (count === RUNAWAY_LIMIT && isDev()) {
        console.warn(`Zoijs: an effect re-ran ${RUNAWAY_LIMIT}× in one flush — stopping it (possible infinite loop).`, node.fn);
      }
      if (count >= RUNAWAY_LIMIT) continue;
      updateIfNecessary(node);
    }
  }
}

// ---- graph internals --------------------------------------------------------

function readNode(node) {
  if (currentObserver) {
    node.observers.add(currentObserver);
    currentObserver.sources.add(node);
  }
  if (node.fn) updateIfNecessary(node); // computed: make sure it's fresh
  return node.value;
}

function writeNode(node, next) {
  if (node.equals(node.value, next)) return; // equality-gated
  node.value = next;
  reportWrite(node); // devtools: only fires on an actual change (dev + attached)
  for (const observer of [...node.observers]) markStale(observer, DIRTY);
}

function markStale(node, newState) {
  if (node === currentObserver && isDev()) {
    warnOnce(node, "Zoijs: an effect/computed updated state it depends on (self-triggering). Derive with computed() or guard the write.");
  }
  if (node.state < newState) {
    const previous = node.state;
    node.state = newState;
    if (previous === CLEAN) {
      for (const observer of node.observers) markStale(observer, CHECK);
      if (node.isEffect) enqueue(node);
    }
  }
}

function updateIfNecessary(node) {
  if (node.disposed) return;
  if (node.state === CHECK) {
    // "maybe dirty": resolve sources; recompute only if one really changed.
    for (const source of node.sources) {
      if (source.fn) updateIfNecessary(source);
      if (node.state === DIRTY) break;
    }
  }
  if (node.state === DIRTY) runComputation(node);
  node.state = CLEAN;
}

function runComputation(node) {
  if (node.disposed) {
    node.state = CLEAN;
    return;
  }
  if (node.isEffect) runEffectCleanup(node); // per-run teardown before re-running
  cleanupSources(node);
  const previousObserver = currentObserver;
  currentObserver = node;
  let result;
  let threw = false;
  try {
    result = node.fn();
  } catch (err) {
    threw = true;
    // Task 3/5: contain the failure so other bindings keep working.
    console.error("Zoijs: a reactive binding threw (other bindings keep working):", err);
  } finally {
    currentObserver = previousObserver;
  }
  reportRun(node); // devtools: this node actually recomputed (dev + attached)
  if (node.isEffect) {
    // An effect may return a cleanup function (same convention as a ref): it runs
    // before the next run and on dispose. Anything else is ignored.
    if (!threw) node.cleanup = typeof result === "function" ? result : null;
    return;
  }
  if (threw) return;
  if (!node.equals(node.value, result)) {
    node.value = result;
    // Value changed → promote observers (currently CHECK) to DIRTY so they update.
    for (const observer of node.observers) observer.state = DIRTY;
  }
}

function cleanupSources(node) {
  for (const source of node.sources) source.observers.delete(node);
  node.sources.clear();
}

/** Run (and clear) an effect's returned cleanup — before a re-run and on dispose. */
function runEffectCleanup(node) {
  const cleanup = node.cleanup;
  if (!cleanup) return;
  node.cleanup = null;
  try {
    cleanup();
  } catch (err) {
    console.error("Zoijs: an effect cleanup threw (other bindings keep working):", err);
  }
}

function disposeNode(node) {
  if (node.disposed) return;
  node.disposed = true;
  cleanupSources(node);
  if (node.isEffect) runEffectCleanup(node); // final cleanup on dispose
  reportDispose(node); // devtools: node left the graph (dev + attached)
}

const warned = new WeakSet();
function warnOnce(node, message) {
  if (warned.has(node)) return;
  warned.add(node);
  console.warn(message, node.fn);
}

// ---- public primitives ------------------------------------------------------

export function createState(initial, equals = Object.is) {
  const node = { value: initial, observers: new Set(), equals, fn: null };
  reportCreate(node, "state");
  return {
    get: () => readNode(node),
    set: (next) => writeNode(node, next),
    peek: () => node.value,
  };
}

export function computed(fn, equals = Object.is) {
  const node = {
    fn,
    value: undefined,
    observers: new Set(),
    sources: new Set(),
    state: DIRTY,
    isEffect: false,
    disposed: false,
    equals,
  };
  onCleanup(() => disposeNode(node)); // disposed with its owner scope
  reportCreate(node, "computed");
  return {
    get: () => readNode(node),
    peek: () => {
      updateIfNecessary(node);
      return node.value;
    },
  };
}

export function effect(fn) {
  const node = {
    fn,
    observers: new Set(),
    sources: new Set(),
    state: DIRTY,
    isEffect: true,
    disposed: false,
    equals: Object.is,
    cleanup: null,
  };
  onCleanup(() => disposeNode(node)); // disposed with its owner scope
  reportCreate(node, "effect"); // before its first run, so the run is attributed
  runComputation(node);
  node.state = CLEAN;
  return { dispose: () => disposeNode(node) };
}

/** Run `fn` without subscribing the current observer to what it reads. */
export function untrack(fn) {
  const previous = currentObserver;
  currentObserver = null;
  try {
    return fn();
  } finally {
    currentObserver = previous;
  }
}
