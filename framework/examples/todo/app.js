// Todo list — now using each() for keyed list rendering (Milestone 3).
//
// Toggling or deleting one todo reuses every other <li>'s DOM node. Because the
// item is a reactive proxy, the per-item bindings (${() => todo.done} etc.)
// update in place — the list is never rebuilt.

import { html, mount, each, createState } from "../../src/index.js";

function Todo() {
  const todos = createState([]); // [{ id, text, done }]
  const draft = createState("");

  const add = () => {
    const text = draft.get().trim();
    if (!text) return;
    todos.set([...todos.get(), { id: Date.now() + Math.random(), text, done: false }]);
    draft.set("");
  };
  // Note: unchanged items keep their object reference, so only the toggled item
  // re-renders.
  const toggle = (id) =>
    todos.set(todos.get().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) => todos.set(todos.get().filter((t) => t.id !== id));

  return html`
    <div class="todo">
      <h1>Todo List</h1>
      <div class="row">
        <input
          type="text"
          placeholder="What needs doing?"
          value=${() => draft.get()}
          oninput=${(e) => draft.set(e.target.value)}
          onkeyup=${(e) => { if (e.key === "Enter") add(); }} />
        <button onclick=${add}>Add</button>
      </div>
      <ul>${each(
        () => todos.get(),
        (t) => t.id,
        (todo) => html`
          <li class=${() => (todo.done ? "done" : "")}>
            <input type="checkbox" checked=${() => todo.done} onchange=${() => toggle(todo.id)} />
            <span>${() => todo.text}</span>
            <button class="del" onclick=${() => remove(todo.id)}>✕</button>
          </li>`
      )}</ul>
      <p class="count">${() => todos.get().filter((t) => !t.done).length} remaining</p>
    </div>
  `;
}

mount(Todo, document.querySelector("#app"));
