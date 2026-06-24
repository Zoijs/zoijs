// effect() + untrack() — reactive side effects (used internally by the renderer
// to wire bindings). An effect re-runs when something it read changes; errors it
// throws are contained so other bindings keep working.
//
// Implemented by the shared reactive core (see core.js).

export { effect, untrack } from "./core.js";
