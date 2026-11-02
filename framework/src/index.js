// Zoijs — public entry point.
//
// Re-exports the entire public API surface for the MVP. Keep this list small:
// the whole framework is meant to be learnable in one sitting.
//
//   import { html, mount, createState } from "@zoijs/core";

export { html } from "./core/html.js";
// mount() with hydration (lean.js builds one without).
import { createMount } from "./core/mount.js";
import { hydrator } from "./core/hydrate.js";
export const mount = createMount(hydrator);
export { each } from "./core/each.js";
export { boundary } from "./core/boundary.js";
export { createState } from "./reactivity/state.js";
export { computed } from "./reactivity/computed.js";
export { effect } from "./reactivity/effect.js";
export { configure } from "./reactivity/env.js";
export { onCleanup } from "./reactivity/owner.js";
