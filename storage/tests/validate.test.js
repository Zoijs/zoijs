// SEC-10 — storage(key, initial, { validate }): localStorage is user-editable, so the
// restored value can be checked. Not true (or a throw) → initialValue, never a crash.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, configure } from "@zoijs/core";
import { storage } from "../src/index.js";

const skip = typeof window === "undefined" ? "needs a DOM (jsdom)" : false;
const isTheme = (v) => v === "light" || v === "dark";

test("a valid stored value is restored", { skip }, () => {
  window.localStorage.setItem("v-theme", JSON.stringify("dark"));
  assert.equal(storage("v-theme", "light", { validate: isTheme }).get(), "dark");
});

test("a tampered value that fails validation falls back to the initial value (item left as is)", { skip }, () => {
  window.localStorage.setItem("v-theme2", JSON.stringify("<img src=x onerror=alert(1)>"));
  const theme = storage("v-theme2", "light", { validate: isTheme });
  assert.equal(theme.get(), "light");
  assert.equal(window.localStorage.getItem("v-theme2"), JSON.stringify("<img src=x onerror=alert(1)>"), "not deleted on read");
  theme.set("dark");
  assert.equal(window.localStorage.getItem("v-theme2"), JSON.stringify("dark"), "the next set() overwrites it");
});

test("shape validation of objects; only `true` accepts (a truthy non-true value doesn't)", { skip }, () => {
  window.localStorage.setItem("v-prefs", JSON.stringify({ size: 14, admin: true }));
  const validate = (v) => v !== null && typeof v === "object" && Object.keys(v).join() === "size" && Number.isInteger(v.size);
  assert.deepEqual(storage("v-prefs", { size: 12 }, { validate }).get(), { size: 12 });
  window.localStorage.setItem("v-prefs", JSON.stringify({ size: 16 }));
  assert.deepEqual(storage("v-prefs", { size: 12 }, { validate }).get(), { size: 16 });
  window.localStorage.setItem("v-name", JSON.stringify("attacker"));
  assert.equal(storage("v-name", "guest", { validate: (v) => v }).get(), "guest", "returning the value itself is not `true`");
});

test("a throwing validator is treated as invalid, never crashes startup", { skip }, () => {
  window.localStorage.setItem("v-null", "null");
  assert.equal(storage("v-null", "x", { validate: (v) => v.length > 0 }).get(), "x");
});

test("null and __proto__-carrying JSON go through the validator like any value", { skip }, () => {
  window.localStorage.setItem("v-np", JSON.stringify(null));
  assert.equal(storage("v-np", "init", { validate: (v) => typeof v === "string" }).get(), "init");
  window.localStorage.setItem("v-pp", '{"__proto__":{"polluted":1}}');
  const v = storage("v-pp", {}, { validate: (o) => Object.getPrototypeOf(o) === Object.prototype && !Object.hasOwn(o, "__proto__") }).get();
  assert.deepEqual(v, {});
  assert.equal({}.polluted, undefined, "JSON.parse never pollutes Object.prototype");
});

test("no validator: behavior unchanged (any JSON restored; corrupt JSON falls back)", { skip }, () => {
  window.localStorage.setItem("v-any", JSON.stringify({ anything: [1, 2] }));
  assert.deepEqual(storage("v-any", null).get(), { anything: [1, 2] });
  window.localStorage.setItem("v-bad", "{ nope");
  assert.equal(storage("v-bad", 7, { validate: () => true }).get(), 7);
});

test("writes are not validated, and reactivity is unaffected", { skip }, async () => {
  window.localStorage.removeItem("v-rx");
  const s = storage("v-rx", "light", { validate: isTheme });
  const target = document.createElement("div");
  mount(() => html`<p>${() => s.get()}</p>`, target);
  s.set("custom-from-app-code");
  await new Promise((r) => setTimeout(r));
  assert.equal(target.textContent, "custom-from-app-code");
  assert.equal(window.localStorage.getItem("v-rx"), JSON.stringify("custom-from-app-code"));
});

test("production mode validates too", { skip }, () => {
  configure({ dev: false });
  try {
    window.localStorage.setItem("v-prod", JSON.stringify("evil"));
    assert.equal(storage("v-prod", "light", { validate: isTheme }).get(), "light");
  } finally {
    configure({ dev: true });
  }
});
