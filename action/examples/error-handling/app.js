// Error handling — a failing action, an alert message, and reset() to dismiss it.

import { html, mount } from "@zoijs/core";
import { action } from "@zoijs/action";
import { fail } from "../fake-api.js";

function FailingSave() {
  const save = action(() => fail("Could not save. Please try again."));

  return html`
    <h1>Error handling</h1>
    <p>
      <button disabled=${() => save.pending()} onclick=${() => save.run()}>
        ${() => (save.pending() ? "Saving…" : "Save (will fail)")}
      </button>
    </p>
    ${() =>
      save.error()
        ? html`<p role="alert">
            ${save.error().message}
            <button onclick=${() => save.reset()}>Dismiss</button>
          </p>`
        : null}
  `;
}

mount(FailingSave, "#app");
