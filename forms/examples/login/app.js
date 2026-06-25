// Login form — native inputs, validate on blur + submit, submit via @zoijs/action.
// Forms holds values/errors/touched; @zoijs/action does the network call.

import { html, mount } from "@zoijs/core";
import { action } from "@zoijs/action";
import { form } from "@zoijs/forms";

const login = form({ email: "", password: "" });

const rules = {
  email: (v) => (v.includes("@") ? null : "Enter a valid email"),
  password: (v) => (v.length >= 8 ? null : "Minimum 8 characters"),
};

// Pretend sign-in — resolves after a short delay and returns the email.
const submit = action(async (values) => {
  await new Promise((r) => setTimeout(r, 60));
  return values.email;
});

function App() {
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!login.validate(rules)) return; // forms validates; action does the request
    await submit.run(login.all());
  };

  const field = (name, label, type = "text") => html`
    <label class=${() => (login.isTouched(name) ? "field touched" : "field")}>
      <span>${label}</span>
      <input
        name=${name}
        type=${type}
        value=${() => login.value(name)}
        oninput=${(e) => login.set(name, e.target.value)}
        onblur=${() => login.touch(name)}
      />
      ${() => (login.error(name) ? html`<span class="err" data-testid=${"err-" + name}>${login.error(name)}</span>` : null)}
    </label>`;

  return html`
    <h1>Sign in</h1>
    <form onsubmit=${onSubmit} novalidate>
      ${field("email", "Email")}
      ${field("password", "Password", "password")}
      <div class="row">
        <button type="submit" disabled=${() => submit.pending()}>
          ${() => (submit.pending() ? "Signing in…" : "Sign in")}
        </button>
        <button type="button" class="ghost" onclick=${() => login.reset()}>Reset</button>
      </div>
      ${() => (submit.error() ? html`<p class="err" role="alert">${submit.error().message}</p>` : null)}
      ${() => (submit.done() ? html`<p class="ok" data-testid="ok">Welcome, ${() => submit.result()}!</p>` : null)}
    </form>
  `;
}

mount(App, "#app");
