# Bindings — text & attributes

A *binding* is a spot in your template that comes from JavaScript. Remember the [one rule](core-concepts.md): wrap it in `() =>` to make it live.

## Text bindings

```js
const name = createState("world");

html`<p>Hello ${() => name.get()}</p>`; // live
html`<p>Hello ${"static text"}</p>`;    // static, set once
```

A live text binding updates the **same text node in place** — no element is recreated.

### Text is always safe

Interpolated text is rendered as **inert text**, never as HTML:

```js
html`<p>${() => userInput.get()}</p>`;
// if userInput is "<img src=x onerror=alert(1)>", it shows as literal text.
// Zoijs does NOT execute it. XSS-safe by default.
```

## Attribute bindings

```js
const cls = createState("box");
const busy = createState(false);

html`<div class=${() => cls.get()}>...</div>`;          // string attribute
html`<button disabled=${() => busy.get()}>Save</button>`; // boolean attribute
```

- **Strings** set the attribute.
- **`true`** sets a present-but-empty boolean attribute (`disabled`).
- **`false` / `null` / `undefined`** remove the attribute entirely.

### Partial and multiple holes work

```js
html`<div class="card ${() => theme.get()} ${() => size.get()}">...</div>`;
html`<a href=${() => base.get()} title="Go to ${() => page.get()}">link</a>`;
```

### Form values use the property

`value` and `checked` are bound to the element **property**, so they reflect correctly even after the user types or clicks:

```js
html`<input value=${() => draft.get()} />`;
html`<input type="checkbox" checked=${() => done.get()} />`;
```

### URLs are checked

URL attributes (`href`, `src`, …) reject dangerous schemes like `javascript:` automatically.

### Reaching the element: `ref`

To get the real DOM element (to focus, scroll, measure, or use a canvas), add a
`ref` — a function that receives the element after render:

```js
html`<input ref=${(el) => el.focus()} />`;
```

It runs once, isn't reactive, and can return a cleanup function. See
[Element refs](refs.md).

## Static vs live — a quick reference

| You write | Behavior |
|---|---|
| `${() => state.get()}` | **Live** — updates on change |
| `${someValue}` | **Static** — set once |
| `attr=${() => state.get()}` | **Live** attribute |
| `attr="constant"` | **Static** attribute |

## SVG

SVG works inside `html` as long as it's wrapped in `<svg>…</svg>`. Dynamic attributes (including `xlink:href`) are handled.

```js
html`<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r=${() => radius.get()} /></svg>`;
```

---

Next: [Events](events.md).
