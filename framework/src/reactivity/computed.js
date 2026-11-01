// computed() — lazy, cached, value-gated derived state.
//
//   const fullName = computed(() => `${first.get()} ${last.get()}`);
//
// Recomputes only when a dependency changed AND only on read. Crucially, if the
// recomputed value is unchanged, subscribers are NOT woken (value gating).
//
// Implemented by the shared reactive core (see core.js).

export { computed } from "./core.js";
