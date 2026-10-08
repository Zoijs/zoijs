# Coming from React

Zoijs shares React's component model and immutable-update style, but drops JSX, hooks, the build step, and the Virtual DOM.

## Concept map

| React | Zoijs |
|---|---|
| `function App() { return <jsx/> }` | `function App() { return html\`...\` }` |
| `useState(0)` → `[count, setCount]` | `createState(0)` → `count.get()` / `count.set()` |
| `useMemo(() => ..., deps)` | `computed(() => ...)` (no deps array) |
| `useEffect` | bindings react automatically; for true side-effects, see [Cleanup](../concepts/cleanup.md) |
| `{items.map(i => <li key={i.id}/>)}` | `each(() => items.get(), i => i.id, i => html\`<li/>\`)` |
| re-renders on state change | **no re-render** — setup runs once, nodes update in place |
| `onClick={fn}` | `onclick=${fn}` |

## The biggest mental shift: no re-rendering

In React, your component function re-runs on every state change. In Zoijs it runs **once**. There are no stale closures, no dependency arrays, no `useCallback`/`useMemo` to stabilize references.

```jsx
// React
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

```js
// Zoijs
function Counter() {
  const count = createState(0);
  return html`<button onclick=${() => count.set(count.get() + 1)}>${() => count.get()}</button>`;
}
```

Note the `${() => count.get()}` — because there's no re-render, the arrow function is how Zoijs knows that binding is live.

## Gotchas for React developers

- **Don't expect re-execution.** Code in the component body runs once. Put per-change logic in bindings or computeds, not in the function body.
- **Wrap reactive reads in `() =>`** inside templates. `${count.get()}` would be a one-time snapshot (like reading a ref once).
- **Keys work the same** — stable ids, not indexes.
- **No Context/Redux needed** for shared state — `createState` in a module, imported where needed.

## What you'll miss (for now)

Router, SSR, and a large ecosystem. Zoijs is intentionally small. See the [FAQ](../faq.md).
