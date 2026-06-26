// @ts-check
// TypeScript-grade safety with NO build step. This is plain JavaScript the
// browser runs as-is — but `@ts-check` + the shipped `@zoijs/core` types give you
// full type-checking and autocomplete. Run `npm run typecheck` (tsc --noEmit).
import { html, mount, createState, each } from "@zoijs/core";

/** @typedef {{ id: number; text: string; done: boolean }} Todo */

function App() {
  /** @type {import("@zoijs/core").State<Todo[]>} */
  const todos = createState([
    { id: 1, text: "Edit src/app.js", done: false },
    { id: 2, text: "Run npm run typecheck", done: false },
  ]);
  const draft = createState("");
  let nextId = 3;

  /** @param {Event} e */
  const add = (e) => {
    e.preventDefault();
    const text = draft.get().trim();
    if (!text) return;
    todos.set([...todos.get(), { id: nextId++, text, done: false }]);
    draft.set("");
  };

  /** @param {number} id */
  const toggle = (id) =>
    todos.set(todos.get().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  return html`
    <main>
      <h1>{{APP_TITLE}}</h1>
      <p>Typed with <code>@ts-check</code> — no build step. Run <code>npm run typecheck</code>.</p>

      <form onsubmit=${add}>
        <input
          aria-label="New todo"
          placeholder="Add a todo…"
          value=${() => draft.get()}
          oninput=${(/** @type {Event} */ e) =>
            draft.set(/** @type {HTMLInputElement} */ (e.target).value)} />
        <button type="submit">Add</button>
      </form>

      <ul>
        ${each(
          () => todos.get(),
          (t) => t.id,
          (t) => html`
            <li>
              <label>
                <input type="checkbox" checked=${() => t.done} onchange=${() => toggle(t.id)} />
                ${() => t.text}
              </label>
            </li>
          `
        )}
      </ul>
    </main>
  `;
}

mount(App, "#app");
