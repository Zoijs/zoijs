// release-check.mjs — validate a release before CI publishes it (SEC-5).
//
//   node scripts/release-check.mjs core-v1.9.0         # one release tag (what publish.yml runs)
//   node scripts/release-check.mjs --all               # every package at its current version
//   add --offline to skip the npm-registry checks
//
// A release tag is `<package>-v<version>` (the repo's existing convention: core-v1.8.0,
// router-v0.5.0, …). For the tagged package this verifies, and exits non-zero otherwise:
//   1. the tag names a known publishable package and matches its package.json name/version;
//   2. the package defines no npm lifecycle scripts (publishing runs nothing implicitly);
//   3. `npm pack --dry-run` contains no tests, secrets, local config or build debris;
//   4. (online) every `@zoijs/core/<subpath>` the package imports exists in the LOWEST core
//      version its peer range allows — so a release can't declare an impossible range
//      (e.g. resource/action importing @zoijs/core/internal with `^1.0.0`).
// In GitHub Actions it writes `dir`, `name` and `version` to $GITHUB_OUTPUT.

import { readFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Tag prefix → package directory. Every publishable package must be listed here.
const PACKAGES = {
  core: "framework", router: "router", resource: "resource", action: "action", head: "head",
  forms: "forms", storage: "storage", i18n: "i18n", ssr: "ssr", sanitize: "sanitize",
  testing: "testing", devtools: "devtools", "eslint-plugin": "eslint-plugin", create: "create",
};
const LIFECYCLE = ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack", "prepublish", "prepublishOnly", "publish", "postpublish"];
// Files that must never ship in a tarball.
const TEST_FILES = [
  /(^|\/)(tests?|__tests__|browser-tests|test-results|playwright-report|coverage)\//,
  /\.(test|spec)\.[cm]?[jt]s$/,
];
// create-zoijs ships project templates, and the library template includes its own
// starter test — content of the generated project, not of create-zoijs itself.
const TEMPLATE_CONTENT = { create: /^templates\// };
const FORBIDDEN = [
  /(^|\/)\.env(\.|$)/, /(^|\/)\.npmrc$/, /(^|\/)\.git\//, /(^|\/)node_modules\//,
  /\.(pem|key|p12|log|tgz)$/, /(^|\/)\.DS_Store$/,
];

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const all = args.includes("--all");
const tagArg = args.find((a) => !a.startsWith("--"));

const npm = (cwd, ...a) => execFileSync("npm", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function expectedName(prefix) {
  if (prefix === "create") return "create-zoijs";
  return `@zoijs/${prefix === "core" ? "core" : prefix}`;
}

// Lowest version a simple range allows: ^1.2.3 / ~1.2.3 / >=1.2.3 / 1.2.3.
function rangeFloor(range) {
  const m = /^\s*(?:\^|~|>=)?\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/.exec(range || "");
  return m ? m[1] : null;
}

function srcFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...srcFiles(p));
    else if (/\.[cm]?js$/.test(name)) out.push(p);
  }
  return out;
}

function check(prefix, version) {
  const problems = [];
  const dir = PACKAGES[prefix];
  if (!dir) return { problems: [`unknown package "${prefix}" (known: ${Object.keys(PACKAGES).join(", ")})`] };
  const pkg = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
  const name = expectedName(prefix);

  // 1. identity
  if (pkg.private) problems.push(`${dir}/package.json is private`);
  if (pkg.name !== name) problems.push(`package name is ${pkg.name}, tag expects ${name}`);
  if (pkg.version !== version) problems.push(`package.json version is ${pkg.version}, tag says ${version}`);

  // 2. no lifecycle scripts
  const scripts = Object.keys(pkg.scripts || {}).filter((s) => LIFECYCLE.includes(s));
  if (scripts.length) problems.push(`lifecycle scripts would run on publish: ${scripts.join(", ")}`);

  // 3. tarball contents
  let files = [];
  try {
    const [packed] = JSON.parse(npm(join(root, dir), "pack", "--dry-run", "--json", "--ignore-scripts"));
    files = packed.files.map((f) => f.path);
  } catch (err) {
    problems.push(`npm pack --dry-run failed: ${err.stderr || err.message}`);
  }
  const isTemplate = (f) => TEMPLATE_CONTENT[prefix] && TEMPLATE_CONTENT[prefix].test(f);
  const bad = files.filter((f) => FORBIDDEN.some((re) => re.test(f)) || (!isTemplate(f) && TEST_FILES.some((re) => re.test(f))));
  if (bad.length) problems.push(`tarball contains files that must not ship: ${bad.join(", ")}`);

  // 4. peer floor provides every imported core subpath
  const range = pkg.peerDependencies && pkg.peerDependencies["@zoijs/core"];
  if (range && !offline) {
    const subpaths = new Set();
    for (const f of srcFiles(join(root, dir, "src"))) {
      for (const m of readFileSync(f, "utf8").matchAll(/from\s+["']@zoijs\/core(\/[\w-]+)?["']/g)) subpaths.add(m[1] ? "." + m[1] : ".");
    }
    const floor = rangeFloor(range);
    if (!floor) problems.push(`can't read the floor of peer range "${range}"`);
    else {
      let exportsMap = null;
      try {
        exportsMap = JSON.parse(npm(root, "view", `@zoijs/core@${floor}`, "exports", "--json") || "null");
      } catch {
        problems.push(`@zoijs/core@${floor} (the floor of "${range}") is not on npm — publish core first`);
      }
      if (exportsMap) {
        const missing = [...subpaths].filter((s) => !(s in exportsMap));
        if (missing.length) {
          problems.push(`peer range "${range}" allows @zoijs/core@${floor}, which lacks ${missing.join(", ")} — raise the floor to the first core version that exports it`);
        }
      }
    }
  }
  return { dir, name, version, files, problems };
}

const targets = [];
if (all) {
  for (const [prefix, dir] of Object.entries(PACKAGES)) {
    targets.push([prefix, JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8")).version]);
  }
} else {
  const m = /^([a-z0-9-]+)-v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tagArg || "");
  if (!m) {
    console.error(`✖ expected a release tag like core-v1.9.0, got ${JSON.stringify(tagArg)}`);
    process.exit(1);
  }
  targets.push([m[1], m[2]]);
}

let failed = 0;
for (const [prefix, version] of targets) {
  const r = check(prefix, version);
  if (r.problems.length) {
    failed++;
    console.error(`✖ ${prefix}-v${version}`);
    for (const p of r.problems) console.error(`   - ${p}`);
  } else {
    console.log(`✔ ${prefix}-v${version}  ${r.name}  (${r.files.length} files)${offline ? "  [offline: registry checks skipped]" : ""}`);
    if (!all && process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `dir=${r.dir}\nname=${r.name}\nversion=${r.version}\n`);
    }
  }
}
process.exit(failed ? 1 : 0);
