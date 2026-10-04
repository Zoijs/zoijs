# @zoijs/devtools

A reactive-graph inspector for [Zoijs](https://zoijs.dev). It reveals the one idea
the whole framework is built on — **fine-grained reactivity** — by letting you
watch a single `state.set(...)` wake exactly one effect and update exactly one DOM
node. No Virtual DOM, no diff, and so no time-travel or render replay: there is no
re-render to replay. The panel just shows the live graph as it actually is.

```bash
npm i -D @zoijs/devtools   # needs @zoijs/core ^1.4.0
```

```js
import { inspect } from "@zoijs/devtools";

inspect(); // floating panel, bottom-right
```

That's it. A small panel docks in the corner and lists every **state**, **computed**,
and **effect** in your app. Change something and watch a node flash; hover a binding
to **outline the one DOM node it updates**.

## What you see

- **Every node**, colour-coded: `S` state · `C` computed · `E` effect.
- **The value** of each state/computed (truncated), and a **run/write counter**.
- **A live flash** on the node that just ran or changed — the proof that one update
  touches one place.
- **The DOM target** of each binding effect (`<button> text`, `<a href=…>`). Hover a
  row and that element is outlined on the page.

```js
inspect({ corner: "bottom-left" }); // dock on the left
const panel = inspect();
panel.close(); // detach + remove
```

## Headless model

`inspect()` is a thin panel over `createInspector()`. Use the model directly to
build a custom UI, drive a browser extension, or assert on the graph in a test:

```js
import { createInspector } from "@zoijs/devtools";

const ins = createInspector().attach();

ins.subscribe((change) => {
  // change.type: "create" | "run" | "write" | "dispose"
});

const stats = ins.model.stats();          // { states, computeds, effects, runs, … }
const [node] = ins.model.nodes();          // records in creation order
ins.model.observers(node);                 // who depends on this node
ins.model.sources(node);                   // what this node reads

ins.detach(); // stop observing
```

## How it stays honest

- **Dev-only.** It rides the core's inspection hook, which is a no-op under
  `configure({ dev: false })`. Shipping in production mode means nothing attaches
  and nothing is exposed.
- **Read-only.** It only *observes* the graph — it never mutates a node or a value.
- **Non-perturbing.** The panel is built from plain DOM, not Zoijs reactivity, so it
  doesn't add nodes to the graph it's inspecting. And the core hook never instruments
  reads (`.get()`), so watching costs nothing on the hot path.
- **Zero dependencies.** Like the rest of Zoijs, it depends only on `@zoijs/core`.

See [RFC 0005](https://github.com/Zoijs/zoijs/blob/main/framework/docs/rfcs/0005-devtools-hook.md)
for the design of the underlying hook.

## License

MIT © Zoijs contributors
