# Events

Events use native DOM events — exactly what you already know.

```js
html`<button onclick=${() => count.set(count.get() + 1)}>+1</button>`;
```

`onclick=${handler}` attaches the function with `addEventListener("click", handler)`. The handler is a **real function reference**, never a string — so there's no `eval`, and it's safe.

## Any DOM event

Use `on` + the event name (lowercase):

```js
html`<input oninput=${(e) => text.set(e.target.value)} />`;
html`<input onkeyup=${(e) => { if (e.key === "Enter") submit(); }} />`;
html`<form onsubmit=${(e) => { e.preventDefault(); save(); }}>...</form>`;
html`<div onmouseover=${() => hover.set(true)}>...</div>`;
```

The handler receives the native `Event` object, so `e.target`, `e.preventDefault()`, `e.key`, etc. all work normally.

## Pass a function, don't call it

```js
onclick=${doThing}              // ✅ passes the function
onclick=${() => doThing(id)}    // ✅ wrapper that calls it with an argument
onclick=${doThing()}            // ❌ calls it immediately at render time
```

## Listeners are cleaned up for you

When a component (or a list item) is removed, Zoijs removes its event listeners automatically. You don't manage `removeEventListener`. See [Cleanup](cleanup.md).

## Component-to-parent communication

There's no special event system. Pass a callback down:

```js
function Child({ onDone }) {
  return html`<button onclick=${onDone}>Done</button>`;
}
// parent:
html`${Child({ onDone: () => console.log("done!") })}`;
```

(Components are plain functions, so "props" are just function arguments.)

---

Next: [Computed values](computed.md).
