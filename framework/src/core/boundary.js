// boundary.js — render-time error containment (RFC 0004).
//
// boundary(child, fallback) renders `child`; if it throws SYNCHRONOUSLY while
// building its markup (a setup/render throw that would otherwise break the whole
// mount), the partial work is torn down and `fallback(error)` is rendered instead.
//
// Errors in reactive UPDATES are already contained per-binding by the core; async
// errors belong to @zoijs/resource / @zoijs/action. This catches the one
// remaining case — the synchronous setup/render throw.

import { createOwner, runWithOwner, disposeOwner } from "../reactivity/owner.js";
import { isDev } from "../reactivity/env.js";

/**
 * @template C, F
 * @param {(() => C) | C} child     a component (or value) to render
 * @param {((error: unknown) => F) | F} fallback  a value, or (error) => value, shown if child throws
 * @returns {C | F} the child's result, or the fallback's, for a template slot
 */
export function boundary(child, fallback) {
  // Run setup in a child scope so anything it creates before a throw (notably an
  // effect, which runs immediately) can be disposed — no zombies. On success the
  // scope nests under the surrounding owner and is disposed with it.
  const owner = createOwner();
  try {
    return runWithOwner(owner, () => (typeof child === "function" ? child() : child));
  } catch (err) {
    disposeOwner(owner);
    if (isDev()) {
      console.error("Zoijs: boundary caught an error during render; showing fallback.", err);
    }
    return typeof fallback === "function" ? fallback(err) : fallback;
  }
}
