// DOM test setup for @zoijs/storage.
//
//   node --test --import ./tests/setup-dom.js
//
// A real origin is supplied so jsdom enables window.localStorage (it refuses on
// opaque origins like about:blank).

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
  "Event",
  "CustomEvent",
  "KeyboardEvent",
]) {
  if (window[key]) globalThis[key] = window[key];
}
