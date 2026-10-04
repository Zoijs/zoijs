// Contact form — uses options.validate + handleSubmit, and a textarea field.

import { html, mount } from "@zoijs/core";
import { action } from "@zoijs/action";
import { form } from "@zoijs/forms";

const contact = form(
  { name: "", email: "", message: "" },
  {
    validate: {
      name: (v) => (v.trim() ? null : "Your name, please"),
      email: (v) => (v.includes("@") ? null : "Enter a valid email"),
      message: (v) => (v.trim().length >= 10 ? null : "At least 10 characters"),
    },
  }
);

const send = action(async (values) => {
  await new Promise((r) => setTimeout(r, 60));
  return values.name;
});

function App() {
  // handleSubmit prevents the page reload; we validate (using options.validate)
  // and then let @zoijs/action send it.
  const onSubmit = contact.handleSubmit(async (values) => {
    if (!contact.validate()) return;
    await send.run(values);
  });

  const field = (name, label, kind = "input") => html`<label class="field">
    <span>${label}</span>
    ${kind === "textarea"
      ? html`<textarea
          name=${name}
          value=${() => contact.value(name)}
          oninput=${(e) => contact.set(name, e.target.value)}
          onblur=${() => contact.touch(name)}
        ></textarea>`
      : html`<input
          name=${name}
          value=${() => contact.value(name)}
          oninput=${(e) => contact.set(name, e.target.value)}
          onblur=${() => contact.touch(name)}
        />`}
    ${() => (contact.error(name) ? html`<span class="err" data-testid=${"err-" + name}>${contact.error(name)}</span>` : null)}
  </label>`;

  return html`
    <h1>Contact us</h1>
    ${() =>
      send.done()
        ? html`<p class="ok" data-testid="ok">Thanks, ${() => send.result()} — we'll be in touch!</p>`
        : html`<form onsubmit=${onSubmit} novalidate>
            ${field("name", "Name")}
            ${field("email", "Email")}
            ${field("message", "Message", "textarea")}
            <button type="submit" disabled=${() => send.pending()}>
              ${() => (send.pending() ? "Sending…" : "Send")}
            </button>
          </form>`}
  `;
}

mount(App, "#app");
