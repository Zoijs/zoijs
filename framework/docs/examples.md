# Examples

All examples live in the [`examples/`](../examples/) folder. Run them with:

```bash
npm run dev
# then open http://localhost:3000/examples/<name>/   (keep the trailing slash)
```

Each example is a single `index.html` + `app.js` + (optional) `style.css`. No build step.

| Example | Purpose | What it teaches | Key concepts |
|---|---|---|---|
| **[counter](../examples/counter/)** | The "hello world" | A function returning `html`, mounting, reactive text | `createState`, [bindings](concepts/bindings.md), [events](concepts/events.md) |
| **[input](../examples/input/)** | Live text input | Reading input events into state; multiple bindings off one value | `createState`, [events](concepts/events.md), [bindings](concepts/bindings.md) |
| **[todo](../examples/todo/)** | A real little app | Lists, add/toggle/delete, derived "remaining" count | `each`, `computed`-style derivation, [events](concepts/events.md) |
| **[computed](../examples/computed/)** | Derived values | `fullName` from two states; `parity` from a number | [`computed`](concepts/computed.md) |
| **[reorder](../examples/reorder/)** | Keyed reconciliation | Reversing/shuffling a list **moves** nodes instead of rebuilding | [`each`](concepts/lists.md) |
| **[input-preservation](../examples/input-preservation/)** | Why keys matter | Typed input value + focus survive a reorder | [`each`](concepts/lists.md) |
| **[benchmark](../examples/benchmark/)** | Performance | Large-list render/update/reorder timings | [`each`](concepts/lists.md) |

## How to read an example

1. Open `index.html` — it's a plain page with a `<div id="app">` and a `<script type="module">`.
2. Open `app.js` — the component(s) and the `mount` call.
3. Tweak something and refresh. No build, instant feedback.

## Suggested order

Start with **counter**, then **input**, then **computed**, then **todo**. By the time you've read those four you've used the entire API. **reorder** and **input-preservation** show *why* keyed lists matter; **benchmark** is for the curious.

---

Tutorials walk through building several of these step by step → **[Tutorials](README.md#tutorials-build-something)**
