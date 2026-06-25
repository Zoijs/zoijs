// Type tests for @zoijs/forms's public API.
//
// Checked with `npm run test:types` (tsc --noEmit). Lines marked
// `@ts-expect-error` MUST produce a type error.

import { form } from "../src/index.js";
import type { Form } from "../src/index.js";

interface Login {
  email: string;
  password: string;
}

const login: Form<Login> = form<Login>({ email: "", password: "" });

const all: Login = login.values.get();
const email: string = login.value("email");
login.set("email", "a@b.com");
const err: string | undefined = login.error("email");
login.setError("password", "Too short");
login.clearError("password");
login.touch("email");
login.reset();

const valid: boolean = login.validate({
  email: (v) => (v.includes("@") ? null : "Enter a valid email"),
  password: (v) => (v.length >= 8 ? null : "Minimum 8 characters"),
});

const onSubmit: (e?: Event) => unknown = login.handleSubmit((values) => values.email);

// options.validate is accepted
const withOpts = form<Login>({ email: "", password: "" }, {
  validate: { email: (v) => (v ? null : "Required") },
});

// @ts-expect-error — form needs initial values
form();

// @ts-expect-error — set() must match the field's type (email is a string)
login.set("email", 123);

// @ts-expect-error — value() only accepts known field names
login.value("nope");

void [all, email, err, valid, onSubmit, withOpts];
