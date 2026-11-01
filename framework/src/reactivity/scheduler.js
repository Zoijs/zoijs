// flush() — force the batched effect queue to run now (used by tests and by code
// that needs a synchronous DOM update before measuring). Updates normally flush
// automatically on a microtask.
//
// Implemented by the shared reactive core (see core.js).

export { flush } from "./core.js";
