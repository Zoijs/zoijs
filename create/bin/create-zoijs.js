#!/usr/bin/env node
// create-zoijs — a tiny scaffolder for new Zoijs apps. No build step, no
// dependencies. It copies a template, fills in the app name, and prints the
// three commands to get going. That's the whole tool — read it top to bottom.
//
// Usage:
//   npm create zoijs@latest my-app          (npm maps this to create-zoijs)
//   npx create-zoijs my-app --template basic
//
// The pure functions below are exported so they can be unit-tested; main() only
// runs when this file is executed directly (not when imported).

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TEMPLATES = ["basic", "app", "typescript", "minimal", "library"];
export const DEFAULT_TEMPLATE = "app";
const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

// ---- argument parsing --------------------------------------------------------

/** Parse argv into { name, template }. The first non-flag arg is the app name. */
export function parseArgs(argv) {
  let name;
  let template = DEFAULT_TEMPLATE;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--template" || a === "-t") template = argv[++i];
    else if (a.startsWith("--template=")) template = a.slice("--template=".length);
    else if (!a.startsWith("-") && name === undefined) name = a;
  }
  return { name, template };
}

// ---- naming ------------------------------------------------------------------

/** A readable Title Case form of a project name: "task-manager" → "Task Manager". */
export function toTitle(name) {
  return String(name)
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Validate a project name. Returns { valid, problems[] }. Keeps it npm-safe. */
export function validateName(name) {
  const problems = [];
  if (!name || !name.trim()) {
    problems.push("Project name cannot be empty.");
    return { valid: false, problems };
  }
  if (name.trim() !== name) problems.push("Project name cannot have leading or trailing spaces.");
  if (name.length > 214) problems.push("Project name must be 214 characters or fewer.");
  if (/^[._]/.test(name)) problems.push("Project name cannot start with a dot or underscore.");
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    problems.push("Project name may only contain letters, numbers, dashes, dots, and underscores.");
  }
  return { valid: problems.length === 0, problems };
}

// ---- filesystem --------------------------------------------------------------

/** Throw if the target directory exists and already has files in it. */
export function ensureTargetAvailable(targetDir) {
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    throw new Error(`Directory "${path.basename(targetDir)}" already exists and is not empty.`);
  }
}

const TEXT_EXT = new Set([".js", ".ts", ".mjs", ".html", ".css", ".json", ".md", ".txt", ".svg"]);
const isText = (file) => file === "_gitignore" || TEXT_EXT.has(path.extname(file));

function applyTokens(content, tokens) {
  return content.replaceAll("{{APP_NAME}}", tokens.APP_NAME).replaceAll("{{APP_TITLE}}", tokens.APP_TITLE);
}

function copyDir(srcDir, destDir, tokens, written) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    // npm strips a literal ".gitignore" from published packages, so templates
    // ship it as "_gitignore" and we rename it on copy.
    const destName = entry.name === "_gitignore" ? ".gitignore" : entry.name;
    const destPath = path.join(destDir, destName);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, tokens, written);
    } else if (isText(entry.name)) {
      fs.writeFileSync(destPath, applyTokens(fs.readFileSync(srcPath, "utf8"), tokens));
      written.push(destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      written.push(destPath);
    }
  }
}

/**
 * Copy a template into targetDir, substituting the app name. Pure FS work — the
 * caller decides the name/template/dirs, which makes this easy to test.
 */
export function scaffold({ name, template = DEFAULT_TEMPLATE, targetDir, templatesDir = TEMPLATES_DIR }) {
  const tplDir = path.join(templatesDir, template);
  if (!TEMPLATES.includes(template) || !fs.existsSync(tplDir)) {
    throw new Error(`Unknown template "${template}". Available templates: ${TEMPLATES.join(", ")}.`);
  }
  const tokens = { APP_NAME: name.toLowerCase(), APP_TITLE: toTitle(name) };
  const written = [];
  copyDir(tplDir, targetDir, tokens, written);
  return { written, tokens };
}

// ---- the CLI -----------------------------------------------------------------

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

const fail = (message) => { console.error(`\n✖ ${message}\n`); process.exit(1); };

async function main(argv) {
  const { name: argName, template } = parseArgs(argv);

  let name = argName;
  if (!name) name = await ask("Project name: ");

  const { valid, problems } = validateName(name);
  if (!valid) fail(problems.join("\n  "));

  const targetDir = path.resolve(process.cwd(), name);
  try {
    ensureTargetAvailable(targetDir);
  } catch (err) {
    fail(err.message);
  }

  let result;
  try {
    result = scaffold({ name, template, targetDir });
  } catch (err) {
    fail(err.message);
  }

  console.log(`\n✔ Created ${name} (${template} template) — ${result.written.length} files\n`);
  console.log("Next steps:");
  console.log(`  cd ${name}`);
  console.log("  npm install");
  console.log("  npm run dev\n");
  console.log("Zoijs works without this tool, too — it's only a convenience. See https://zoijs.dev/start\n");
}

// Run only when executed directly (resolve symlinks so the npm bin shim works).
function invokedDirectly() {
  try {
    return process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
  }
}

if (invokedDirectly()) main(process.argv.slice(2));
