// Tests for @zoijs/forms. Reactive updates settle on a microtask, so the
// DOM-binding tests `await tick()` before asserting.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount } from "@zoijs/core";
import { action } from "@zoijs/action";
import { form } from "../src/index.js";

const tick = () => new Promise((resolve) => setTimeout(resolve));
const domSkip = typeof document === "undefined" ? "needs a DOM (jsdom)" : false;

test("starts with the initial values", () => {
  const f = form({ email: "", name: "Ada" });
  assert.deepEqual(f.values.get(), { email: "", name: "Ada" });
  assert.equal(f.value("name"), "Ada");
});

test("set() updates one field without touching the others", () => {
  const f = form({ email: "", password: "" });
  f.set("email", "a@b.com");
  assert.equal(f.value("email"), "a@b.com");
  assert.equal(f.value("password"), "");
  assert.deepEqual(f.values.get(), { email: "a@b.com", password: "" });
});

test("value(name) is reactive inside an html binding", { skip: domSkip }, async () => {
  const f = form({ email: "" });
  const target = document.createElement("div");
  mount(() => html`<p>${() => f.value("email")}</p>`, target);

  assert.equal(target.querySelector("p").textContent, "");
  f.set("email", "hi@x.com");
  await tick();
  assert.equal(target.querySelector("p").textContent, "hi@x.com");
});

test("setError() / error() store and read a field error", () => {
  const f = form({ email: "" });
  assert.equal(f.error("email"), undefined);
  f.setError("email", "Required");
  assert.equal(f.error("email"), "Required");
  assert.deepEqual(f.errors.get(), { email: "Required" });
});

test("clearError() removes one field's error", () => {
  const f = form({ email: "", password: "" });
  f.setError("email", "Required");
  f.setError("password", "Too short");
  f.clearError("email");
  assert.equal(f.error("email"), undefined);
  assert.equal(f.error("password"), "Too short");
});

test("error(name) is reactive inside an html binding", { skip: domSkip }, async () => {
  const f = form({ email: "" });
  const target = document.createElement("div");
  mount(() => html`<span>${() => f.error("email") ?? "ok"}</span>`, target);

  assert.equal(target.querySelector("span").textContent, "ok");
  f.setError("email", "Bad");
  await tick();
  assert.equal(target.querySelector("span").textContent, "Bad");
});

test("touch() marks a field touched", () => {
  const f = form({ email: "" });
  assert.deepEqual(f.touched.get(), {});
  f.touch("email");
  assert.equal(f.touched.get().email, true);
});

test("reset() restores initial values and clears errors + touched", () => {
  const f = form({ email: "", name: "Ada" });
  f.set("email", "x@y.com");
  f.set("name", "Grace");
  f.setError("email", "Bad");
  f.touch("name");

  f.reset();
  assert.deepEqual(f.values.get(), { email: "", name: "Ada" });
  assert.deepEqual(f.errors.get(), {});
  assert.deepEqual(f.touched.get(), {});
});

test("validate(rules) sets errors and returns validity", () => {
  const f = form({ email: "bad", password: "x" });
  const rules = {
    email: (v) => (v.includes("@") ? null : "Enter a valid email"),
    password: (v) => (v.length >= 8 ? null : "Minimum 8 characters"),
  };

  assert.equal(f.validate(rules), false);
  assert.equal(f.error("email"), "Enter a valid email");
  assert.equal(f.error("password"), "Minimum 8 characters");

  f.set("email", "a@b.com");
  f.set("password", "longenough");
  assert.equal(f.validate(rules), true);
  assert.deepEqual(f.errors.get(), {});
});

test("validate() uses the rules passed in options", () => {
  const f = form({ name: "" }, { validate: { name: (v) => (v ? null : "Required") } });
  assert.equal(f.validate(), false);
  assert.equal(f.error("name"), "Required");
});

test("handleSubmit() prevents default and calls fn with the values", () => {
  const f = form({ email: "a@b.com" });
  let received;
  let prevented = false;
  const handler = f.handleSubmit((values) => {
    received = values;
  });
  handler({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(received, { email: "a@b.com" });
});

test("integrates with @zoijs/action on submit", async () => {
  const f = form({ email: "a@b.com", password: "longenough" });
  const calls = [];
  const submit = action(async (values) => {
    calls.push(values);
    return "ok";
  });

  const handler = f.handleSubmit((values) => submit.run(values));
  await handler({ preventDefault() {} });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { email: "a@b.com", password: "longenough" });
  assert.equal(submit.done(), true);
  assert.equal(submit.result(), "ok");
});

test("supports fields not present in the initial values", () => {
  const f = form({ email: "" });
  f.set("newsletter", true);
  assert.equal(f.value("newsletter"), true);
  f.reset();
  assert.equal(f.value("newsletter"), undefined); // reset to the initial shape
});
