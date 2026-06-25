<div align="center">

# @zoijs/forms

**A tiny, native-forms-first helper for [Zoijs](https://zoijs.dev).** Reactive values, errors, and touched state — without a form framework.

[![npm](https://img.shields.io/npm/v/@zoijs/forms.svg)](https://www.npmjs.com/package/@zoijs/forms)
[![license](https://img.shields.io/npm/l/@zoijs/forms.svg)](LICENSE)

[Documentation](https://zoijs.dev) · [Core package](https://www.npmjs.com/package/@zoijs/core)

</div>

---

`@zoijs/forms` is an **optional** package. Add it when a form needs a little
structure — tracking values, errors, and which fields have been touched. You
still write ordinary `<input>`s, and you still submit with
[`@zoijs/action`](https://www.npmjs.com/package/@zoijs/action). Forms never
touches the network.

You can learn the whole thing in about 5 minutes.

## Install

```bash
npm install @zoijs/core @zoijs/forms
```

Or with no install, from a CDN:

```js
import { form } from "https://esm.sh/@zoijs/forms@0.1";
```

## What `form()` does

`form(initialValues, options?)` keeps your form's **values**, **errors**, and
**touched** state in Zoijs reactive state, with small per-field helpers:

```js
import { form } from "@zoijs/forms";

const login = form({ email: "", password: "" });

login.values.get();                 // { email: "", password: "" }
login.value("email");               // one field (reactive)
login.set("email", "a@b.com");      // update one field
login.error("email");               // one field's error (reactive)
login.setError("email", "Required");
login.clearError("email");
login.touch("email");               // mark touched (e.g. on blur)
login.reset();                      // restore initial values, clear errors + touched
```

## The API

| Member | What it does |
|---|---|
| `form(initialValues, options?)` | Create a form helper |
| `values` | Reactive state of all values — `values.get()` returns the object |
| `value(name)` | Read one field's value (reactive) |
| `set(name, value)` | Update one field |
| `errors` | Reactive state of all errors |
| `error(name)` | Read one field's error (reactive) |
| `setError(name, message)` | Set one field's error |
| `clearError(name)` | Clear one field's error |
| `touched` | Reactive state of touched fields |
| `touch(name)` | Mark a field touched |
| `reset()` | Restore initial values; clear errors + touched |
| `validate(rules?)` | Run rules, set errors, return whether valid |
| `handleSubmit(fn)` | Wrap a submit handler: prevents reload, calls `fn(values)` |

## Login form example

Use native inputs — `value` reads from the form, `oninput` writes back, `onblur`
marks touched:

```js
import { html, mount } from "@zoijs/core";
import { form } from "@zoijs/forms";

const login = form({ email: "", password: "" });

function App() {
  return html`
    <input
      name="email"
      value=${() => login.value("email")}
      oninput=${(e) => login.set("email", e.target.value)}
      onblur=${() => login.touch("email")}
    />
    ${() => (login.error("email") ? html`<span class="err">${login.error("email")}</span>` : null)}
  `;
}

mount(App, "#app");
```

See [`examples/login/`](examples/login/).

## Contact form example

A contact form with a textarea, default rules via `options.validate`, and
`handleSubmit`. See [`examples/contact/`](examples/contact/).

## Validation

Validation is just a map of field → function. A rule returns a message when
invalid, or a falsy value when valid. No schemas, no dependencies.

```js
const valid = login.validate({
  email: (value) => (value.includes("@") ? null : "Enter a valid email"),
  password: (value) => (value.length >= 8 ? null : "Minimum 8 characters"),
});
// valid === false, and login.error("email") is now set
```

You can also pass the rules once via options and call `validate()` with no args:

```js
const login = form({ email: "", password: "" }, {
  validate: { email: (v) => (v.includes("@") ? null : "Enter a valid email") },
});
login.validate();
```

## Using it with `@zoijs/action`

Forms holds state; **`@zoijs/action` does the request.** Validate, then submit:

```js
import { action } from "@zoijs/action";

const submitLogin = action(async (values) => {
  await api.login(values);
});

html`
  <form onsubmit=${async (e) => {
    e.preventDefault();
    if (!login.validate(rules)) return;
    await submitLogin.run(login.values.get());
  }}>
    ...
    <button disabled=${() => submitLogin.pending()}>Sign in</button>
  </form>
`;
```

`handleSubmit` is a thin convenience that prevents the default reload for you:

```js
const onSubmit = login.handleSubmit((values) => submitLogin.run(values));
html`<form onsubmit=${onSubmit}>...</form>`;
```

## Common mistakes

- **Reading outside a binding.** Wrap reads in an arrow to make them live:
  `value=${() => login.value("email")}`, not `value=${login.value("email")}`.
- **Expecting forms to submit for you.** It doesn't — pair it with `@zoijs/action`.
- **Expecting auto-validation.** `set()` only updates the value. Call `validate()`
  (on submit or blur) when you want errors; `clearError()` to remove one.
- **Reaching for field arrays / nested objects.** Keep values flat. For complex,
  dynamic shapes, manage your own reactive state with `createState`.

## What this package intentionally does *not* do

By design, to stay tiny: no form provider/context, no field registration, no
field arrays, no schema validation, no resolver system, no async-validation
engine, no controlled-component framework, and no third-party validation
dependency. It's the 90%-case helper — native forms, plus a little structure.

## License

[MIT](LICENSE) © Zoijs contributors
