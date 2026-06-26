// check-deps.mjs — supply-chain / star-topology gate.
//
// Enforces (not just documents) the rules in framework/docs/scope.md §4:
//   1. No package ships any runtime `dependencies` (zero supply-chain surface).
//   2. Each optional package depends ONLY on @zoijs/core, and only as a *peer*.
//      The core (framework) and the scaffolder (create) have no peers either.
//   3. No package's source imports any @zoijs/* package except @zoijs/core — the
//      "star": every package depends only on the public core, nothing sideways.
//
// Run with `node scripts/check-deps.mjs` (wired into the root `npm test`).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CORE = "framework"; // publishes @zoijs/core
const OPTIONAL = ["router", "resource", "head", "action", "storage", "forms", "testing", "devtools", "i18n", "ssr"];
const TOOLING = ["create"]; // create-zoijs — zero deps, no peers
const ALL = [CORE, ...OPTIONAL, ...TOOLING];

const failures = [];
const fail = (msg) => failures.push(msg);

// ---- 1 & 2: dependency manifests ------------------------------------------
for (const pkg of ALL) {
  const pj = JSON.parse(readFileSync(join(root, pkg, "package.json"), "utf8"));

  const deps = Object.keys(pj.dependencies || {});
  if (deps.length) fail(`${pkg}: has runtime dependencies (${deps.join(", ")}) — must be zero`);

  const peers = Object.keys(pj.peerDependencies || {});
  if (OPTIONAL.includes(pkg)) {
    if (peers.length !== 1 || peers[0] !== "@zoijs/core") {
      fail(`${pkg}: peerDependencies must be exactly {@zoijs/core}, got {${peers.join(", ") || "none"}}`);
    }
  } else if (peers.length) {
    fail(`${pkg}: must have no peerDependencies, got {${peers.join(", ")}}`);
  }
}

// ---- 3: the star — source imports only @zoijs/core ------------------------
function jsFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // no src/ dir — skip
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

// Collect @zoijs/* packages imported by a file, ignoring comment lines (the
// usage examples in headers reference sibling packages in prose).
function importedZoijsPkgs(file) {
  const found = new Set();
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    const m = line.match(/from\s+["']@zoijs\/([\w-]+)["']/);
    if (m) found.add(m[1]);
  }
  return found;
}

for (const pkg of [CORE, ...OPTIONAL]) {
  for (const file of jsFiles(join(root, pkg, "src"))) {
    for (const dep of importedZoijsPkgs(file)) {
      if (dep !== "core") {
        fail(`${pkg}: ${file.replace(root + "\\", "").replace(root + "/", "")} imports @zoijs/${dep} — only @zoijs/core is allowed (no sideways deps)`);
      }
    }
  }
}

// ---- report ----------------------------------------------------------------
if (failures.length) {
  console.error(`\n✖ Supply-chain check failed (${failures.length}):`);
  for (const f of failures) console.error("  - " + f);
  console.error("");
  process.exit(1);
}
console.log(
  "✔ Supply-chain check passed: zero runtime dependencies across all packages; " +
    "star topology intact (every package depends only on @zoijs/core)."
);
