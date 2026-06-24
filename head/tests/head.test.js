// Tests for @zoijs/head. Setters register onCleanup, so they're exercised inside
// mount()/unmount() — exactly how a routed page's lifecycle drives them.

import test from "node:test";
import assert from "node:assert/strict";
import { html, mount } from "@zoijs/core";
import { title, description, meta } from "../src/index.js";

const skip = typeof document === "undefined" ? "needs a DOM (jsdom)" : false;

const div = () => document.createElement("div");
const descEl = () => document.head.querySelector('meta[name="description"]');

// jsdom's document persists across tests; start each one from a clean head.
function reset() {
  document.title = "";
  for (const m of [...document.head.querySelectorAll("meta[name]")]) m.remove();
}

test("title() sets document.title and restores it on unmount", { skip }, () => {
  reset();
  const unmount = mount(() => {
    title("Page A");
    return html`<p>a</p>`;
  }, div());
  assert.equal(document.title, "Page A");
  unmount();
  assert.equal(document.title, ""); // restored to the original
});

test("description() creates the meta tag and removes it on unmount", { skip }, () => {
  reset();
  const unmount = mount(() => {
    description("Hello description");
    return html`<p>x</p>`;
  }, div());
  assert.equal(descEl().getAttribute("content"), "Hello description");
  unmount();
  assert.equal(descEl(), null); // created → removed
});

test("description() replaces an existing meta and restores it on unmount", { skip }, () => {
  reset();
  const existing = document.createElement("meta");
  existing.setAttribute("name", "description");
  existing.setAttribute("content", "Original");
  document.head.appendChild(existing);

  const unmount = mount(() => {
    description("New value");
    return html`<p>x</p>`;
  }, div());
  assert.equal(descEl().getAttribute("content"), "New value");
  unmount();
  assert.equal(descEl().getAttribute("content"), "Original"); // restored, not removed
});

test("meta() sets an arbitrary name and cleans up", { skip }, () => {
  reset();
  const unmount = mount(() => {
    meta("keywords", "zoijs, frontend");
    return html`<p>x</p>`;
  }, div());
  assert.equal(document.head.querySelector('meta[name="keywords"]').getAttribute("content"), "zoijs, frontend");
  unmount();
  assert.equal(document.head.querySelector('meta[name="keywords"]'), null);
});

test("route-like change: page A reverts, then page B sets its own", { skip }, () => {
  reset();
  const a = mount(() => {
    title("A");
    description("Desc A");
    return html`<p>a</p>`;
  }, div());
  assert.equal(document.title, "A");
  assert.equal(descEl().getAttribute("content"), "Desc A");

  a(); // navigate away from A
  assert.equal(document.title, "");
  assert.equal(descEl(), null);

  const b = mount(() => {
    title("B");
    description("Desc B");
    return html`<p>b</p>`;
  }, div());
  assert.equal(document.title, "B");
  assert.equal(descEl().getAttribute("content"), "Desc B");
  b();
});

test("multiple title() calls restore back to the original (LIFO)", { skip }, () => {
  reset();
  const unmount = mount(() => {
    title("First");
    title("Second");
    return html`<p>x</p>`;
  }, div());
  assert.equal(document.title, "Second");
  unmount();
  assert.equal(document.title, "");
});

test("called outside a component, it just sets (no restore)", { skip }, () => {
  reset();
  title("Standalone");
  assert.equal(document.title, "Standalone"); // onCleanup is a no-op without an owner
  reset();
});
