// Fixture projects for the build tests: a temporary directory with an app, a package.json and a
// fake @zoijs/core whose development and production entries are told apart by a marker string.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const CORE_FILES = {
  "node_modules/@zoijs/core/package.json": JSON.stringify({
    name: "@zoijs/core",
    version: "1.10.0",
    type: "module",
    exports: { ".": { production: "./src/prod.js", default: "./src/index.js" } },
  }),
  "node_modules/@zoijs/core/src/index.js": 'export const mode = "core-development-entry";\n',
  "node_modules/@zoijs/core/src/prod.js": 'export const mode = "core-production-entry";\n',
};

export const APP_FILES = {
  "package.json": JSON.stringify({ name: "fixture", private: true, type: "module", dependencies: { "@zoijs/core": "1.10.0" } }),
  "src/main.js": 'import { mode } from "@zoijs/core";\nimport { shared } from "./shared.js";\ndocument.title = mode + shared;\nexport const loadPage = () => import("./page.js");\n',
  "src/shared.js": 'export const shared = "-shared-module-" + Math.random();\n',
  "src/page.js": 'import { shared } from "./shared.js";\nexport default () => "lazy-page" + shared;\n',
  "src/a.css": "body {\n  color: red;\n}\n",
  "src/b.css": "/* comment */\nh1 { margin: 0 }\n",
  ...CORE_FILES,
};

/** A fresh project directory with `files` ({ relativePath: contents }). Removed after the test. */
export function project(t, files = APP_FILES) {
  const root = mkdtempSync(join(tmpdir(), "zoijs-build-"));
  for (const [rel, text] of Object.entries(files)) {
    if (text == null) continue;
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

export const read = (root, rel) => readFileSync(join(root, rel), "utf8");
export const exists = (root, rel) => existsSync(join(root, rel));
export const list = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []);
export const sri = (text, alg = "sha384") => `${alg}-${createHash(alg).update(text).digest("base64")}`;

/** Every file under `dir` (relative path → contents), for comparing whole outputs. */
export function snapshot(dir) {
  const out = {};
  const walk = (d, prefix) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix + e.name;
      if (e.isDirectory()) walk(join(d, e.name), rel + "/");
      else out[rel] = readFileSync(join(d, e.name), "utf8");
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out;
}
