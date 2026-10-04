// DOM test setup for @zoijs/router.
//
// Like the core's setup, but the jsdom instance is given a real URL so the
// History API (pushState / popstate / location) works — the router needs it.
//
//   node --test --import ./tests/setup-dom.js "tests/**/*.test.js"

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body><div id=\"app\"></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;

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
  "MouseEvent",
  "PopStateEvent",
]) {
  if (window[key]) globalThis[key] = window[key];
}
