# @zoijs/ssr

Render [Zoijs](https://zoijs.dev) components to an HTML string — on the server, with
**no DOM and zero dependencies**. Use it for server-side rendering (fast first paint,
SEO) and for static prerendering (build your site to flat HTML). The *same component
code* runs on the server and the client.

```bash
npm i @zoijs/ssr   # peer: @zoijs/core ^1.5.0
```

## Render to a string

```js
import { html, createState } from "@zoijs/core";
import { renderToString } from "@zoijs/ssr";

function App() {
  const name = createState("world");
  return html`<main><h1>Hello, ${() => name.get()}!</h1></main>`;
}

renderToString(App); // → '<main><h1>Hello, world!</h1></main>'
```

Each dynamic value is read **once** (its current value) and serialized. The output is
your component's markup; drop it into an HTML shell and serve it:

```js
import { renderToString } from "@zoijs/ssr";
import { App } from "./App.js";

function page() {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>My app</title></head>
  <body>
    <div id="app">${renderToString(App)}</div>
    <script type="module" src="/client.js"></script>
  </body>
</html>`;
}
```

On the client, the same component takes over the page:

```js
// client.js
import { mount } from "@zoijs/core";
import { App } from "./App.js";

mount(App, "#app");
```

## Static prerendering (SSG)

Because `renderToString` needs no DOM and no server, you can run it at **build time**
to emit flat HTML for each route — no runtime needed at all:

```js
import { writeFileSync } from "node:fs";
import { renderToString } from "@zoijs/ssr";
import { routes } from "./routes.js";

for (const [path, Page] of Object.entries(routes)) {
  writeFileSync(`dist${path}.html`, shell(renderToString(Page)));
}
```

## Safe by the same rules as the client

`@zoijs/ssr` reuses the **exact** security predicates from `@zoijs/core/server`, so
server output and client output make identical decisions — there's no second escaping
implementation to drift:

- **Text is escaped** (`<`, `>`, `&`), so interpolated data can't inject markup.
- **Attribute values are escaped** (`"`, `&`) — no breaking out of a quoted attribute.
- **URL attributes are scheme-checked** (`href`, `src`, …): `javascript:` and other
  dangerous schemes are dropped; `data:` is allowed only for raster images.
- **Event handlers and `ref`s are dropped** — they're wired on the client by `mount`.
- **Unsafe attribute names** (`on*`, `srcdoc`) are refused.

## Scope

`renderToString` covers components built from `html`, `each`, conditionals, nested
templates, and reactive values — i.e. the normal Zoijs view. It does **not** serialize
a raw DOM `Node` returned from a component (there's no DOM on the server; it throws with
a clear message — return `html\`…\`` instead).

### A note on hydration

Today the recommended flow is **server-render for first paint + SEO, then `mount` on
the client** (the client builds its own DOM and takes over). *Seamless* hydration — the
client adopting the server's DOM nodes in place, without re-creating them — needs
hydration-aware bindings in the core renderer, and is a planned future core capability.
See [RFC 0008](https://github.com/Zoijs/zoijs/blob/main/framework/docs/rfcs/0008-ssr.md).

## License

MIT © Zoijs contributors
