# Zoijs benchmarks

Reproducible performance numbers for `@zoijs/core`. Tooling only — not published.

```bash
npm run bench        # size + DOM micro-benchmarks (from the repo root)
npm run bench:size   # gzipped-size budget check (also runs inside `npm test`)
```

## Shipped size

Zoijs has **no build step** — the published package *is* its source, so the gzipped
size of `framework/src/**/*.js` (client-reachable files, including opt-in entries like
`unsafe.js`; the server-only `server.js` is excluded) is what a browser can fetch from a
gzip/brotli CDN. `npm run bench:size` prints the current numbers.

Phase 1 currently tracks **commented source size**: about **25.9 KB gzipped
(26,498 B as of this writing) against a temporary 26.5 KB (27,136 B) budget**, enforced by `npm test`
(`bench/size.mjs --check`). That is **not** a production payload figure — the source
ships with its comments, and a page only loads the modules it imports. The budget was
raised deliberately through Phase 1 for reviewed security and correctness fixes (the
history is in `bench/size.mjs`); it is not license for unchecked growth.
Production/minified distribution budgets are defined in PERF-2, which has not run yet,
so there is no final minified production size to quote.

> Historical: before the Phase 1 hardening the core measured ~13.3 KB gzipped (1.0) and ~18.1 KB (August 2026), against budgets of 16–20 KB.

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
