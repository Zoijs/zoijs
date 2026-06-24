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
 * @returns {Function} unmount
 */
export function mount(component, target) {
  const el = resolveTarget(target);
  const owner = createOwner();

  let node;
  runWithOwner(owner, () => {
    const result = typeof component === "function" ? component() : component;
    node = render(result).node;
  });
  el.replaceChildren(node);

  return () => {
    disposeOwner(owner);
    el.replaceChildren();
  };
}
