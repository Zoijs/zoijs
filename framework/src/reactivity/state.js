// createState() — the reactive value primitive.
//
//   const count = createState(0);
//   count.get();   // read  (subscribes the running effect/computed)
//   count.set(1);  // write (wakes subscribers, only if the value changed)
//   count.peek();  // read without subscribing
//
// Implemented by the shared reactive core (see core.js).

export { createState } from "./core.js";
