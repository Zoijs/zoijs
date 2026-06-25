import { html, mount, createState, computed, each } from "@zoijs/core";
import { Header } from "./components/Header.js";
import { StatCard } from "./components/StatCard.js";
import { TaskItem } from "./components/TaskItem.js";

// The App owns all the state. Child components receive data as arguments
// (parent -> child) and report events back through callbacks (child -> parent).
// No store, no context, no providers — just functions and reactive values.
function App() {
  // --- state -----------------------------------------------------------------
  const tasks = createState([
    { id: 1, text: "Read the Zoijs guide", done: true },
    { id: 2, text: "Scaffold a project", done: true },
    { id: 3, text: "Design the dashboard", done: false },
    { id: 4, text: "Ship something small", done: false },
  ]);
  const filter = createState("all"); // "all" | "active" | "done"
  const draft = createState("");
  let nextId = 5;

  // --- derived values (computed: cached + reactive) --------------------------
  const total = computed(() => tasks.get().length);
  const completed = computed(() => tasks.get().filter((t) => t.done).length);
  const active = computed(() => total.get() - completed.get());
  const visible = computed(() => {
    const f = filter.get();
    return tasks.get().filter((t) => (f === "all" ? true : f === "done" ? t.done : !t.done));
  });

  // --- actions ---------------------------------------------------------------
  const addTask = (e) => {
    e.preventDefault();
    const text = draft.get().trim();
    if (!text) return;
    tasks.set([...tasks.get(), { id: nextId++, text, done: false }]);
    draft.set("");
  };
  const toggle = (id) => tasks.set(tasks.get().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id) => tasks.set(tasks.get().filter((t) => t.id !== id));

  const filterChip = (value, label) => html`
    <button
      class=${() => "chip" + (filter.get() === value ? " chip-on" : "")}
      onclick=${() => filter.set(value)}>
      ${label}
    </button>
  `;

  return html`
    <div class="app">
      ${Header({ completed: () => completed.get(), total: () => total.get() })}

      <section class="stats">
        ${StatCard({ label: "Total", value: () => total.get(), accent: "indigo" })}
        ${StatCard({ label: "Completed", value: () => completed.get(), accent: "green" })}
        ${StatCard({ label: "Active", value: () => active.get(), accent: "amber" })}
        ${StatCard({ label: "Filter", value: () => filter.get(), accent: "slate" })}
      </section>

      <section class="panel">
        <form class="add" onsubmit=${addTask}>
          <input
            aria-label="Add a task"
            placeholder="Add a task…"
            value=${() => draft.get()}
            oninput=${(e) => draft.set(e.target.value)} />
          <button type="submit">Add</button>
        </form>

        <div class="filters" role="group" aria-label="Filter tasks">
          ${filterChip("all", "All")}
          ${filterChip("active", "Active")}
          ${filterChip("done", "Done")}
        </div>

        <ul class="tasks">
          ${each(
            () => visible.get(),
            (t) => t.id,
            (t) => TaskItem({ task: t, onToggle: toggle, onDelete: remove })
          )}
        </ul>

        ${() =>
          visible.get().length === 0
            ? html`<p class="empty">Nothing here yet — add a task above. ✨</p>`
            : null}
      </section>

      <footer class="hint">
        <p>This starter uses <code>html()</code>, <code>createState()</code>, <code>computed()</code>, and <code>each()</code>.</p>
        <p>Open <code>src/app.js</code> to start editing.</p>
      </footer>
    </div>
  `;
}

mount(App, "#app");
