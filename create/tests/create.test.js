// Tests for create-zoijs. Pure Node + fs — no DOM, no build. Run with `node --test`.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseArgs,
  toTitle,
  validateName,
  ensureTargetAvailable,
  scaffold,
  DEFAULT_TEMPLATE,
  TEMPLATES,
} from "../bin/create-zoijs.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "create-zoijs-"));
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");
const walk = (dir, files = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
};

// ---- argument parsing --------------------------------------------------------

test("parseArgs reads the app name and defaults the template", () => {
  assert.deepEqual(parseArgs(["my-app"]), { name: "my-app", template: DEFAULT_TEMPLATE });
});

test("parseArgs reads --template (and -t, and --template=)", () => {
  assert.equal(parseArgs(["my-app", "--template", "basic"]).template, "basic");
  assert.equal(parseArgs(["my-app", "-t", "basic"]).template, "basic");
  assert.equal(parseArgs(["--template=basic", "my-app"]).template, "basic");
  assert.equal(parseArgs(["--template", "basic", "my-app"]).name, "my-app");
});

test("parseArgs leaves name undefined when none is given (→ prompt)", () => {
  assert.equal(parseArgs([]).name, undefined);
  assert.equal(parseArgs(["--template", "basic"]).name, undefined);
});

// ---- naming ------------------------------------------------------------------

test("toTitle makes a readable title from a slug", () => {
  assert.equal(toTitle("task-manager"), "Task Manager");
  assert.equal(toTitle("task_board"), "Task Board");
  assert.equal(toTitle("portfolio"), "Portfolio");
  assert.equal(toTitle("myCoolApp"), "My Cool App");
});

test("validateName accepts typical names", () => {
  for (const ok of ["my-app", "task-board", "portfolio", "task-manager", "app1"]) {
    assert.equal(validateName(ok).valid, true, ok);
  }
});

test("validateName rejects empty, spaces, and illegal characters", () => {
  assert.equal(validateName("").valid, false);
  assert.equal(validateName("   ").valid, false);
  assert.equal(validateName("my app").valid, false); // space
  assert.equal(validateName(".secret").valid, false); // leading dot
  assert.equal(validateName("bad/name").valid, false); // slash
  assert.equal(validateName("oops!").valid, false); // punctuation
});

// ---- non-empty folder rejection ----------------------------------------------

test("ensureTargetAvailable allows a missing or empty dir, rejects a non-empty one", () => {
  const base = tmp();
  const missing = path.join(base, "fresh");
  assert.doesNotThrow(() => ensureTargetAvailable(missing)); // doesn't exist

  const empty = path.join(base, "empty");
  fs.mkdirSync(empty);
  assert.doesNotThrow(() => ensureTargetAvailable(empty)); // exists but empty

  const full = path.join(base, "full");
  fs.mkdirSync(full);
  fs.writeFileSync(path.join(full, "keep.txt"), "x");
  assert.throws(() => ensureTargetAvailable(full), /not empty/);
});

// ---- template copying + token replacement ------------------------------------

