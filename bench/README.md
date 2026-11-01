# Zoijs benchmarks

Reproducible performance numbers for `@zoijs/core`. Tooling only — not published.

```bash
npm run bench        # size + DOM micro-benchmarks (from the repo root)
npm run bench:size   # size budgets (also run inside `npm test`)
```

## Size: what apps ship

`npm run bench:size` measures `@zoijs/core` the two ways an app ships it (PERF-2E), each against its own
budget (`bench/size.mjs --check`, enforced by `npm test` in CI):

| Measure | What it is | Size (2026-11-01) | Budget |
|---|---|---|---|
| **Bundled · whole API** | The core bundled with the `production` export condition (esbuild, as `@zoijs/build` uses), minified, gzipped | 11,242 B | 11.5 KB |
| **Bundled · minimal app** | The same for an app using only `html`, `mount` and `createState` | 10,936 B | 11 KB |
| **Unbundled · production entry** | A no-build app (import map): every module reachable from `src/prod.js`, each gzipped on its own, as a CDN sends them | 35,894 B (19 files) | 36 KB |

The budgets are ceilings, not targets. Raising one needs a reviewed change, with the measurement
and the reason recorded at the top of `bench/size.mjs`.

Also printed, but not budgeted: every client source file (opt-in entries such as `unsafe.js`
included) concatenated and gzipped — **31,080 B**. That was the old, temporary budget (raised step
by step through Phase 1, history in `bench/size.mjs`); it counts commented source files rather than
what an app loads, so splitting a module or adding an opt-in entry grew it even when apps shipped
less.

> Historical: before the Phase 1 hardening the core measured ~13.3 KB gzipped as commented source (1.0) and ~18.1 KB (August 2026).

## DOM micro-benchmarks (jsdom)

These measure the framework's own overhead — keyed reconcile + fine-grained
bindings — on 1,000 rows. jsdom is slower than a real browser, so read the
**shape**, not the absolute ms.

| Operation | Time |
|---|---|
| create 1,000 rows | ~70 ms |
| update all 1,000 labels | ~5 ms |
| **update 1 of 1,000** | **~0.4 ms** |
| swap 2 rows | ~0.5 ms |
| reverse 1,000 rows | ~31 ms |
| clear 1,000 rows | ~17 ms |

The headline: **updating one row of a thousand is ~12× cheaper than updating all,
and ~160× cheaper than creating them.** There is no Virtual DOM diff over the whole
list — only the changed text node is touched. `swap` and single-item moves do the
minimal DOM moves via the `each()` longest-increasing-subsequence pass.

> Absolute numbers are machine-dependent; regenerate with `npm run bench`. The
> deterministic gates are the size budgets (above) and the move-count assertions in
> `framework/tests/lis.test.js`.
