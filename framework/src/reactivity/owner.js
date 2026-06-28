// owner.js — ownership scopes for deterministic cleanup (Task 2).
//
// An owner collects "disposers" — functions that tear down whatever was created
// inside its scope (effects, computeds, event listeners, list-item subtrees).
// Owners nest: disposing a parent disposes its children first. This is how
// unmount() and removed list items free their reactive subscriptions instead of
// leaving them attached to long-lived state.
//
// These are internal helpers (not part of the public API).

let currentOwner = null;

/** The active owner, or null outside any scope. */
export function getOwner() {
  return currentOwner;
}

/** Create a scope, nested under the currently active owner. */
export function createOwner() {
  const owner = {
    disposers: [],
    children: new Set(),
    parent: currentOwner,
    disposed: false,
  };
  if (currentOwner) currentOwner.children.add(owner);
  return owner;
}

/** Run `fn` with `owner` active, so things it creates register into `owner`. */
export function runWithOwner(owner, fn) {
  const previous = currentOwner;
  currentOwner = owner;
  try {
    return fn();
  } finally {
    currentOwner = previous;
  }
}

/** Register a cleanup function in the active owner (no-op outside a scope). */
export function onCleanup(fn) {
  if (currentOwner) currentOwner.disposers.push(fn);
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
    }
  }
  owner.disposers.length = 0;
  if (owner.parent) owner.parent.children.delete(owner);
}
