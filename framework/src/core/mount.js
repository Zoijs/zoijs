// mount.js — mount(), the single entry point that starts an app.
//
// Runs the component once inside a root owner scope, inserts its DOM, and returns
// an unmount() that disposes that scope (every effect, computed, list item, and
// event listener created under it) and detaches the DOM.
//
// createMount(hydrator): index.js passes hydrate.js's hydrator; the lean entries (lean.js) pass one
// that refuses, so hydrate.js never reaches their module graph or bundle.

import { render, nsOf } from "./renderer.js";
import { resolveTarget } from "../utils/dom.js";
import { createOwner, runWithOwner, disposeOwner } from "../reactivity/owner.js";

/**
 * @param {Function|object} component  a component function, or an html() result
 * @param {Element|string}  target     a DOM element or a CSS selector
 * @param {{ hydrate?: boolean }} [options]  with `hydrate: true`, adopt the
 *   server-rendered DOM already inside `target` instead of replacing it — the
 *   elements/attributes/events are reused in place (used by @zoijs/ssr's
 *   `hydrate()`). Parts that don't match are rendered on the client instead; the
 *   returned unmount() then carries `hydration: { status, mismatches }` where status is
 *   "hydrated" (all adopted), "recovered" (some parts re-rendered) or "client-rendered"
 *   (nothing usable: the whole target was rendered fresh). unmount() disposes everything.
 * @returns {Function} unmount
 */
export function createMount(hydrator) {
  return function mount(component, target, options) {
    const el = resolveTarget(target);
    const hydrate = !!(options && options.hydrate);
    if (hydrate) hydrator.begin(); // the lean entries' hydrator throws here, before anything is touched
    const owner = createOwner();

    let node;
    let hydration;
    try {
      runWithOwner(owner, () => {
        const result = typeof component === "function" ? component() : component;
        // Hydration binds to el's existing children in place; a fresh mount builds a
        // detached fragment we then swap in.
        node = render(result, hydrate ? { parent: el, before: null, end: null } : undefined, nsOf(el)).node;
      });
    } finally {
      if (hydrate) hydration = hydrator.end();
    }
    if (!hydrate) el.replaceChildren(node);

    const unmount = () => {
      disposeOwner(owner);
      el.replaceChildren();
    };
    if (hydration) unmount.hydration = hydration;
    return unmount;
  };
}
