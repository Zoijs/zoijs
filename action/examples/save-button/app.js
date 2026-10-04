// Basic save button — pending label, disabled while running, success message.

import { html, mount } from "@zoijs/core";
import { action } from "@zoijs/action";
import { delay } from "../fake-api.js";

function SaveButton() {
  const save = action(() => delay("saved"));

  return html`
    <h1>Save button</h1>
    <p>
      <button disabled=${() => save.pending()} onclick=${() => save.run()}>
        ${() => (save.pending() ? "Saving…" : "Save")}
      </button>
    </p>
    ${() => (save.done() ? html`<p class="ok">Saved successfully.</p>` : null)}
  `;
}

mount(SaveButton, "#app");
