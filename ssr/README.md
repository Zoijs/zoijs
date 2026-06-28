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

On the client, **hydrate** — adopt the server DOM in place instead of re-creating it.
Render the markup with `{ hydratable: true }` so the client can find and reuse it:

```js
// server
const body = renderToString(App, { hydratable: true });
```

```js
// client.js
import { hydrate } from "@zoijs/ssr";
import { App } from "./App.js";

hydrate(App, "#app"); // reuses the server elements; attaches events + reactivity
```

`hydrate()` runs the component and **adopts** the existing elements inside the target:
they're reused exactly (same nodes, never re-created), and their event handlers and
reactive attributes are attached in place. Each dynamic content region is re-rendered
into that existing structure — and because the values match the server, there's **no
visible change and no flash**. It returns an `unmount()`, like `mount`.

> Not hydrating (pure static output / SSG)? Omit `{ hydratable: true }` for clean,
> marker-free HTML, and take over with a plain `mount(App, "#app")`.

## Passing data to the client (`serialize`)

`renderToString` is synchronous, so a [`@zoijs/resource`](https://zoijs.dev/resource)
renders its loading state on the server. To skip the client-side refetch (and the
flash), render with the data you already fetched, then hand it to the client with
**`serialize`** — a JSON serializer that is safe to embed in a `<script>` (it escapes
`<`, `>`, `&`, and the U+2028/U+2029 line terminators, so a `</script>` in your data
can't break out):

```js
import { renderToString, serialize } from "@zoijs/ssr";

// server: fetch, render with the value, embed it
const data = { user: await getUser() };
const body = renderToString(() => App(data), { hydratable: true });
res.end(`<div id="app">${body}</div>
  <script>window.__DATA__ = ${serialize(data)}</script>
  <script type="module" src="/client.js"></script>`);
```

```js
// client: seed the resource — it starts settled and does NOT refetch
import { resource } from "@zoijs/resource";
const user = resource(() => fetch("/api/user").then((r) => r.json()),
                      { initial: window.__DATA__.user });
```

Because the server rendered with the same value the client seeds with, the markup
matches and hydration is seamless. (Wiring this per-request automatically — loaders —
is a separate, planned step; `serialize` + `{ initial }` are the primitive.)

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

### How hydration works (and its one trade-off)

`hydrate()` adopts the server DOM **in place** — the page's element structure (the
expensive, layout-affecting part) is reused exactly, and events + reactive attributes
attach to those live nodes. Dynamic *content* regions (a text slot, an `each` list, a
nested template) are cleared and re-rendered into that structure; since the values match
the server, this is invisible (no flash). So the static shell is adopted byte-for-byte,
and only dynamic leaves re-render. If the server markup doesn't match what the component
produces, hydration degrades gracefully (that region just isn't made reactive) rather
than corrupting the page. See
[RFC 0008](https://github.com/Zoijs/zoijs/blob/main/framework/docs/rfcs/0008-ssr.md).

## License

MIT © Zoijs contributors
