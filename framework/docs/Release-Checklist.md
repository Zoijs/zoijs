# Zoijs — Release Readiness Review (internal)

Status snapshot at the **Release Candidate** sprint. Updated after parser hardening, TypeScript definitions, cross-browser automation, security hardening, the documentation site, and RC fixes.

## Public API stability

The surface is small and intended to be stable:

```js
html, mount, createState, computed, each, configure, onCleanup
```

- `createState(value, equals?)` → `{ get, set, peek }`
- `computed(fn, equals?)` → `{ get, peek }`
- `mount(component, target)` → `unmount()`
- `each(itemsFn, keyFn, renderFn)`
- `configure({ dev })`
- `onCleanup(fn)` — teardown for a component or list item

**Status:** ✅ stable, fully typed (`src/index.d.ts`). `onCleanup` was promoted from internal to public this sprint (lifecycle completeness). Owner internals (`createOwner`, `runWithOwner`, `disposeOwner`) remain private. No further breaking changes planned before v1.

## Security posture

- Text → inert `Text` nodes (XSS-safe). URLs → scheme allowlist, control-char-resistant, `data:` raster-images-only. Handlers → functions only (strings ignored). `on*` and `srcdoc` blocked from data. No `eval`. CSP- and **Trusted-Types**-friendly (pass-through `zoijs` policy).
- **Status:** ✅ strong defaults, regression-tested in jsdom **and** real browsers (injected `<script>`/`onerror` proven not to execute on Chromium/Firefox/WebKit). No raw-HTML API. *Remaining:* no formal XSS-corpus fuzz; `srcset`/dynamic-`style` are caller's responsibility.

## Performance status

Fine-grained updates; no Virtual DOM. Keyed `each` reuses/moves nodes. Measured (Chrome, 10k rows): initial render ~70–77 ms; single-item update ~5 ms; reverse/reorder ~8 ms. Stable across the RC sprint (no regression).

- **Status:** ✅ good for typical apps and large lists. Not yet optimized: LIS move-minimization; `each` reconcile is O(list length) per change. Neither is RC-blocking.

## Test status

- **102 jsdom/unit tests** + **54 real-browser tests** (18 × Chromium/Firefox/WebKit) + **TypeScript type tests** — all passing, 0 skipped.
- Covers: reactivity & value-gating, scheduler/batching, computed, owner disposal, `onCleanup`, bindings, attributes (quoted/unquoted/partial/boolean/URL/aria/data/SVG), events, `each` reconciliation (append/prepend/remove/reorder/replace/nested), input/focus preservation, unmount cleanup, conditional rendering, error containment, dev/prod warnings, security regressions, and parser edge cases.
- **Status:** ✅ healthy and broad. *Remaining:* benchmark is manual; no fuzz/property tests; coverage % not measured.

## Browser compatibility

- Verified automatically (Playwright) on **Chromium, Firefox, WebKit**.
- Minimum versions (gated by `replaceChildren`): **Chrome/Edge 86+, Firefox 78+, Safari 14+**. No IE.
- Relies on: ES modules, `<template>`, `TreeWalker`, `Proxy`, `queueMicrotask`, `replaceChildren`, `addEventListener`, `setAttributeNS`.
- **Status:** ✅ documented and tested.

## Documentation

- Structured docs site (`docs/README.md`): 30-minute learning path, per-concept pages, five tutorials, API reference, security guide, troubleshooting, FAQ, five migration guides.
- **Status:** ✅ reflects the current 8-function API and limitations. *Remaining:* not a hosted/interactive site; no screenshots; no recipes section.

## Known limitations (current)

1. `each` reconcile is O(n) per change; no LIS move-minimization.
2. No SSR/hydration; `each` identity relies on stable keys.
3. Errors in bindings are logged, not bounded by an error boundary.
4. Rawtext interpolation (`<textarea>${x}</textarea>`) and dynamic tag/attribute names throw by design.
5. `data:image/svg+xml` fully rejected; `srcset` not scheme-checked; dynamic `style` from untrusted data is the caller's responsibility.
6. Strict Trusted-Types CSP must allow the `zoijs` policy.

## Allowed before v1

- Bug fixes and internal refactors that don't change the public API.
- Performance work (LIS, reconcile tuning) and automated perf thresholds.
- More tests (fuzz/corpus), docs (hosted site, recipes), examples.
- Additive, non-breaking niceties (e.g. a public `effect`, an SVG helper).

## Must wait until after v1 (or a major version)

- Router, SSR, plugin system, global store, CLI — explicitly out of scope.
- JSX or a TypeScript-first authoring model.
- Any breaking change to the public API shape.
- An optional compiler/build step (must stay optional and behavior-identical).

## v1 gate (remaining)

The RC bar is met. To cut **v1.0**: freeze the API formally, add an XSS-corpus fuzz pass, add automated perf thresholds in CI, and (optionally) ship LIS reconciliation. Everything else is post-v1.
