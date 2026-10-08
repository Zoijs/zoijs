# Coming from Solid

You'll feel at home — Zoijs uses the same **fine-grained, no-Virtual-DOM** reactivity model as Solid (signals, value-gated computeds, "setup runs once"). The big difference: **Zoijs needs no compiler/JSX build step.**

## Concept map

| Solid | Zoijs |
|---|---|
| `createSignal(0)` → `[count, setCount]` | `createState(0)` → `count.get()` / `count.set()` |
| `createMemo(() => ...)` | `computed(() => ...)` |
| `createEffect(() => ...)` | bindings are effects; a public `effect` isn't exposed yet |
| `<For each={items}>{i => ...}</For>` | `each(() => items.get(), i => i.id, i => html\`...\`)` |
| JSX (compiled) | `html\`...\`` tagged template (runtime, no build) |
| `onClick={fn}` | `onclick=${fn}` |
| `onCleanup(fn)` | automatic via [ownership](../concepts/cleanup.md); public hook on the roadmap |

## The key difference: no compiler

Solid compiles JSX into precise DOM operations at build time. Zoijs does the equivalent at runtime with a small template scanner — so there's **no build step**, at the cost of a one-time parse per template (cached).

```jsx
// Solid (JSX, compiled)
function Counter() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
```

```js
// Zoijs (no build)
function Counter() {
  const count = createState(0);
  return html`<button onclick=${() => count.set(count.get() + 1)}>${() => count.get()}</button>`;
}
```

## Things you'll recognize

- **Setup runs once.** No re-render, no stale closures.
- **Value-gated computeds.** A `computed` whose result is unchanged doesn't wake downstream — same as Solid memos.
- **Keyed `each`.** Reuses/moves nodes; preserves DOM state.

## Things that differ

- **Signals are `get()/set()` objects**, not call/set-pair functions. `count()` becomes `count.get()`.
- **Reads in templates need `() =>`.** Where Solid's compiler wraps `{count()}` for you, Zoijs asks you to write `${() => count.get()}`.
- **No `createEffect`/`onCleanup` in the public API yet** — cleanup is automatic via ownership; these may be exposed later.
