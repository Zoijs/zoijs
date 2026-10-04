// env.js — development / production mode (Task 4).
//
// Development (the default) shows helpful warnings: duplicate `each` keys,
// self-triggering effects, runaway loops. Production silences them for less
// noise and a touch less work. No build step required — just call configure().
//
//   import { configure } from "@zoijs/core";
//   configure({ dev: false }); // production

import { runtime as rt } from "./runtime.js";

/**
 * @param {{ dev?: boolean }} options
 */
export function configure(options) {
  if (options && typeof options.dev === "boolean") {
    rt.dev = options.dev;
  }
}

/** @returns {boolean} true in development mode */
export function isDev() {
  return rt.dev;
}
