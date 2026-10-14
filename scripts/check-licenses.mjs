// check-licenses.mjs — license gate over every committed package-lock.json (direct AND transitive).
//
// Offline and dependency-free: npm lockfiles (v2/v3) record each installed package's declared
// `license`, so this needs no registry access and no scanning tool. Policy: scripts/dependency-policy.json.
//   - A license (or SPDX expression) must be allowed: `A OR B` needs one allowed side, `A AND B` all.
//   - Otherwise it needs a reviewed exception for that lockfile + package (globs with a trailing *).
//   - A missing license fails, except first-party links (the monorepo's own @zoijs packages).
//   - An exception that no longer matches anything fails too, so the policy can't silently go stale.
//
// Run with `node scripts/check-licenses.mjs` (wired into `npm run test:deps`).

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(readFileSync(join(root, "scripts", "dependency-policy.json"), "utf8")).licenses;

/** Directories (relative to the repo) holding a committed package-lock.json. */
export function lockfileDirs(dir = root, out = []) {
  if (existsSync(join(dir, "package-lock.json"))) out.push(relative(root, dir) || ".");
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") lockfileDirs(join(dir, e.name), out);
  }
  return out.sort();
}

/** Is an SPDX expression satisfied by the allowed list? Handles AND / OR and one level of parentheses. */
export function allowedExpression(expr, allowed) {
  const e = expr.trim().replace(/^\((.*)\)$/, "$1");
  if (/\sOR\s/.test(e)) return e.split(/\s+OR\s+/).some((x) => allowedExpression(x, allowed));
  if (/\sAND\s/.test(e)) return e.split(/\s+AND\s+/).every((x) => allowedExpression(x, allowed));
  return allowed.includes(e);
}

const globMatch = (pattern, name) => (pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : pattern === name);

export function checkLicenses({ dirs = lockfileDirs(), read = (d) => JSON.parse(readFileSync(join(root, d, "package-lock.json"), "utf8")), rules = policy } = {}) {
  const problems = [];
  const used = new Set();
  let count = 0;
  for (const dir of dirs) {
    const lock = read(dir);
    for (const [path, entry] of Object.entries(lock.packages ?? {})) {
      if (!path.includes("node_modules/")) continue; // "" is the project itself; "../x" are link targets
      if (entry.link) continue; // a first-party link (e.g. node_modules/@zoijs/core → ../framework)
      const name = path.slice(path.lastIndexOf("node_modules/") + 13);
      count++;
      const license = typeof entry.license === "string" ? entry.license : null;
      if (license && allowedExpression(license, rules.allowed)) continue;
      const ex = rules.exceptions.findIndex((x) => x.lockfile === dir && globMatch(x.package, name) && x.license === license);
      if (ex >= 0) {
        used.add(ex);
        continue;
      }
      problems.push(`${dir}: ${name}@${entry.version ?? "?"} — ${license ? `license "${license}" is not allowed` : "no license declared"}${entry.dev ? " (dev)" : ""}`);
    }
  }
  rules.exceptions.forEach((x, i) => {
    if (!used.has(i)) problems.push(`stale exception: ${x.lockfile}: ${x.package} (${x.license}) matches nothing — remove it`);
  });
  return { problems, count, dirs: dirs.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { problems, count, dirs } = checkLicenses();
  if (problems.length) {
    console.error(`✖ license check: ${problems.length} problem(s) in ${dirs} lockfiles (policy: scripts/dependency-policy.json)`);
    for (const p of problems) console.error("  - " + p);
    console.error("Fix: replace the dependency, or add a reviewed exception with a reason.");
    process.exit(1);
  }
  console.log(`✔ licenses: ${count} installed packages in ${dirs} lockfiles comply with scripts/dependency-policy.json`);
}
