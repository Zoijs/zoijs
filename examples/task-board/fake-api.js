// A fake in-memory API for the Task Board demo. No backend, no build — just an
// array and some setTimeout delays so you can see real loading / pending states.
// Swap these functions for real fetch() calls in your own app.

let tasks = [
  { id: 1, title: "Try the Zoijs router", priority: "high", done: true },
  { id: 2, title: "Load tasks with a resource", priority: "normal", done: false },
  { id: 3, title: "Submit a form with an action", priority: "normal", done: false },
  { id: 4, title: "Set the page title with head", priority: "low", done: false },
];
let nextId = 5;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (task) => ({ ...task });

export async function listTasks() {
  await delay(500);
  return tasks.map(clone);
}

export async function getTask(id) {
  await delay(400);
  const task = tasks.find((t) => String(t.id) === String(id));
  if (!task) throw new Error(`Task ${id} was not found.`);
  return clone(task);
}

export async function createTask({ title, priority }) {
  await delay(500);
  const name = String(title || "").trim();
  if (!name) throw new Error("A title is required.");
  const task = { id: nextId++, title: name, priority: priority || "normal", done: false };
  tasks.push(task);
  return clone(task);
}

export async function toggleTask(id) {
  await delay(300);
  const task = tasks.find((t) => String(t.id) === String(id));
  if (!task) throw new Error(`Task ${id} was not found.`);
  task.done = !task.done;
  return clone(task);
}

export async function deleteTask(id) {
  await delay(400);
  tasks = tasks.filter((t) => String(t.id) !== String(id));
  return id;
}
