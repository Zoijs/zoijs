# Zoijs benchmarks

Reproducible performance numbers for `@zoijs/core`. Tooling only — not published.

```bash
npm run bench        # size + DOM micro-benchmarks (from the repo root)
npm run bench:size   # gzipped-size budget check (also runs inside `npm test`)
```

## Shipped size

Zoijs has **no build step** — the published package *is* its source, so the gzipped
size of `framework/src/**/*.js` is what a browser fetches from a gzip/brotli CDN.

| Metric | Size |
|---|---|
| raw | ~42 KB |
| **gzipped** | **~13.3 KB** |

For comparison, React + ReactDOM is ~45 KB gzipped. `npm test` fails the build if
the core grows past a **16 KB gzipped** budget (`bench/size.mjs --check`).

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
> deterministic gates are the size budget (above) and the move-count assertions in
> `framework/tests/lis.test.js`.
