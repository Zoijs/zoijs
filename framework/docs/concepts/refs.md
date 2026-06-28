# Element refs

Sometimes you need the **real DOM element** — to focus an input, scroll to a
spot, measure layout, draw on a `<canvas>`, or hand the node to a third-party
library. Add a **`ref`**: a function that receives the element.

```js
html`<input ref=${(el) => el.focus()} />`;
```

That's the whole feature. `ref` is just a function in an attribute slot — the
same idea as an event handler, except it receives the **element** instead of an
event.

## When the ref runs

The callback runs **once**, right after the surrounding render is inserted into
the page — so the element is already **connected** and `focus()`, `scrollIntoView()`,
and `getBoundingClientRect()` all work. It is **not reactive**: it does not re-run
when state changes (read state with normal `${() => …}` bindings for that).

## Cleanup

If your ref sets something up, return a function to tear it down. That cleanup
runs when the element is unmounted **or** removed from a list — the same
ownership model as [`onCleanup`](cleanup.md) and event listeners.

```js
html`<div ref=${(el) => {
  const chart = makeChart(el);     // set up a third-party widget
  return () => chart.destroy();    // runs on unmount / removal
}}></div>`;
```

## Example: focus an input

```js
import { html, mount } from "@zoijs/core";

function SearchBox() {
  return html`
    <input
      placeholder="Search…"
      ref=${(el) => el.focus()} />
  `;
}

mount(SearchBox, "#app");
```

The input is focused as soon as it appears — no `setTimeout`, no `querySelector`.

## Example: scroll an element into view

```js
import { html, mount, createState } from "@zoijs/core";

function Messages() {
  const messages = createState(["Hi", "Hello", "How are you?"]);

  return html`
    <div class="log">
      ${() => messages.get().map((m) => html`<p>${m}</p>`)}
      <!-- an anchor at the bottom that scrolls itself into view -->
      <div ref=${(el) => el.scrollIntoView({ block: "end" })}></div>
    </div>
  `;
}

mount(Messages, "#app");
```

## Example: draw on a canvas

```js
import { html, mount } from "@zoijs/core";

function Sparkline() {
  return html`
    <canvas width="120" height="40" ref=${(el) => {
      const ctx = el.getContext("2d");
      ctx.strokeStyle = "#4f46e5";
      ctx.beginPath();
      ctx.moveTo(0, 30);
      ctx.lineTo(40, 10);
      ctx.lineTo(80, 24);
      ctx.lineTo(120, 4);
      ctx.stroke();
    }}></canvas>
  `;
}

mount(Sparkline, "#app");
```

## Refs in lists

A `ref` inside [`each`](lists.md) fires **once per item** when that item is
created, and its returned cleanup runs when that specific item is removed — so
per-row widgets are set up and torn down automatically.

```js
each(
  () => rows.get(),
  (r) => r.id,
  (r) => html`<li ref=${(el) => observer.observe(el)}>${() => r.label}</li>`
);
```

## What `ref` is *not*

By design, to stay tiny and un-React-like:

- **No ref objects / `.current`.** A ref is a function. To keep a handle, assign
  it yourself: `ref=${(el) => (myEl = el)}`.
- **Not reactive.** It runs once; it never re-runs on state change.
- **No lifecycle phases or hooks.** Setup is the call; teardown is the returned
  function. That's the entire surface.

## Gotchas

- **Only a function works.** `ref="some string"` or `ref=${"focus()"}` is ignored
  (a dev-mode warning explains why) and never becomes a DOM attribute — so an
  inert string can't accidentally be wired up.
- **Don't expect the element synchronously.** Because the ref is deferred to just
  after insertion, code right after `mount()` runs before the ref does. Put
  element work *inside* the ref.

---

Next: [Cleanup](cleanup.md).
