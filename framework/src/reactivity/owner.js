// owner.js — ownership scopes for deterministic cleanup (Task 2).
//
// An owner collects "disposers" — functions that tear down whatever was created
// inside its scope (effects, computeds, event listeners, list-item subtrees).
// Owners nest: disposing a parent disposes its children first. This is how
// unmount() and removed list items free their reactive subscriptions instead of
// leaving them attached to long-lived state.
//
// These are internal helpers (not part of the public API).

import { runtime as rt } from "./runtime.js";
import { reportError } from "./env.js";

/** The active owner, or null outside any scope. */
export function getOwner() {
  return rt.owner;
}

/** Create a scope, nested under the currently active owner. */
export function createOwner() {
  const owner = {
    disposers: [],
    children: new Set(),
    parent: rt.owner,
    disposed: false,
  };
  if (rt.owner) rt.owner.children.add(owner);
  return owner;
}

/** Run `fn` with `owner` active, so things it creates register into `owner`. */
export function runWithOwner(owner, fn) {
  const previous = rt.owner;
  rt.owner = owner;
  try {
    return fn();
  } finally {
    rt.owner = previous;
  }
}

/** Register a cleanup function in the active owner (no-op outside a scope). */
export function onCleanup(fn) {
  if (!rt.owner) return; // no active scope — nothing owns this cleanup
  if (rt.owner.disposed) {
    // Registered into an ALREADY-disposed scope — e.g. an async callback that resolved after its
    // owner was torn down (teardown-races-async-resolution). Pushing would leak it: the disposers
    // array has already been drained and will never run again. Tear the resource down now instead.
    try {
      fn();
    } catch (err) {
      console.error("Zoijs: a cleanup handler threw:", err);
      reportError(err, { kind: "cleanup" });
    }
    return;
  }
  rt.owner.disposers.push(fn);
}

/** Dispose a scope: tear down child scopes first, then run its disposers. */
export function disposeOwner(owner) {
  if (owner.disposed) return;
  owner.disposed = true;
  for (const child of [...owner.children]) disposeOwner(child);
  owner.children.clear();
  for (let i = owner.disposers.length - 1; i >= 0; i--) {
    try {
      owner.disposers[i]();
    } catch (err) {
      console.error("Zoijs: a cleanup handler threw:", err);
      reportError(err, { kind: "cleanup" });
    }
  }
  owner.disposers.length = 0;
  if (owner.parent) owner.parent.children.delete(owner);
}
