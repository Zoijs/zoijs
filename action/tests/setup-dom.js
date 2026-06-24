// DOM test setup for @zoijs/action.
//
//   node --test --import ./tests/setup-dom.js "tests/**/*.test.js"

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { pretendToBeVisual: true });
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
]) {
  if (window[key]) globalThis[key] = window[key];
}
