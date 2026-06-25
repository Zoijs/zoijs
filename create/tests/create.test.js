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
});

test("scaffold(app) generates the component-communication starter", () => {
  const dir = path.join(tmp(), "my-tasks");
  scaffold({ name: "My-Tasks", template: "app", targetDir: dir });

  // structure
  assert.ok(fs.existsSync(path.join(dir, "src", "components", "Header.js")));
  assert.ok(fs.existsSync(path.join(dir, "src", "components", "TaskItem.js")));

  // package name is lowercased from "My-Tasks"
  assert.equal(JSON.parse(read(dir, "package.json")).name, "my-tasks");
  assert.match(read(dir, "index.html"), /<title>My Tasks<\/title>/);

  // demonstrates the required core features + communication patterns
  const app = read(dir, "src", "app.js");
  for (const token of ["createState", "computed", "each", "Header(", "TaskItem("]) {
    assert.ok(app.includes(token), `app.js should use ${token}`);
  }
  assert.match(read(dir, "src", "components", "TaskItem.js"), /onToggle|onDelete/); // child → parent
  // only depends on @zoijs/core
  assert.deepEqual(Object.keys(JSON.parse(read(dir, "package.json")).dependencies), ["@zoijs/core"]);
});

test("scaffold rejects an unknown template", () => {
  const dir = path.join(tmp(), "x");
  assert.throws(() => scaffold({ name: "x", template: "nope", targetDir: dir }), /Unknown template/);
});

test("the default template is one of the known templates", () => {
  assert.ok(TEMPLATES.includes(DEFAULT_TEMPLATE));
});
