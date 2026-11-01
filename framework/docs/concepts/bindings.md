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
- **Numbers** and other values are converted with `String()`. An **array or plain object**
  becomes `"a,b"` / `"[object Object]"` — almost always a mistake, so development mode warns.
  Use `style=${{ … }}` (the [object form](../security.md#a-note-on-style)) for styles.
- **`class`** is set as written on the first render; after that a binding adds and removes only
  the class names *it* set, so classes other code adds (a UI library's JS, `el.classList.add`)
  survive updates *(core 1.10.0+; earlier versions rewrote the whole attribute)*. `false`/`null`
  remove the binding's names, and the attribute once nothing is left.
- Name attributes the HTML way. Lit-style prefixes (`.value=`, `?disabled=`, `@click=`) aren't
  supported and throw when the template compiles: `value`/`checked` already use the property,
  booleans use `true`/`false` as above, and events use `onclick=${handler}`.

### Partial and multiple holes work

```js
html`<div class="card ${() => theme.get()} ${() => size.get()}">...</div>`;
html`<a href=${() => base.get()} title="Go to ${() => page.get()}">link</a>`;
```

Static text around a hole is HTML: character references in it are decoded like any attribute
value (`title="Tom &amp; ${() => name.get()}"` → `Tom & Ann`). Values from `${}` are data and are
never decoded.

### Form values use the property

`value` and `checked` are bound to the element **property**, so they reflect correctly even after the user types or clicks:

```js
html`<input value=${() => draft.get()} />`;
html`<input type="checkbox" checked=${() => done.get()} />`;
```

### URLs are checked

URL attributes (`href`, `src`, …), every `srcset` candidate, and meta-refresh URLs reject dangerous
schemes like `javascript:` automatically, `target="_blank"` links get `rel="noopener noreferrer"`,
and `<base>` can't be bound (write it in the source). See [Security](../security.md#urls-are-scheme-validated).

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
| `${() => cond.get() ? Child : null}` | **Live** choice of component — `Child` is set up once per appearance ([details](../faq.md#showing-a-component-conditionally)) |

## SVG

SVG works inside `html`. Dynamic attributes (including `xlink:href`) are handled.

```js
html`<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r=${() => radius.get()} /></svg>`;
```

Anything you insert **inside** an `<svg>` — `each()` items, nested or conditional templates,
components — is parsed as SVG, so lists of shapes and reusable chart parts just work
*(core 1.10.0+; earlier versions needed every SVG element inside one `<svg>` literal)*:

```js
const Bar = (d) => html`<rect x=${d.x} y=${() => 100 - d.value} width="8" height=${() => d.value} />`;

html`<svg viewBox="0 0 100 100" role="img" aria-label="Sales by month">
  <defs>
    <linearGradient id="fill">${each(() => stops.get(), (s) => s.offset, (s) => html`<stop offset=${s.offset} stop-color=${s.color} />`)}</linearGradient>
  </defs>
  <g fill="url(#fill)">${each(() => bars.get(), (d) => d.id, Bar)}</g>
  ${() => (showAverage.get() ? html`<line x1="0" x2="100" y1=${average} y2=${average} stroke="currentColor" />` : null)}
</svg>`;
```

Keyed updates (insert, reorder, remove), attributes — including case-sensitive ones like
`viewBox` — and cleanup behave exactly as in HTML. Content inside `<foreignObject>` is HTML
again, and `mount(App, svgElement)` parses `App` as SVG.

The same goes for **MathML**: content inserted inside `<math>` is MathML, while the text
elements (`<mi>`, `<mo>`, `<mn>`, `<ms>`, `<mtext>`) hold HTML. And `unsafeHTML()` markup placed
inside an `<svg>` or `<math>` is parsed in that namespace. *(core 1.10.0+)*

---

Next: [Events](events.md).
