// sanitize() and Trusted Types — unit level, with a stub `trustedTypes` (jsdom has none). The
// real-browser enforcement gate is browser-tests/sanitize.spec.js ("under enforced Trusted Types").
// Runs in its own process (node --test isolates files), so the module-level policy starts fresh.

import test from "node:test";
import assert from "node:assert/strict";

const created = [];
const wrapped = [];
window.trustedTypes = {
  createPolicy(name, rules) {
    created.push(name);
    return { createHTML: (s) => (wrapped.push(s), rules.createHTML(s)) };
  },
};
const { sanitize } = await import("../src/index.js");

test("parses through one private `zoijs-sanitize` policy, created lazily and once", () => {
  assert.deepEqual(created, [], "nothing created at import time");
  const a = sanitize("<b>one</b>");
  const b = sanitize("<i>two</i><script>x</script>");
  assert.deepEqual(created, ["zoijs-sanitize"]);
  assert.deepEqual(wrapped, ["<b>one</b>", "<i>two</i><script>x</script>"]);
  assert.equal(a[0].outerHTML, "<b>one</b>");
  assert.deepEqual(b.map((n) => n.outerHTML), ["<i>two</i>"], "still pruned — the policy only feeds the parse");
});
