// Form submission — read FormData in the action, show pending / error / success.

import { html, mount } from "@zoijs/core";
import { action } from "@zoijs/action";
import { delay, fail } from "../fake-api.js";

function UserForm() {
  const save = action((formData) => {
    const name = String(formData.get("name") || "").trim();
    if (!name) return fail("Please enter a name."); // a thrown/rejected error → error()
    return delay({ name });
  });

  return html`
    <h1>Form submission</h1>
    <form
      onsubmit=${(e) => {
        e.preventDefault();
        save.run(new FormData(e.currentTarget));
      }}
    >
      <input name="name" placeholder="Your name" />
      <button disabled=${() => save.pending()}>
        ${() => (save.pending() ? "Saving…" : "Save")}
      </button>
      ${() => (save.error() ? html`<p role="alert">${save.error().message}</p>` : null)}
      ${() => (save.done() ? html`<p class="ok">Saved ${save.result().name}.</p>` : null)}
    </form>
  `;
}

mount(UserForm, "#app");
