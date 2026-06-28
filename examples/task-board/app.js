// Task Board — a tiny app that uses the whole Zoijs ecosystem together.
//
//   @zoijs/core      html / mount / each / computed / createState
//   @zoijs/router    pages, links, params, programmatic navigation
//   @zoijs/resource  load tasks (read)
//   @zoijs/action    create / toggle / delete tasks (write)
//   @zoijs/head      per-page <title> and meta description
//
// It's all plain functions returning html — no JSX, no build step, no store, no
// providers. Read it top to bottom.

import { html, mount, each, computed, createState, effect } from "@zoijs/core";
import { createRouter } from "@zoijs/router";
import { resource } from "@zoijs/resource";
import { action } from "@zoijs/action";
import { title, description } from "@zoijs/head";
import * as api from "./fake-api.js";

// ---- pages -------------------------------------------------------------------

function Home() {
  title("Task Board · Built with Zoijs");
  description("A tiny demo app showing the Zoijs ecosystem working together.");
  return html`
    <h1>Task Board</h1>
    <p>
      A small demo built from five optional Zoijs packages — routing, page titles,
      data loading, and form actions — with no build step and no global store.
    </p>
    <p>${router.link("/tasks", "View tasks →")}</p>
  `;
}

function Tasks() {
  title("Tasks · Task Board");
  description("Browse, filter, and manage your tasks.");

  const tasks = resource(() => api.listTasks()); // load (read)
  const remove = action(api.deleteTask); // delete (write)
  const filter = createState("all"); // local UI state: all | active | done

  const all = () => tasks.data() ?? [];
  const total = computed(() => all().length);
  const doneCount = computed(() => all().filter((t) => t.done).length);
  const visible = computed(() => {
    const f = filter.get();
    if (f === "active") return all().filter((t) => !t.done);
    if (f === "done") return all().filter((t) => t.done);
    return all();
  });

  const onDelete = async (id) => {
    await remove.run(id);
    tasks.refresh(); // re-load the list after a successful delete
  };

  const chip = (value, label) =>
    html`<button
      class=${() => (filter.get() === value ? "chip active" : "chip")}
      aria-pressed=${() => (filter.get() === value ? "true" : "false")}
      onclick=${() => filter.set(value)}
    >
      ${label}
    </button>`;

  return html`
    <h1>Tasks</h1>

    ${() => (tasks.loading() ? html`<p class="muted" role="status">Loading tasks…</p>` : null)}
    ${() => (tasks.error() ? html`<p role="alert">${tasks.error().message}</p>` : null)}

    <p class="counts">
      <strong>${() => total.get()}</strong> total ·
      <strong>${() => doneCount.get()}</strong> done
    </p>

    <p class="filters">${chip("all", "All")} ${chip("active", "Active")} ${chip("done", "Done")}</p>

    <ul class="tasks">
      ${each(
        () => visible.get(),
        (t) => t.id,
        (t) => html`<li class=${() => (t.done ? "done" : "")}>
          ${router.link("/tasks/" + t.id, t.title)}
          <span class="badge ${() => t.priority}">${() => t.priority}</span>
          <button class="danger" disabled=${() => remove.pending()} onclick=${() => onDelete(t.id)}>
            Delete
          </button>
        </li>`
      )}
    </ul>

    <p>${router.link("/tasks/new", "+ New task")}</p>
  `;
}

function NewTask() {
  title("New task · Task Board");
  description("Create a new task.");

  const create = action(api.createTask);

  const onSubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const created = await create.run({ title: form.get("title"), priority: form.get("priority") });
    if (created) router.go("/tasks"); // navigate only on success
  };

  return html`
    <h1>New task</h1>
    <form onsubmit=${onSubmit}>
      <label>Title <input name="title" placeholder="What needs doing?" /></label>
      <label>
        Priority
        <select name="priority">
          <option value="low">Low</option>
          <option value="normal" selected>Normal</option>
          <option value="high">High</option>
        </select>
      </label>
      <button disabled=${() => create.pending()}>
        ${() => (create.pending() ? "Creating…" : "Create task")}
      </button>
      ${() => (create.error() ? html`<p role="alert">${create.error().message}</p>` : null)}
    </form>
    <p>${router.link("/tasks", "← Cancel")}</p>
  `;
}

function TaskDetails(params) {
  title("Task " + params.id + " · Task Board");
  description("Task details.");

  const task = resource(() => api.getTask(params.id)); // load one task
  const toggle = action(api.toggleTask);
  const remove = action(api.deleteTask);

  const onToggle = async () => {
    await toggle.run(params.id);
    task.refresh();
  };
  const onDelete = async () => {
    const ok = await remove.run(params.id);
    if (ok != null) router.go("/tasks");
  };

  return html`
    ${() => (task.loading() ? html`<p class="muted" role="status">Loading…</p>` : null)}
    ${() =>
      task.error()
        ? html`<div>
            <p role="alert">${task.error().message}</p>
            ${router.link("/tasks", "← Back to tasks")}
          </div>`
        : null}
    ${() => {
      const t = task.data();
      if (!t) return null;
      return html`
        <h1>${t.title}</h1>
        <p>Priority: <strong>${t.priority}</strong></p>
        <p>Status: <strong>${t.done ? "Done" : "Active"}</strong></p>
        <p class="row">
          <button onclick=${onToggle} disabled=${() => toggle.pending()}>
            ${t.done ? "Mark active" : "Mark done"}
          </button>
          <button class="danger" onclick=${onDelete} disabled=${() => remove.pending()}>
            ${() => (remove.pending() ? "Deleting…" : "Delete")}
          </button>
        </p>
        ${router.link("/tasks", "← Back to tasks")}
      `;
    }}
  `;
}

function About() {
  title("About · Task Board");
  description("About this Zoijs ecosystem demo.");
  return html`
    <h1>About</h1>
    <p>
      This demo uses <code>@zoijs/core</code>, <code>@zoijs/router</code>,
      <code>@zoijs/resource</code>, <code>@zoijs/action</code>, and
      <code>@zoijs/head</code> — each an optional package you add only if you need it.
    </p>
  `;
}

function NotFound() {
  title("Not found · Task Board");
  return html`<h1>Page not found</h1>
    <p>${router.link("/", "Go home")}</p>`;
}

// ---- router + layout ---------------------------------------------------------

const router = createRouter(
  {
    "/": Home,
    "/tasks": Tasks,
    "/tasks/new": NewTask, // static route — wins over "/tasks/:id"
    "/tasks/:id": TaskDetails,
    "/about": About,
    "*": NotFound,
  },
  // This demo is hosted under a sub-path in the repo. With `base`, the route
  // patterns above stay clean ("/", "/tasks") and links/navigation still work.
  { base: "/examples/task-board" }
);

function App() {
  // Move focus to the main region after a client-side navigation so screen-reader
  // and keyboard users land on the new page. Skipped on the very first render.
  let firstPath = true;
  effect(() => {
    router.path();
    if (firstPath) return void (firstPath = false);
    document.getElementById("main")?.focus();
  });

  return html`
    <a class="skip-link" href="#main">Skip to content</a>
    <header>
      <nav aria-label="Primary">
        ${router.link("/", "Home")} ${router.link("/tasks", "Tasks")}
        ${router.link("/tasks/new", "New")} ${router.link("/about", "About")}
      </nav>
    </header>
    <main id="main" tabindex="-1">${router.view()}</main>
  `;
}

mount(App, "#app");
