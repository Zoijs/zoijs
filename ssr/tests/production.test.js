// SEC-4: the server production path. Under Node's "production" export condition,
// `@zoijs/core` resolves to the production entry, so a server render runs with
// dev mode off — and renders exactly the same HTML. Runs in a child process
// (the starting mode is per realm). No DOM, no window/location access.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

test("renderToString under the production condition runs with dev off and renders the same", () => {
  const file = join(dir, ".production-case.mjs");
  writeFileSync(file, `
    const core = await import("@zoijs/core");
    const { renderToString } = await import("../src/index.js");
    const { isDev } = await import(new URL("reactivity/env.js", import.meta.resolve("@zoijs/core")).href);
    const n = core.createState(2);
    const html = renderToString(() => core.html\`<p>\${() => n.get() * 21}</p>\`);
    process.stdout.write(JSON.stringify({ entry: import.meta.resolve("@zoijs/core").split("/").pop(), dev: isDev(), html }));`);
  try {
    const run = (args) => JSON.parse(execFileSync(process.execPath, [...args, file], { encoding: "utf8", cwd: dir }));
    const prod = run(["--conditions=production"]);
    const dev = run([]);
    assert.deepEqual(prod, { entry: "prod.js", dev: false, html: "<p>42</p>" });
    assert.deepEqual(dev, { entry: "index.js", dev: true, html: "<p>42</p>" });
  } finally {
    rmSync(file, { force: true });
  }
});
