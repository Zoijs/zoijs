# RFC 0011 — A lean core entry without hydration

- Status: **Accepted** — `@zoijs/core` 1.11.0 (2026-11-02); `@zoijs/build` 0.2.0's `hydration: false`
  selects it. Additive; no new export, no change to the default.
- Target: `@zoijs/core` — a `"zoijs-no-hydration"` export condition resolving to new lean entries
  (`src/lean.js`, `src/lean-prod.js`), and an internal refactor that moves every hydration-only
  line into `core/hydrate.js`.
- Affects: apps that opt in ship ~1.07 KB gzipped less (bundled) or ~2.6 KB less (unbundled).
  Apps that don't opt in behave exactly as before.

## 1. Problem statement

Hydration (adopting server-rendered HTML, RFC 0008) lives in core because `mount(…, { hydrate:
true })` is how it starts. That makes every app pay for it — `mount` references it, so no bundler
can drop it — although most Zoijs apps render on the client and never hydrate.

Measured on the production build (esbuild, minified, gzip level 9; `bench/size.mjs`):

| | Standard core | Without hydration | |
|---|---|---|---|
| Bundled, minimal app (`html` + `mount` + `createState`) | 10,936 B | 9,860 B | −1,076 B (−9.8%) |
| Bundled, whole API | 11,242 B | 10,170 B | −1,072 B |
| Unbundled production entry (import map; every module, each gzipped) | 35,894 B | 33,247 B | −2,647 B |

(An earlier estimate of ~1.85 KB counted commented source; this is what ships.)

## 2. Rule of Three

1. **Explainable in under two minutes?** Yes: "If your app never hydrates server HTML, resolve
   `@zoijs/core` with the `zoijs-no-hydration` condition (or map it to `src/lean-prod.js`) and
   ship ~1 KB less. `mount(…, { hydrate: true })` then throws."
2. **Without core changes?** No — hydration's code is woven through the renderer. The change is
   an internal refactor plus an additive entry; the public API (nine functions, every subpath)
   is unchanged.
3. **80–90% of apps benefit?** Most Zoijs apps are client-rendered — they're the ones who opt in.

## 3. Design

**Hydration code in one module.** Everything only hydration uses — matching server DOM to a
template, adopting slots, list items and text, preserving edited form controls — is in
`core/hydrate.js`. The renderer keeps a few short first-run branches that call it through
module-level variables (`setHydration()`), set when a hydrating `mount()` begins.

**Wired through `mount`, not a side effect.** `core/mount.js` exports `createMount(hydrator)`.
`index.js` exports `mount = createMount(hydrator)` with hydrate.js's hydrator; `lean.js` exports
`mount = createMount(refuser)`, whose `begin()` throws an actionable error before anything is
touched. Because the standard `mount` *references* the hydrator, a bundler keeps hydration
exactly when that `mount` is bundled. (An `import "./hydrate.js"` installed as a side effect would
be dropped by bundlers honouring the package's `"sideEffects": false` — silently breaking SSR.)

**Selected by resolution, for the whole app.** Router, head and every other package import
`"@zoijs/core"`, so a separate import path would put two cores in one app. Instead:

```json
".": {
  "types": "./src/index.d.ts",
  "zoijs-no-hydration": { "types": "./src/index.d.ts", "production": "./src/lean-prod.js", "default": "./src/lean.js" },
  "production": "./src/prod.js",
  "default": "./src/index.js"
}
```

Bundlers: add the condition (esbuild `conditions: ["zoijs-no-hydration", "production"]`;
`@zoijs/build`'s `hydration: false`). Import maps: map `"@zoijs/core"` to `…/src/lean-prod.js`.

## 4. Compatibility

- The default and `"production"` resolutions are unchanged: `mount(…, { hydrate: true })` and
  `@zoijs/ssr`'s `hydrate()` work as before. No export is added, removed or changed.
- In a lean build, hydrating throws `Zoijs: this @zoijs/core build leaves hydration out …` before
  touching the target. An app that hydrates must not opt in.
- Cost to apps that don't opt in: the indirection adds **+112 B** bundled (minified + gzip) and
  **+766 B** unbundled (the moved code compresses less well in its own module). Both stay within
  the existing budgets (`bench/size.mjs` records them).

## 5. Out of scope

- Making lean the default (would break `mount({ hydrate: true })` — a 2.0 decision).
- Splitting anything else out of core. Hydration is the one large, optional, self-contained part.

## 6. Alternatives considered

- **`@zoijs/core/lean` as an import path.** Every other package imports `"@zoijs/core"`: two
  cores per app. Rejected.
- **Install hydration as a side effect of importing a module.** Dropped by bundlers under
  `"sideEffects": false`. Rejected (see §3).
- **Do nothing.** ~1 KB gzipped (~10% of a minimal app) for every client-rendered app.

## 7. Decision

**Accepted** (PERF-2D; shipped in core 1.11.0). Landed with budgets for both builds (PERF-2E), unit, SSR and real-browser tests
(the lean entry, unbundled, never requests `hydrate.js`; renders under a strict CSP with
Trusted Types; refuses to hydrate without touching the page).
