// {{APP_NAME}} — a small library built on @zoijs/core.
//
// Optional Zoijs packages are tiny and import ONLY the core's public API — never
// each other's internals. This example helper does the same; replace it with your
// own. Run `npm test` (behavior) and `npm run test:types` (the .d.ts) as you go.

import { createState } from "@zoijs/core";

/**
 * A reactive counter built on `createState`. A small, illustrative helper showing
 * the shape an optional package takes: a factory that returns reader methods plus
 * the raw reactive cell for advanced use.
 *
 * @param {number} [initial]
 */
export function counter(initial = 0) {
  const state = createState(initial);
  return {
    /** The current value (reactive inside a binding). */
    value: () => state.get(),
    /** Add `by` (default 1). */
    increment: (by = 1) => state.set(state.get() + by),
    /** Subtract `by` (default 1). */
    decrement: (by = 1) => state.set(state.get() - by),
    /** Reset to the initial value. */
    reset: () => state.set(initial),
    /** The underlying reactive cell — advanced / direct access. */
    state,
  };
}
