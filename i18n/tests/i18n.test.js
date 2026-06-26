// Tests for @zoijs/i18n — translation, interpolation, plurals, Intl formatting,
// fallback, lazy add(), and reactive locale switching (real DOM via jsdom).

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount, createState } from "@zoijs/core";
import { createI18n } from "../src/index.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

const make = () =>
  createI18n({
    locale: "en",
    fallback: "en",
    messages: {
      en: {
        hello: "Hello, {name}!",
        items: { one: "{count} item", other: "{count} items" },
        nav: { home: "Home" },
        only_en: "English only",
      },
      fr: {
        hello: "Bonjour, {name} !",
        items: { one: "{count} article", other: "{count} articles" },
        nav: { home: "Accueil" },
      },
    },
  });

test("interpolates placeholders", () => {
  assert.equal(make().t("hello", { name: "Ada" }), "Hello, Ada!");
});

test("unknown placeholder is left intact, never throws", () => {
  assert.equal(make().t("hello", {}), "Hello, {name}!");
});

test("missing key returns the key itself", () => {
  assert.equal(make().t("does.not.exist"), "does.not.exist");
});

test("dotted keys walk nested tables", () => {
  assert.equal(make().t("nav.home"), "Home");
});

test("plurals select via Intl.PluralRules", () => {
  const i = make();
  assert.equal(i.t("items", { count: 1 }), "1 item");
  assert.equal(i.t("items", { count: 5 }), "5 items");
});

test("falls back to the fallback locale for a missing key", () => {
  const i = make();
  i.setLocale("fr");
  assert.equal(i.t("only_en"), "English only"); // not in fr → en fallback
  assert.equal(i.t("nav.home"), "Accueil"); // present in fr
});

test("has() reports key presence (current or fallback)", () => {
  const i = make();
  assert.equal(i.has("nav.home"), true);
  assert.equal(i.has("nope"), false);
});

test("Intl number/date/list formatting follows the locale", () => {
  const i = make();
  assert.equal(i.n(1234.5), "1,234.5");
  i.setLocale("fr");
  // fr groups with a non-breaking space; just assert it changed from the en form.
  assert.notEqual(i.n(1234.5), "1,234.5");
  assert.equal(i.list(["a", "b", "c"], { type: "conjunction" }).includes("a"), true);
});

test("add() merges a lazily-loaded bundle", () => {
  const i = createI18n({ locale: "de", fallback: "en", messages: { en: { hi: "Hi" } } });
  assert.equal(i.t("hi"), "Hi"); // from fallback
  i.add("de", { hi: "Hallo" });
  assert.equal(i.t("hi"), "Hallo");
});

test("setLocale reactively updates a mounted binding", async () => {
  const i = make();
  const host = document.createElement("div");
  mount(() => html`<p>${() => i.t("hello", { name: "Ada" })}</p>`, host);
  assert.equal(host.querySelector("p").textContent, "Hello, Ada!");
  i.setLocale("fr");
  await tick();
  assert.equal(host.querySelector("p").textContent, "Bonjour, Ada !");
});

test("translations are inert text when bound (no injection)", async () => {
  const i = createI18n({ locale: "en", messages: { en: { greet: "Hi {who}" } } });
  const host = document.createElement("div");
  mount(() => html`<p>${() => i.t("greet", { who: "<img src=x onerror=alert(1)>" })}</p>`, host);
  // The angle brackets render as text; no <img> element is created.
  assert.equal(host.querySelector("img"), null);
  assert.ok(host.querySelector("p").textContent.includes("<img"));
});
