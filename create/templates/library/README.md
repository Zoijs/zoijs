# {{APP_NAME}}

A small library built on [Zoijs](https://zoijs.dev) — plain JavaScript, types
shipped as `.d.ts`, **no build step.**

This is the same shape the official optional packages (`@zoijs/forms`,
`@zoijs/storage`, …) use: one tiny module that imports **only** the core's public
API, with hand-written type definitions and a test suite.

## Develop

```bash
npm install
npm test            # behavior (node --test)
npm run test:types  # type-check src against the .d.ts (tsc --noEmit)
```

There's nothing to compile — consumers import your `src/index.js` directly via an
import map or a bundler of their choosing.

## Layout

```
{{APP_NAME}}/
  package.json        name, exports, types, peer dep on @zoijs/core
  tsconfig.json       strict, checkJs, noEmit (type-check only)
  src/
    index.js          your library (imports only @zoijs/core's public API)
    index.d.ts        hand-written types (imports core types so they never drift)
  tests/
    index.test.js     node:test
```

## What's inside

`src/index.js` ships one example helper — `counter(initial)` — to show the
pattern: a factory that returns reader methods plus the raw reactive cell.
**Replace it with your own.** Keep the package small and single-purpose; depend
only on `@zoijs/core`.

## Publishing

```bash
npm publish --access public
```

Add a `LICENSE`, fill in the `description`/`keywords` in `package.json`, and you're
done. Learn more at [zoijs.dev](https://zoijs.dev).
