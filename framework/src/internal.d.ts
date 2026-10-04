// Type surface for `@zoijs/core/internal` — framework plumbing for @zoijs/* packages.
// Not application API; may change in any release.
import type { ZoijsErrorInfo } from "./index.js";

/** Report an error Zoijs (or a @zoijs package) contained to the app's `configure({ onError })` hook. */
export function reportError(error: unknown, info: ZoijsErrorInfo): void;
