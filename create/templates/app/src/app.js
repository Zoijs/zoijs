import { html, mount, createState, computed, each } from "@zoijs/core";
import { Header } from "./components/Header.js";
import { TaskItem } from "./components/TaskItem.js";

// The App owns the task list. Children receive data as arguments (parent → child)
// and report events back through callbacks (child → parent). No store, no context.
function App() {
  const tasks = createState([
    { id: 1, text: "Read the Zoijs docs", done: true },
    { id: 2, text: "Build something small", done: false },
    { id: 3, text: "Share it", done: false },
  ]);
  let nextId = 4;

  // computed: derived, cached, reactive.
  const remaining = computed(() => tasks.get().filter((t) => !t.done).length);

  const addTask = (text) => tasks.set([...tasks.get(), { id: nextId++, text, done: false }]);
  const toggle = (id) => tasks.set(tasks.get().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) => tasks.set(tasks.get().filter((t) => t.id !== id));

  const draft = createState("");
  const onSubmit = (e) => {
    e.preventDefault();
    const text = draft.get().trim();
    if (!text) return;
    addTask(text);
    draft.set("");
  };

  return html`
    <main>
      ${/* parent → child: pass plain data (title) and a reader (remaining) down */ ""}
      ${Header({ title: "{{APP_TITLE}}", remaining: () => remaining.get() })}

      <form onsubmit=${onSubmit}>
        <input
          placeholder="Add a task…"
          value=${() => draft.get()}
          oninput=${(e) => draft.set(e.target.value)} />
        <button type="submit">Add</button>
      </form>

      <ul class="tasks">
        ${each(
          () => tasks.get(),
          (t) => t.id,
          (t) => TaskItem({ task: t, onToggle: toggle, onDelete: remove })
        )}
      </ul>
    </main>
  `;
}

mount(App, "#app");
