// SEC-10 — router hardening: opt-in encoded-slash preservation, and go() refusing anything
// that isn't an app path with a clear error (instead of the browser's opaque SecurityError).

import test from "node:test";
import assert from "node:assert/strict";
import { configure } from "@zoijs/core";
import { createRouter } from "../src/index.js";

const skip = typeof window === "undefined" ? "needs a DOM (jsdom)" : false;
const routes = { "/files/:name": () => null, "/": () => null };
const params = (opts, path) => createRouter(routes, { location: "/", ...opts }).match(path).params;

test("decodeSlash default (true) keeps the original behavior: %2F becomes /", () => {
  assert.deepEqual(params({}, "/files/..%2Fadmin"), { name: "../admin" });
  assert.deepEqual(params({ decodeSlash: true }, "/files/a%2fb"), { name: "a/b" });
});

test("decodeSlash: false keeps %2F / %2f encoded (normalized to %2F); other escapes still decode", () => {
  const p = (path) => params({ decodeSlash: false }, path).name;
  assert.equal(p("/files/..%2Fadmin"), "..%2Fadmin");
  assert.equal(p("/files/..%2fadmin"), "..%2Fadmin");
  assert.equal(p("/files/a%2F%2Fb"), "a%2F%2Fb");
  assert.equal(p("/files/hello%20world"), "hello world");
  assert.equal(p("/files/caf%C3%A9%2F%3F"), "café%2F?");
  assert.equal(p("/files/%252F"), "%2F", "a literal '%2F' (sent as %252F) decodes as before");
});

test("malformed escapes are still passed through undecoded, in both modes", () => {
  assert.equal(params({}, "/files/bad%E0").name, "bad%E0");
  assert.equal(params({ decodeSlash: false }, "/files/bad%E0%2F").name, "bad%E0%2F");
});

const REFUSED = /@zoijs\/router: go\(\) only navigates within the app/;

test("go() refuses absolute, scheme, and protocol-relative URLs with a clear TypeError", { skip }, () => {
  const router = createRouter(routes);
  const before = window.location.href;
  for (const to of [
    "https://evil.example/",
    "HTTPS://evil.example",
    "javascript:alert(1)",
    " java\tscript:alert(1)",
    "\x01javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "mailto:a@b.c",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
  ]) {
    assert.throws(() => router.go(to), (e) => e instanceof TypeError && REFUSED.test(e.message), JSON.stringify(to));
  }
  assert.equal(window.location.href, before, "nothing was navigated");
  router.destroy();
});

test("go() still takes app paths: absolute paths, query/hash-only, relative segments", { skip }, () => {
  const router = createRouter(routes);
  for (const to of ["/files/a", "/files/a?x=1#top", "?q=2", "#section", "files/b", "/"]) {
    assert.doesNotThrow(() => router.go(to), to);
  }
  router.go("/files/report");
  assert.equal(router.path(), "/files/report");
  router.destroy();
});

test("go() validation and decodeSlash apply in production, and go() validates even on the server", () => {
  configure({ dev: false });
  try {
    assert.equal(params({ decodeSlash: false }, "/files/..%2Fadmin").name, "..%2Fadmin");
    const saved = globalThis.window;
    globalThis.window = undefined;
    try {
      const server = createRouter(routes, { location: "/" });
      assert.throws(() => server.go("https://evil.example"), REFUSED);
      assert.doesNotThrow(() => server.go("/files/a"), "an app path is a no-op on the server");
    } finally {
      globalThis.window = saved;
    }
  } finally {
    configure({ dev: true });
  }
});
