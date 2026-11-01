// DOM test setup (Task 4) — provides a real DOM to the test process via jsdom.
//
// Preloaded with `node --test --import ./tests/setup-dom.js`, so by the time the
// test files run, `document` and friends are global. The framework uses these as
// globals (document, Node, NodeFilter, ...), so DOM tests that previously skipped
// in plain Node now execute. Pure-logic tests (state/effect/scheduler/computed)
// are unaffected.

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
