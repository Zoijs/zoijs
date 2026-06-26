# Installation

Zoijs has **no build step**. You need a browser and a way to serve files over `http://` (ES modules don't load from `file://`). Pick whichever option fits.

## Option 1 — CDN (zero install)

The fastest way to try Zoijs — import straight from a CDN in a module script:

```html
<!DOCTYPE html>
<html>
  <body>
    <div id="app"></div>
    <script type="module">
      import { html, mount, createState } from "https://esm.sh/@zoijs/core";
      // your app here
    </script>
  </body>
</html>
```

Pin a version for production: `https://esm.sh/@zoijs/core@1`.

## Option 2 — npm + import map

Install the package and map the specifier `@zoijs/core` to it — still no build step:

```bash
npm install @zoijs/core
```

```html
<script type="importmap">
  { "imports": { "@zoijs/core": "/node_modules/@zoijs/core/src/index.js" } }
</script>
<script type="module">
  import { html, mount, createState } from "@zoijs/core";
</script>
```

If you already use a bundler (Vite, esbuild, etc.), `import { html } from "@zoijs/core"` just works — but Zoijs never *requires* one.

## Option 3 — copy the `src/` folder

Vendoring works too: copy Zoijs's `src/` into your project and import from it.

```js
import { html, mount, createState } from "./vendor/zoijs/index.js";
```

## Running the examples

```bash
git clone https://github.com/Zoijs/zoijs && cd zoijs/framework
npm run dev
# open http://localhost:7310/examples/counter/   ← keep the trailing slash
```

`npm run dev` just serves the folder over http — there's nothing to compile.

> **Why the trailing slash?** Without it, some static servers resolve a relative `./app.js` against the wrong directory and the app won't load. Always use `/examples/counter/`, not `/examples/counter`.

## TypeScript (optional)

Zoijs ships type definitions ([`src/index.d.ts`](../src/index.d.ts)); editors discover them automatically via the package. You get autocomplete and type-checking with **no framework build step**. See the [API Reference](api-reference.md#typescript).

---

Next: **[Your First App »](first-app.md)**
