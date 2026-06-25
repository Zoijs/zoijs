<div align="center">

# @zoijs/head

**Set the page title and description from a [Zoijs](https://zoijs.dev) component.** Two functions, restore-on-cleanup, no head manager.

[![npm](https://img.shields.io/npm/v/@zoijs/head.svg)](https://www.npmjs.com/package/@zoijs/head)
[![license](https://img.shields.io/npm/l/@zoijs/head.svg)](LICENSE)

[Documentation](https://zoijs.dev) · [Core package](https://www.npmjs.com/package/@zoijs/core)

</div>

---

`@zoijs/head` is an **optional** package. Add it when you want per-page titles
and descriptions. It builds on the core's public API, so the core stays small
and unchanged.

You can learn the whole thing in under 5 minutes.

## Why page titles matter

The `<title>` is what shows in the browser tab, bookmarks, history, and search
results; the meta `description` is the snippet search engines and link previews
show. In a single-page app the page never reloads, so these don't change on
their own — you set them when a page renders. That's all this package does.

## Install

```bash
npm install @zoijs/core @zoijs/head
```

Or with no install, from a CDN:

```js
import { title, description } from "https://esm.sh/@zoijs/head@0.1";
```

## Setting a title

Call `title(...)` inside a component:

```js
import { html, mount } from "@zoijs/core";
import { title } from "@zoijs/head";

function About() {
  title("About | Zoijs App");
  return html`<h1>About</h1>`;
}

mount(About, "#app");
```

When the component unmounts, the previous title is restored — so you never
leave a stale tab title behind.

## Setting a description

```js
import { title, description } from "@zoijs/head";

function About() {
  title("About | Zoijs App");
  description("Learn what this Zoijs app does and who makes it.");
  return html`<h1>About</h1>`;
}
```

`description(...)` finds `<meta name="description">` (creating it if it doesn't
exist) and sets its content. If it created the tag, it removes it on unmount; if
the tag already existed, it restores the old content.

### Any other meta tag

```js
import { meta } from "@zoijs/head";

meta("keywords", "zoijs, frontend, framework");
meta("theme-color", "#0e2a4d");
```

`meta(name, content)` is the same idea for any `name`-based tag. (It only handles
`name="..."` meta tags — not `http-equiv`, on purpose.)

## Usage with the router

It works naturally with [`@zoijs/router`](../router/README.md): give each page
its own title/description and they update as you navigate, because the router
unmounts the old page (reverting its head) before rendering the new one.

```js
function Home() {
  title("Home | Zoijs App");
  description("The friendly no-build framework.");
  return html`<h1>Home</h1>`;
}

function About() {
  title("About | Zoijs App");
  description("Learn more about this app.");
  return html`<h1>About</h1>`;
}

const router = createRouter({ "/": Home, "/about": About });
```

Navigate Home → About and the tab title and description follow along.

## Common mistakes

- **Setting the title at module top level.** Call it *inside* the component so it
  runs on each render and cleans up on unmount. At top level it sets once and
  never reverts.
- **Expecting reactivity.** `title(...)` is a one-time set, not a binding. If your
  title depends on changing state, call it again (e.g. set it from an `effect` in
  your own code) — but most pages just need a single static title.
- **Using it for SEO on a static-HTML crawler.** This sets the head *client-side*.
  For pre-rendered/SSR SEO you need server-rendered tags — out of scope here.

## License

[MIT](LICENSE) © Zoijs contributors
