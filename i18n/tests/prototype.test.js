// SEC-10 — interpolation variables and message keys resolve from OWN properties only, so
// inherited names (constructor, toString, __proto__ …) never leak Object.prototype values.

import test from "node:test";
import assert from "node:assert/strict";
import { configure } from "@zoijs/core";
import { createI18n } from "../src/index.js";

const i18n = () =>
  createI18n({
    locale: "en",
    messages: { en: { hi: "Hello, {name}!", proto: "{constructor}|{toString}|{__proto__}|{hasOwnProperty}", nav: { home: "Home" } } },
  });

test("own variables interpolate as before", () => {
  assert.equal(i18n().t("hi", { name: "Ada" }), "Hello, Ada!");
  assert.equal(i18n().t("hi"), "Hello, {name}!", "missing → placeholder left visible");
});

test("inherited names are not variables: placeholders stay as written", () => {
  assert.equal(i18n().t("proto", {}), "{constructor}|{toString}|{__proto__}|{hasOwnProperty}");
  assert.equal(i18n().t("proto"), "{constructor}|{toString}|{__proto__}|{hasOwnProperty}");
  assert.equal(i18n().t("hi", Object.create({ name: "inherited" })), "Hello, {name}!");
});

test("null-prototype vars work; an explicitly owned 'constructor' key is honored", () => {
  const vars = Object.create(null);
  vars.name = "Null";
  assert.equal(i18n().t("hi", vars), "Hello, Null!");
  assert.equal(i18n().t("proto", { constructor: "C", toString: "T" }), "C|T|{__proto__}|{hasOwnProperty}");
});

test("message keys don't resolve through the prototype either", () => {
  const t = i18n();
  for (const key of ["constructor", "toString", "__proto__", "hasOwnProperty", "nav.constructor", "hi.length"]) {
    assert.equal(t.t(key), key, `missing key shown as-is: ${key}`);
    assert.equal(t.has(key), false, key);
  }
  assert.equal(t.t("nav.home"), "Home");
});

test("production mode: same own-property semantics", () => {
  configure({ dev: false });
  try {
    assert.equal(i18n().t("proto", {}), "{constructor}|{toString}|{__proto__}|{hasOwnProperty}");
  } finally {
    configure({ dev: true });
  }
});

// Release audit: the formatter cache key used a literal NUL byte in the source, which made
// grep/file treat the file as binary. It is now the "\u0000" escape — the same string at runtime.
test("source is plain text (no literal NUL) and formatter caching still separates locale/options", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/index.js", import.meta.url));
  assert.equal(src.includes(0), false, "no NUL byte in the source");
  const t = createI18n({ locale: "en", messages: { en: {}, de: {} } });
  assert.equal(t.n(1234.5), "1,234.5");
  assert.equal(t.n(0.5, { style: "percent" }), "50%");
  t.setLocale("de");
  assert.equal(t.n(1234.5), new Intl.NumberFormat("de").format(1234.5), "a different locale gets its own cached formatter");
  assert.equal(t.n(0.5, { style: "percent" }), new Intl.NumberFormat("de", { style: "percent" }).format(0.5));
});
