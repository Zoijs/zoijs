// DOM test setup — provides a real DOM to the test process via jsdom.
//
// Preloaded with `node --test --import ./tests/setup-dom.js`, so `document` and
// friends (and requestAnimationFrame, used by the panel) are global by the time
// the tests run — exactly as they would be in a browser.

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { pretendToBeVisual: true });
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

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
]) {
  if (window[key]) globalThis[key] = window[key];
}
