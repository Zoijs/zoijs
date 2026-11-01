// DOM test setup — provides a real DOM to the test process via jsdom, so the
// reactive-update tests can mount a component and assert on rendered text.

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
]) {
  if (window[key]) globalThis[key] = window[key];
}
