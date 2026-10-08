<div align="center">

# @zoijs/testing

**Tiny first-party testing helpers for [Zoijs](https://zoijs.dev).** Drive the real
DOM — no custom renderer, no virtual snapshots, no build step.

</div>

---

`@zoijs/testing` mounts your real component, lets you query the real DOM and fire
real events, and resolves Zoijs's microtask-batched updates for you. It works with
any test runner (`node:test`, Vitest) and any DOM (jsdom, happy-dom, a real
browser), and depends only on `@zoijs/core`.

## Install

```bash
npm i -D @zoijs/testing
```

You also need a DOM in your test environment — e.g. jsdom (`node --test --import
./setup-dom.js`) or Vitest's `environment: "jsdom"`.

## Use it

```js
import test from "node:test";
import assert from "node:assert/strict";
import { render, fireEvent, cleanup } from "@zoijs/testing";
import { Counter } from "../src/Counter.js";

test.afterEach(() => cleanup());

test("counts up on click", async () => {
  const { getByRole } = render(Counter);
  const button = getByRole("button");

  await fireEvent.click(button); // dispatches a real event; resolves after the update
  assert.equal(button.textContent.trim(), "count: 1");
});
```

## What you get

| Helper | What it does |
|---|---|
| `render(component, options?)` | Mounts into a fresh container; returns `{ container, unmount, debug, ...queries }`. Tracked for `cleanup()`. |
| `screen` | The same queries, bound to `document.body`. |
| `bindQueries(root)` | Build the full set of `getBy*` / `queryBy*` / `getAllBy*` / `findBy*` queries scoped to any element you pass (what `render` and `screen` are built on). |
| `getBy* / queryBy* / getAllBy* / findBy*` | Find elements by **Text**, **Role** (with `name`), **TestId** (`data-testid`), or **LabelText**. `getBy` throws if none / many; `queryBy` returns `null`; `findBy` retries (async). |
| `fireEvent(el, type, init?)` + `.click/.input/.change/.submit/…` | Dispatch a real DOM event; `await` it to see the batched update. Pass `{ target: { value } }` to set a property first. |
| `waitFor(fn, options?)` | Retry `fn` until it stops throwing (for async data / animations). |
| `tick()` | `await tick()` — yield until Zoijs's reactive flush has run. |
| `cleanup()` | Unmount everything `render` created and remove its containers (use in `afterEach`). |
| `mockRouter(init?)` | A controllable stand-in for an `@zoijs/router` instance (`setPath` / `setQuery`). |

## Philosophy

These helpers wrap the platform; they don't replace it. There's no custom renderer
and no snapshot format that re-implements the DOM — you assert on real nodes with
`textContent`, `getAttribute`, and friends. Learn more at
[zoijs.dev](https://zoijs.dev).

## License

[MIT](LICENSE) © Zoijs contributors
