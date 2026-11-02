// The lean entries (src/lean.js, src/lean-prod.js; the "zoijs-no-hydration" export condition):
// the same API without hydration, so apps that never hydrate don't load or bundle hydrate.js.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as standard from "../src/index.js";
import * as standardProd from "../src/prod.js";
import * as lean from "../src/lean.js";
import * as leanProd from "../src/lean-prod.js";
import { flush } from "../src/reactivity/scheduler.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../src");
const skip = typeof document === "undefined" ? "needs a DOM (browser or jsdom)" : false;

test("the lean entries export exactly the standard API", () => {
  const names = (m) => Object.keys(m).sort();
  assert.deepEqual(names(lean), names(standard));
  assert.deepEqual(names(leanProd), names(standard));
  assert.deepEqual(names(standardProd), names(standard));
  for (const name of Object.keys(standard)) {
    if (name !== "mount") assert.equal(lean[name], standard[name], `${name} is the same function`);
  }
  assert.notEqual(lean.mount, standard.mount, "mount is the one that differs");
});

test("lean mount renders and updates like the standard one", { skip }, () => {
  const { html, mount, createState } = lean;
  const n = createState(1);
  const target = document.createElement("div");
  const unmount = mount(() => html`<p class=${() => "n" + n.get()}>${() => n.get()}</p>`, target);
  assert.equal(target.innerHTML, '<p class="n1">1<!--zoijs--></p>');
  n.set(2);
  flush();
  assert.equal(target.innerHTML, '<p class="n2">2<!--zoijs--></p>');
  unmount();
  assert.equal(target.innerHTML, "");
});

test("lean mount refuses to hydrate — with how to fix it — and leaves the page alone", { skip }, () => {
  const target = document.createElement("div");
  target.innerHTML = "<p>server html</p>";
  assert.throws(() => lean.mount(() => lean.html`<p>client</p>`, target, { hydrate: true }), /leaves hydration out .*hydrate with the standard entry/);
  assert.equal(target.innerHTML, "<p>server html</p>", "the server-rendered DOM is untouched");
  // The standard entry still hydrates in place.
  const p = target.firstChild;
  const unmount = standard.mount(() => standard.html`<p>server html</p>`, target, { hydrate: true });
  assert.equal(target.firstChild, p, "adopted, not replaced");
  assert.equal(unmount.hydration.status, "hydrated");
});

test("hydrate.js isn't in the lean entries' module graph (so it's never loaded or bundled)", () => {
  const graph = (file, seen = new Set()) => {
    if (seen.has(file)) return seen;
    seen.add(file);
    const code = readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
    for (const m of code.matchAll(/(?:^|\n)\s*(?:import|export)[^;]*?from\s*["'](\.[^"']+)["']/g)) graph(resolve(dirname(file), m[1]), seen);
    return seen;
  };
  const rel = (s) => [...s].map((f) => f.slice(SRC.length + 1)).sort();
  for (const entry of ["lean.js", "lean-prod.js"]) {
    const files = rel(graph(join(SRC, entry)));
    assert.ok(files.includes("core/renderer.js") && files.includes("core/mount.js"), entry);
    assert.ok(!files.includes("core/hydrate.js"), `${entry} reaches core/hydrate.js`);
  }
  for (const entry of ["index.js", "prod.js"]) assert.ok(rel(graph(join(SRC, entry))).includes("core/hydrate.js"), `${entry} keeps hydration`);
});

test('the "zoijs-no-hydration" export condition picks the lean entry (and its production variant)', () => {
  const resolveWith = (...conditions) =>
    execFileSync(process.execPath, [...conditions.flatMap((c) => ["-C", c]), "--input-type=module", "-e", 'console.log(import.meta.resolve("@zoijs/core"))'], { cwd: join(SRC, ".."), encoding: "utf8" }).trim();
  assert.match(resolveWith(), /\/src\/index\.js$/);
  assert.match(resolveWith("production"), /\/src\/prod\.js$/);
  assert.match(resolveWith("zoijs-no-hydration"), /\/src\/lean\.js$/);
  assert.match(resolveWith("zoijs-no-hydration", "production"), /\/src\/lean-prod\.js$/);
});
