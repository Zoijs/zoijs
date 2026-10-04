// Delete button — run an action, then update local state on success.

import { html, mount, each, createState } from "@zoijs/core";
import { action } from "@zoijs/action";
import { delay } from "../fake-api.js";

function DeletableList() {
  const items = createState([
    { id: 1, name: "Alpha" },
    { id: 2, name: "Beta" },
    { id: 3, name: "Gamma" },
  ]);

  const remove = action((id) => delay(id));

  const onDelete = async (id) => {
    const deleted = await remove.run(id);
    if (deleted != null) items.set(items.get().filter((i) => i.id !== deleted));
  };

  return html`
    <h1>Delete button</h1>
    <ul>
      ${each(
        () => items.get(),
        (item) => item.id,
        (item) => html`<li>
          <span>${() => item.name}</span>
          <button class="danger" disabled=${() => remove.pending()} onclick=${() => onDelete(item.id)}>
            Delete
          </button>
        </li>`
      )}
    </ul>
    ${() => (items.get().length === 0 ? html`<p>All items deleted.</p>` : null)}
  `;
}

mount(DeletableList, "#app");
