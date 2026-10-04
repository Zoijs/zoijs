// prod.js — the production entry: the same API as index.js, but when this copy
// creates the realm's runtime it starts with dev mode OFF (no dev warnings, no
// devtools hook). A copy joining an existing runtime keeps that runtime's setting.
// Chosen by bundlers' "production" export condition, or explicitly via
// @zoijs/core/prod (import map / CDN). configure({ dev }) still overrides.
import { runtime, created } from "./reactivity/runtime.js";
if (created) runtime.dev = false;
export * from "./index.js";
