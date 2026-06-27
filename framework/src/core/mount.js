// mount() — the single entry point that starts an app.
//
// Runs the component once inside a root owner scope, inserts its DOM, and returns
// an unmount() that disposes that scope (every effect, computed, list item, and
// event listener created under it) and detaches the DOM.

import { render } from "./renderer.js";
import { resolveTarget } from "../utils/dom.js";
import { createOwner, runWithOwner, disposeOwner } from "../reactivity/owner.js";

/**
 * @param {Function|object} component  a component function, or an html() result
 * @param {Element|string}  target     a DOM element or a CSS selector
 * @param {{ hydrate?: boolean }} [options]  with `hydrate: true`, adopt the
 *   server-rendered DOM already inside `target` instead of replacing it — the
 *   elements/attributes/events are reused in place (used by @zoijs/ssr's
 *   `hydrate()`). The returned unmount() disposes everything either way.
 * @returns {Function} unmount
 */
export function mount(component, target, options) {
  const el = resolveTarget(target);
  const owner = createOwner();
  const hydrate = !!(options && options.hydrate);

  let node;
  runWithOwner(owner, () => {
    const result = typeof component === "function" ? component() : component;
    // Hydration binds to el's existing children in place; a fresh mount builds a
    // detached fragment we then swap in.
    node = render(result, hydrate ? el : undefined).node;
  });
  if (!hydrate) el.replaceChildren(node);

  return () => {
    disposeOwner(owner);
    el.replaceChildren();
  };
}