test("scaffold(basic) copies files and fills in the name + title", () => {
  const dir = path.join(tmp(), "task-board");
  const { written } = scaffold({ name: "task-board", template: "basic", targetDir: dir });

  assert.ok(written.length > 0);
  assert.ok(fs.existsSync(path.join(dir, "package.json")));
  assert.ok(fs.existsSync(path.join(dir, "index.html")));
  assert.ok(fs.existsSync(path.join(dir, "src", "app.js")));
  assert.ok(fs.existsSync(path.join(dir, "src", "style.css")));
  // _gitignore is renamed to .gitignore on copy
  assert.ok(fs.existsSync(path.join(dir, ".gitignore")));
  assert.ok(!fs.existsSync(path.join(dir, "_gitignore")));

  // package.json name replacement (lowercased)
  assert.equal(JSON.parse(read(dir, "package.json")).name, "task-board");
  // index.html title replacement (readable)
  assert.match(read(dir, "index.html"), /<title>Task Board<\/title>/);
  // no leftover placeholders anywhere in a text file
  assert.doesNotMatch(read(dir, "src", "app.js"), /\{\{APP_/);
  // dev server (no npx serve / port 3000)
  assert.equal(JSON.parse(read(dir, "package.json")).scripts.dev, "node dev-server.mjs");
  assert.ok(fs.existsSync(path.join(dir, "dev-server.mjs")));
});

test("scaffold(app) generates the polished dashboard starter", () => {
  const dir = path.join(tmp(), "my-tasks");
  scaffold({ name: "My-Tasks", template: "app", targetDir: dir });

  // component composition: Header, StatCard, TaskItem
  assert.ok(fs.existsSync(path.join(dir, "src", "components", "Header.js")));
  assert.ok(fs.existsSync(path.join(dir, "src", "components", "StatCard.js")));
  assert.ok(fs.existsSync(path.join(dir, "src", "components", "TaskItem.js")));

  // package name is lowercased from "My-Tasks"; title derived from the name
  assert.equal(JSON.parse(read(dir, "package.json")).name, "my-tasks");
  assert.match(read(dir, "index.html"), /<title>My Tasks<\/title>/);

  // demonstrates the required core features + composition + filtering
  const app = read(dir, "src", "app.js");
  for (const token of ["createState", "computed", "each", "Header(", "StatCard(", "TaskItem(", "filter"]) {
    assert.ok(app.includes(token), `app.js should use ${token}`);
  }
  // dashboard content (the "project dashboard" / "Built with Zoijs" hero)
  assert.match(read(dir, "src", "components", "Header.js"), /Built with Zoijs/);
  assert.match(read(dir, "src", "components", "Header.js"), /dashboard/i);

  // child → parent callbacks
  assert.match(read(dir, "src", "components", "TaskItem.js"), /onToggle|onDelete/);
  // dev server on 7310 (not npx serve / 3000); only depends on @zoijs/core
  assert.equal(JSON.parse(read(dir, "package.json")).scripts.dev, "node dev-server.mjs");
  assert.ok(fs.existsSync(path.join(dir, "dev-server.mjs")));
  assert.deepEqual(Object.keys(JSON.parse(read(dir, "package.json")).dependencies), ["@zoijs/core"]);
});

test("any generated dev server uses port 7310 with 7311–7313 fallbacks and the right banner", () => {
  for (const template of TEMPLATES) {
    const dir = path.join(tmp(), template);
    scaffold({ name: "x", template, targetDir: dir });
    // minimal (CDN + npx serve) and library (a package) ship no dev server.
    if (!fs.existsSync(path.join(dir, "dev-server.mjs"))) continue;
    const dev = read(dir, "dev-server.mjs");
    assert.match(dev, /\[\s*7310\s*,\s*7311\s*,\s*7312\s*,\s*7313\s*\]/, `${template}: dev-server should list the port range`);
    assert.match(dev, /Zoijs dev server/, `${template}: dev-server should print the banner`);
    assert.match(dev, /http:\/\/localhost:\$\{PORTS\[i\]\}/, `${template}: dev-server should print the local URL`);
  }
});

test("scaffold writes editor config: .vscode recommendations + jsconfig (app/basic)", () => {
  for (const template of ["app", "basic"]) {
    const dir = path.join(tmp(), template);
    scaffold({ name: "ed", template, targetDir: dir });
    // _vscode is restored to .vscode on copy (npm strips dot-prefixed names)
    assert.ok(fs.existsSync(path.join(dir, ".vscode", "extensions.json")), `${template}: .vscode/extensions.json`);
    assert.ok(!fs.existsSync(path.join(dir, "_vscode")), `${template}: no leftover _vscode`);
    const ext = JSON.parse(read(dir, ".vscode", "extensions.json"));
    assert.ok(ext.recommendations.includes("bierner.lit-html"), `${template}: recommends an html\`\` highlighter`);
    // jsconfig gives IntelliSense from the bundled types without a build step
    assert.ok(fs.existsSync(path.join(dir, "jsconfig.json")), `${template}: jsconfig.json`);
  }
});

test("scaffold(typescript) is type-checked JS with no build step", () => {
  const dir = path.join(tmp(), "ts-app");
  scaffold({ name: "ts-app", template: "typescript", targetDir: dir });
  const pkg = JSON.parse(read(dir, "package.json"));
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  assert.equal(pkg.scripts.dev, "node dev-server.mjs"); // still no build/compile step
  assert.ok(fs.existsSync(path.join(dir, "tsconfig.json")));
  assert.ok(JSON.parse(read(dir, "tsconfig.json")).compilerOptions.checkJs);
  // type-checked JS — .js source, no .ts to compile
  assert.ok(fs.existsSync(path.join(dir, "src", "app.js")));
  assert.ok(!fs.existsSync(path.join(dir, "src", "app.ts")));
  assert.match(read(dir, "src", "app.js"), /@ts-check/);
  assert.match(read(dir, "index.html"), /<title>Ts App<\/title>/);
});

test("scaffold(minimal) is two flat files using the CDN, no install", () => {
  const dir = path.join(tmp(), "tiny");
  scaffold({ name: "tiny", template: "minimal", targetDir: dir });
  assert.ok(fs.existsSync(path.join(dir, "index.html")));
  assert.ok(fs.existsSync(path.join(dir, "app.js"))); // flat — no src/ folder
  assert.ok(!fs.existsSync(path.join(dir, "package.json"))); // no install needed
  assert.ok(!fs.existsSync(path.join(dir, "dev-server.mjs")));
  assert.match(read(dir, "index.html"), /esm\.sh\/@zoijs\/core@1/); // CDN, major-pinned
  assert.match(read(dir, "index.html"), /<title>Tiny<\/title>/);
});

test("scaffold(library) is a publishable @zoijs/core-based package", () => {
  const dir = path.join(tmp(), "my-lib");
  scaffold({ name: "my-lib", template: "library", targetDir: dir });
  const pkg = JSON.parse(read(dir, "package.json"));
  assert.equal(pkg.name, "my-lib");
  assert.ok(!pkg.private); // meant to be published
  assert.deepEqual(Object.keys(pkg.peerDependencies), ["@zoijs/core"]);
  assert.ok(pkg.exports["."].types);
  assert.ok(fs.existsSync(path.join(dir, "src", "index.js")));
  assert.ok(fs.existsSync(path.join(dir, "src", "index.d.ts")));
  assert.ok(fs.existsSync(path.join(dir, "tests", "index.test.js")));
  // imports only the core's public API
  assert.match(read(dir, "src", "index.js"), /from "@zoijs\/core"/);
});

test("no generated template file references port 3000", () => {
  for (const template of TEMPLATES) {
    const dir = path.join(tmp(), template);
    scaffold({ name: "x", template, targetDir: dir });
    for (const file of walk(dir)) {
      assert.ok(!read(file).includes("3000"), `${path.relative(dir, file)} should not reference port 3000`);
    }
  }
});

test("scaffold rejects an unknown template", () => {
  const dir = path.join(tmp(), "x");
  assert.throws(() => scaffold({ name: "x", template: "nope", targetDir: dir }), /Unknown template/);
});

test("the default template is one of the known templates", () => {
  assert.ok(TEMPLATES.includes(DEFAULT_TEMPLATE));
});
