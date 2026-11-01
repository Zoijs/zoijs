# @zoijs/ssr

Render [Zoijs](https://zoijs.dev) components to an HTML string — on the server, with
**no DOM and zero dependencies**. Use it for server-side rendering (fast first paint,
SEO) and for static prerendering (build your site to flat HTML). The *same component
code* runs on the server and the client.

```bash
npm i @zoijs/ssr   # peer: @zoijs/core ^1.9.0
```

`@zoijs/ssr` 0.5.0 needs `@zoijs/core` 1.9.0 or later for its server-side URL and opener guards.

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

> **No-build client (import map)?** `@zoijs/ssr` imports `@zoijs/core/server`, so the browser's
> import map needs `@zoijs/core/server` next to `@zoijs/core` and `@zoijs/ssr` (same core version).
> In the Zoijs repo, `node scripts/cdn-importmap.mjs @zoijs/core@<v> @zoijs/ssr@<v>` generates the
> exact, integrity-pinned map including it.

`hydrate()` runs the component and **adopts** the existing elements inside the target:
they're reused exactly (same nodes, never re-created), and their event handlers and
reactive attributes are attached in place — including inside conditionals, nested
templates and `each()` lists *(next release)*, so a field the user already typed in, ticked
or focused keeps its value, focus and selection. It returns an `unmount()`, like `mount`.

> Not hydrating (pure static output / SSG)? Omit `{ hydratable: true }` for clean,
> marker-free HTML, and take over with a plain `mount(App, "#app")`.

## Passing data to the client (`serialize`)

`renderToString` is synchronous, so a [`@zoijs/resource`](https://zoijs.dev/resource)
renders its loading state on the server. To skip the client-side refetch (and the
flash), render with the data you already fetched, then hand it to the client with
**`serialize`** — a JSON serializer whose output is safe inside a `<script>` element (it
escapes `<`, `>`, `&`, and the U+2028/U+2029 line terminators, so a `</script>` in your data
can't break out):

```js
import { renderToString, serialize } from "@zoijs/ssr";

// server: fetch, render with the value, embed it in a JSON data block
const data = { user: await getUser() };
const body = renderToString(() => App(data), { hydratable: true });
res.end(`<script type="application/json" id="app-data">${serialize(data)}</script>
  <div id="app">${body}</div>
  <script type="module" src="/client.js"></script>`);
```

```js
// client: read it, then seed the resource — it starts settled and does NOT refetch
import { resource } from "@zoijs/resource";
const data = JSON.parse(document.getElementById("app-data").textContent);
const user = resource(() => fetch("/api/user").then((r) => r.json()),
                      { initial: data.user });
```

**Where the output may go.** `serialize()` output is for the body of a `<script>` element,
as above. It escapes `<`, `>`, `&`, U+2028 and U+2029 — not quotes — so do not move the
string into HTML attributes, raw HTML, URLs, `<style>` blocks, or any other context.

A `type="application/json"` block isn't executed, so it needs nothing from a strict
Content-Security-Policy. The executable form — `<script>window.__DATA__ = ${serialize(data)}</script>` —
is equally safe to embed, but as an inline script it needs a per-request CSP nonce. Put the
data block before any user content: `@zoijs/sanitize` already namespaces ids in sanitized
content (so it can't claim `app-data` or `__DATA__`), but that complements safe serialization
rather than replacing it. See [`serialize()`](https://zoijs.dev/production-security#8-embed-serialize-output-only-in-a-script-body)
in the production security checklist.

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
- Bound `srcset`/`imagesrcset` candidates, meta-refresh
  `content` and SVG `<animate>`/`<set>` values are URL-checked; a bound `<base>` is refused;
  `target="_blank"` links are emitted with `rel="noopener noreferrer"`.

### `unsafeHTML()` on the server

`unsafeHTML()` from `@zoijs/core/unsafe` is the one output `renderToString`
doesn't escape: the markup is written into the response **verbatim**, and none of the guards
above apply to it. That includes `<script>` — inert when `unsafeHTML()` inserts markup on the
client, but **executed when the browser loads server-rendered HTML**.

> Trusted raw HTML used during SSR may contain executable markup. `unsafeHTML()` means
> exactly what it says; do not pass content you would not be willing to emit directly into the
> response.

## Scope

`renderToString` covers components built from `html`, `each`, conditionals, nested
templates, and reactive values — i.e. the normal Zoijs view. It does **not** serialize
a raw DOM `Node` returned from a component (there's no DOM on the server; it throws with
a clear message — return `html\`…\`` instead).

### How hydration works

`hydrate()` adopts the server DOM **in place**: every template — the outermost one, nested
and conditional templates, each `each()` item and each array entry — is matched against the
server HTML and, if it matches, its nodes are reused and its events and reactive bindings
attach to them. Nothing is re-created, so there's no flash, and what the user did before the
script arrived survives: typed text, ticked boxes, the selected option, focus and the text
selection. *(next release; earlier cores adopt only the outermost template and re-render
everything dynamic inside it.)*

A form control the user already changed keeps the user's value: its bound `value` / `checked`
is not written on hydration. **Caveat:** the app's state still holds the server value until the
next `input` event, and if that state changes for another reason first, the binding writes it and
replaces the user's edit. If that can happen in your app, read the field's value into state after
`hydrate()` returns. (Reconciling edited controls into state automatically is planned.)

#### When the server HTML doesn't match *(next release)*

Hydration never crashes on a mismatch and never leaves the page silently static. Each template
is checked **before** anything is bound to it, so the parts that don't match are rendered on the
client in place, once, with no duplicate nodes or listeners, while everything else stays adopted:

| What differs | What happens |
|---|---|
| Nothing | Adopted; `status: "hydrated"` |
| Text inside a `${…}` slot | The same text node is kept and takes the client's text |
| A bound attribute (`title=${…}`) | The element is adopted; the binding writes the client's value (not counted as a mismatch) |
| Static structure of a template: a missing, extra or different element, different static text or a static attribute | That template (and only it) is rendered on the client |
| A list's item count, or anything between its items | That list is rendered on the client; items that match on their own are still adopted when the count matches |
| Hydration markers missing, incomplete or malformed (e.g. HTML rendered without `{ hydratable: true }`) | Rendered on the client — the whole target if the outermost template has none |
| `unsafeHTML()` content or a raw DOM node | Always the client's own nodes (it can't be compared) |

Whitespace-only text and plain comments are not compared, so indentation around the server
HTML never forces a re-render. Errors thrown by your components still propagate as usual —
only *mismatches* are recovered.

The returned `unmount()` carries the outcome, so you can log or alert on it:

```js
const unmount = hydrate(App, "#app");
// { status: "hydrated" | "recovered" | "client-rendered", mismatches: number }
if (unmount.hydration.status !== "hydrated") report(unmount.hydration);
```

In development, each recovery also logs one console warning naming the kind of difference and
the parent element (never the values). In production nothing is logged.

**Compatibility.** The markers for nested templates and list items use their own names, so
HTML from this release still hydrates with an older `@zoijs/core` (which adopts the outermost
template and re-renders the rest, as before), and HTML from an older `@zoijs/ssr` hydrates
with the new core (nested parts are reported as missing markers and rendered on the client).
Hydratable HTML is larger before compression (every dynamic region is bracketed by comments);
gzipped, a 200-row list grew about 6%. See
[RFC 0008](https://github.com/Zoijs/zoijs/blob/main/framework/docs/rfcs/0008-ssr.md).

## License

MIT © Zoijs contributors
