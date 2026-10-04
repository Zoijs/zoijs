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

/**
 * Hand an error Zoijs caught/contained to the app's onError hook (realm-wide, every
 * mode). The hook never receives its own failures (logged instead), and an error
 * raised while it runs is logged rather than re-reported — no recursion.
 */
export function reportError(error, info) {
  const hook = rt.onError;
  if (!hook) return;
  if (rt.reporting) return void console.error("Zoijs: error raised inside onError (not re-reported):", error);
  rt.reporting = true;
  try {
    hook(error, info);
  } catch (hookError) {
    console.error("Zoijs: the onError hook threw:", hookError);
  } finally {
    rt.reporting = false;
  }
}

/** @returns {boolean} true in development mode */
export function isDev() {
  return rt.dev;
}
