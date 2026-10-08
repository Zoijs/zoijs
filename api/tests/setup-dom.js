// DOM test setup for @zoijs/api.
//
//   node --test --import ./tests/setup-dom.js "tests/**/*.test.js"

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  pretendToBeVisual: true,
  // api() checks URLs against the page origin, so the tests run on a real http(s) one.
  url: "https://app.example.com/dashboard/",
});
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.location = window.location;

for (const key of [
  "Node",
  "NodeFilter",
  "Element",
  "HTMLElement",
  "Text",
  "Comment",
  "DocumentFragment",
  "Event",
  "CustomEvent",
  "KeyboardEvent",
]) {
  if (window[key]) globalThis[key] = window[key];
}
