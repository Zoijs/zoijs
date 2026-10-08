# Tutorial: Todo App

**You'll learn:** `each` lists, add/toggle/delete, derived counts, the immutable-update pattern. **Time:** 10 minutes.

```js
import { html, mount, each, createState } from "../src/index.js";

function Todo() {
  const todos = createState([]); // [{ id, text, done }]
  const draft = createState("");

  const add = () => {
    const text = draft.get().trim();
    if (!text) return;
    todos.set([...todos.get(), { id: Date.now(), text, done: false }]);
    draft.set("");
  };
  const toggle = (id) =>
    todos.set(todos.get().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) =>
    todos.set(todos.get().filter((t) => t.id !== id));

  return html`
    <div>
      <input
        value=${() => draft.get()}
        oninput=${(e) => draft.set(e.target.value)}
        onkeyup=${(e) => { if (e.key === "Enter") add(); }} />
      <button onclick=${add}>Add</button>

      <ul>${each(
        () => todos.get(),
        (t) => t.id,
        (todo) => html`
          <li class=${() => (todo.done ? "done" : "")}>
            <input type="checkbox" checked=${() => todo.done} onchange=${() => toggle(todo.id)} />
            <span>${() => todo.text}</span>
            <button onclick=${() => remove(todo.id)}>✕</button>
          </li>`
      )}</ul>

      <p>${() => todos.get().filter((t) => !t.done).length} remaining</p>
    </div>
  `;
}

mount(Todo, document.querySelector("#app"));
```

## Key ideas

1. **The list** uses `each(() => todos.get(), t => t.id, …)`. The key is `t.id` (stable) — never the index.
2. **Immutable updates.** `add`, `toggle`, and `remove` each `set` a **new** array. `toggle` keeps unchanged items' object references (`t` is returned as-is), so only the toggled `<li>` re-renders — the rest of the list isn't touched.
3. **Derived count.** `${() => todos.get().filter(...).length} remaining` updates whenever the list changes. (Pull it into a `computed` if you use it in several places.)
4. **Input clears** after adding because `value=${() => draft.get()}` is bound to the property and `add` sets `draft` to `""`.

## Why keys matter here

Toggle a todo and notice the *other* rows' DOM nodes are reused — Zoijs matched them by key and only updated the one that changed. If you keyed by index instead, reordering or deleting would shuffle state between rows.

## Try it yourself

- Add a "Clear completed" button: `todos.set(todos.get().filter(t => !t.done))`.
- Add filter tabs (All / Active / Done) using a `computed` view of `todos`.
- Persist to `localStorage` (set it inside your handlers; read it for the initial state).

Next: **[Reorderable list »](reorder.md)**
