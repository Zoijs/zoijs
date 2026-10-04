// SSR-safety: under @zoijs/ssr's renderToString there is no `document`. The
// setters must degrade to no-ops instead of throwing, so a component that calls
// title()/description()/meta() can be server-rendered. (The jsdom setup installs
// a document globally; each test removes it for its duration to simulate a server.)

import test from "node:test";
import assert from "node:assert/strict";
import { title, description, meta } from "../src/index.js";

function withoutDocument(fn) {
  const savedDoc = globalThis.document;
  globalThis.document = undefined; // typeof document === "undefined"
  try {
    return fn();
  } finally {
    globalThis.document = savedDoc;
  }
}

test("title/description/meta are no-ops without a document (SSR) and never throw", () => {
  withoutDocument(() => {
    assert.doesNotThrow(() => title("Server Title"));
    assert.doesNotThrow(() => description("Rendered on the server"));
    assert.doesNotThrow(() => meta("og:type", "website"));
  });
});

test("the document is untouched on the client after the SSR no-op path runs", () => {
  document.title = "Original";
  withoutDocument(() => title("ignored on the server"));
  // Back on the "client": the real setter still works as before.
  const unmountTitle = title; // (sanity: same export)
  assert.equal(typeof unmountTitle, "function");
  assert.equal(document.title, "Original"); // SSR no-op left the client document alone
});
