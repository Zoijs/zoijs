import { html } from "@zoijs/core";

// Child → parent communication: TaskItem owns no state. It reports toggle and
// delete events upward by calling the callbacks the parent passed in.
export function TaskItem({ task, onToggle, onDelete }) {
  return html`
    <li class=${() => (task.done ? "done" : "")}>
      <label>
        <input
          type="checkbox"
          checked=${() => task.done}
          onchange=${() => onToggle(task.id)} />
        <span>${() => task.text}</span>
      </label>
      <button class="delete" title="Delete" onclick=${() => onDelete(task.id)}>✕</button>
    </li>
  `;
}
