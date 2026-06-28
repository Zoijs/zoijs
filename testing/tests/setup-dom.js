// DOM test setup — provides a real DOM to the test process via jsdom.
//
// Preloaded with `node --test --import ./tests/setup-dom.js`, so `document` and
// friends are global by the time the tests run. (@zoijs/testing uses the global
// document/Event, exactly as it would in a browser or under any DOM runner.)

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
  "MouseEvent",
]) {
  if (window[key]) globalThis[key] = window[key];
}
