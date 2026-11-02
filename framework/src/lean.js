// lean.js — the same API as index.js, without hydration: mount(…, { hydrate: true }) throws, and
// hydrate.js isn't loaded or bundled (~1 KB gzipped less). For apps that never hydrate
// server-rendered HTML. Bundlers pick it with the "zoijs-no-hydration" export condition (every
// "@zoijs/core" import in the app, so there's one core); an import map points "@zoijs/core" here.
import { createMount } from "./core/mount.js";

export { html } from "./core/html.js";
export const mount = createMount({
  begin() {
    throw new Error('Zoijs: this @zoijs/core build leaves hydration out (the lean entry, "zoijs-no-hydration"); hydrate with the standard entry');
  },
});
export { each } from "./core/each.js";
export { boundary } from "./core/boundary.js";
export { createState } from "./reactivity/state.js";
export { computed } from "./reactivity/computed.js";
export { effect } from "./reactivity/effect.js";
export { configure } from "./reactivity/env.js";
export { onCleanup } from "./reactivity/owner.js";
