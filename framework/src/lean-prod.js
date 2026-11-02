// lean-prod.js — lean.js with production defaults (as prod.js is to index.js).
import { runtime, created } from "./reactivity/runtime.js";
if (created) runtime.dev = false;
export * from "./lean.js";
