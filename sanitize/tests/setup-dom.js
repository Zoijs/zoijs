// DOM test setup for @zoijs/sanitize.
//
//   node --test --import ./tests/setup-dom.js
//
// sanitize() parses with DOMParser and returns live nodes, so the tests need a DOM.

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "https://zoijs.test/",
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
  "DOMParser",
  "Event",
  "CustomEvent",
]) {
  if (window[key]) globalThis[key] = window[key];
}
