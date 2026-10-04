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
 * Partial update: only the options you pass change. `onError: null` removes the hook.
 * @param {{ dev?: boolean, onError?: ((error: unknown, info: { kind: string, component?: string }) => void) | null }} options
 */
export function configure(options) {
  if (options && typeof options.dev === "boolean") {
    rt.dev = options.dev;
  }
  if (options && (typeof options.onError === "function" || options.onError === null)) {
    rt.onError = options.onError;
  }
}

/** Hand a contained error to the app's onError hook (realm-wide, every mode) — see runtime.report. */
export const reportError = (error, info) => rt.report(error, info);

/** @returns {boolean} true in development mode */
export function isDev() {
  return rt.dev;
}
