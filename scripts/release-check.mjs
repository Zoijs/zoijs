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
//   4. every `@zoijs/core[/<subpath>]` import (and named export) is provided by the LOWEST core
//      version the package's peer range allows — offline from scripts/zoijs-compat.json, and
//      online by reading that version's published tarball. A package needing a capability that
//      only ships in the next, still-unversioned core release is a release BLOCKER;
//   5. no tarball file (READMEs, templates) points at a floating Zoijs CDN URL or a build service;
//   6. create-zoijs: generated apps target one exact, published core version (create/core-cdn.json)
//      at or above the security floor and every capability the templates need, whose integrity
//      map matches the published files; templates take versions only from that file.
// Blockers fail a tag release (and `--all --strict`); `--all` reports them without failing, so CI
// stays green while showing what still blocks a release.
// In GitHub Actions it writes `dir`, `name` and `version` to $GITHUB_OUTPUT.

import { readFileSync, readdirSync, statSync, appendFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const compat = JSON.parse(readFileSync(join(root, "scripts", "zoijs-compat.json"), "utf8"));

// Tag prefix → package directory. Every publishable package must be listed here.
export const PACKAGES = {
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


const npm = (cwd, ...a) => execFileSync("npm", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function expectedName(prefix) {
  if (prefix === "create") return "create-zoijs";
  return `@zoijs/${prefix === "core" ? "core" : prefix}`;
}

// Lowest version a simple range allows: ^1.2.3 / ~1.2.3 / >=1.2.3 / 1.2.3.
export function rangeFloor(range) {
  const m = /^\s*(?:\^|~|>=)?\s*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/.exec(range || "");
  return m ? m[1] : null;
}

// Compare x.y.z[-pre] versions (enough for floors; no range solving).
export function cmp(a, b) {
  const pa = a.split(/[.-]/), pb = b.split(/[.-]/);
  for (let i = 0; i < 3; i++) if (+pa[i] !== +pb[i]) return +pa[i] - +pb[i];
  return (pa.length > 3 ? -1 : 0) - (pb.length > 3 ? -1 : 0); // a prerelease sorts first
}

/** First core version providing `capability` ("subpath" or "subpath#name"); "next" or undefined. */
function requiredFor(subpath, name) {
  const caps = compat.capabilities;
  return caps[`${subpath}#${name}`] ?? caps[subpath];
}

/** Every @zoijs/core import in a package's src: [{ subpath, names[] }]. */
export function coreImports(dir) {
  const out = [];
  const src = join(root, dir, "src");
  if (!existsSync(src)) return out; // e.g. create-zoijs: no runtime source
  for (const f of srcFiles(src)) {
    const code = readFileSync(f, "utf8").replace(/^\s*(\/\/|\*).*$/gm, ""); // skip comment lines
    for (const m of code.matchAll(/(?:import|export)\s*(?:\{([^}]*)\}|\*(?:\s+as\s+\w+)?)?\s*(?:from\s*)?["'](@zoijs\/core(?:\/[\w-]+)?)["']/g)) {
      const names = (m[1] || "").split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      out.push({ subpath: m[2], names });
    }
  }
  return out;
}

/** Named exports a module file provides (export function/const/class, export { … }). */
function exportedNames(file) {
  const code = readFileSync(file, "utf8");
  const names = new Set();
  for (const m of code.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) names.add(n); }
  }
  return names;
}

// A Zoijs module URL on a CDN: build services (they rewrite code, so bytes can't be
// pinned) are never allowed; jsDelivr must name an exact x.y.z version. Badges and
// npmjs.com links aren't module loads and don't match.
const BUILD_SERVICE = /\/\/(?:esm\.sh|unpkg\.com|cdn\.skypack\.dev|jspm\.dev|ga\.jspm\.io)\/[^\s"'`)<>]*@zoijs\//;
const JSDELIVR = /\/\/cdn\.jsdelivr\.net\/npm\/@zoijs\/[a-z0-9-]+(@[^\/\s"'`)<>]*)?/g;
const floatingCdn = (line) =>
  BUILD_SERVICE.test(line) ||
  // an exact x.y.z, or a JS template expression supplying one (create-zoijs builds `@${core.version}`)
  [...line.matchAll(JSDELIVR)].some((m) => !/^@(\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?|\$\{[\w.]+\})$/.test(m[1] || ""));

function srcFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...srcFiles(p));
    else if (/\.[cm]?js$/.test(name)) out.push(p);
  }
  return out;
}

export function check(prefix, version, { offline = false } = {}) {
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

  // 4. the peer floor provides every core import (offline: compat table; online: the tarball)
  const blockers = [];
  const range = pkg.peerDependencies && pkg.peerDependencies["@zoijs/core"];
  const imports = range ? coreImports(dir) : [];
  const floor = range ? rangeFloor(range) : null;
  if (range && !floor) problems.push(`can't read the floor of peer range "${range}"`);
  if (floor) {
    for (const { subpath, names } of imports) {
      for (const n of names.length ? names : [null]) {
        const need = requiredFor(subpath, n);
        const what = n ? `${n} from ${subpath}` : subpath;
        if (need === undefined) problems.push(`imports ${what}, which scripts/zoijs-compat.json doesn't list — add its first core version`);
        else if (need === "next") {
          if (!compat.nextCore) blockers.push(`imports ${what}, which first ships in the next core release — not yet versioned. Set "nextCore" in scripts/zoijs-compat.json, then raise the @zoijs/core peer floor (now "${range}") to it`);
          else if (cmp(floor, compat.nextCore) < 0) problems.push(`imports ${what} (core ${compat.nextCore}+) but peer range "${range}" allows ${floor}`);
        } else if (cmp(floor, need) < 0) problems.push(`imports ${what} (first in core ${need}) but peer range "${range}" allows ${floor} — raise the floor to ^${need}`);
      }
    }
  }
  if (floor && !offline && !blockers.length) {
    const work = mkdtempSync(join(tmpdir(), "zoijs-floor-"));
    try {
      const [{ filename }] = JSON.parse(npm(work, "pack", `@zoijs/core@${floor}`, "--json", "--silent"));
      execFileSync("tar", ["xzf", join(work, filename), "-C", work]);
      const core = JSON.parse(readFileSync(join(work, "package", "package.json"), "utf8"));
      for (const { subpath, names } of imports) {
        const key = "." + subpath.slice("@zoijs/core".length);
        const target = core.exports?.[key];
        const file = typeof target === "string" ? target : target?.default;
        if (!file) { problems.push(`published @zoijs/core@${floor} has no "${key}" export — raise the peer floor`); continue; }
        const have = exportedNames(join(work, "package", file));
        const missing = names.filter((n) => !have.has(n));
        if (missing.length) problems.push(`published @zoijs/core@${floor} ${key} lacks ${missing.join(", ")} — raise the peer floor`);
      }
    } catch (err) {
      problems.push(`@zoijs/core@${floor} (the floor of "${range}") couldn't be fetched from npm — is it published? (${String(err.message).split("\n")[0]})`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  // 5. no floating CDN URLs in anything the tarball ships
  for (const f of files.filter((f) => /\.(md|html?|js|mjs|json)$/.test(f) && !/(^|\/)CHANGELOG\.md$/.test(f))) {
    const lines = readFileSync(join(root, dir, f), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (floatingCdn(line)) problems.push(`${f}:${i + 1} uses a floating or build-service Zoijs CDN URL — use an exact jsDelivr file URL (see docs/installation.md)`);
    });
  }

  // 6. create-zoijs: one exact, published, secure core target with a verified integrity map
  if (prefix === "create") {
    const cdn = JSON.parse(readFileSync(join(root, dir, "core-cdn.json"), "utf8"));
    const target = cdn.packages?.["@zoijs/core"]?.version;
    if (!target || !/^\d+\.\d+\.\d+$/.test(target)) problems.push(`create/core-cdn.json must target one exact @zoijs/core version`);
    else {
      if (cmp(target, compat.securityFloor) < 0) problems.push(`generated apps would target @zoijs/core ${target}, below the security floor ${compat.securityFloor}`);
      for (const cap of compat.packageRequires.create || []) {
        const need = compat.capabilities[cap];
        if (need === "next") {
          if (!compat.nextCore) blockers.push(`templates use ${cap}, which first ships in the next core release — not yet versioned. Set "nextCore", publish that core, then regenerate: node scripts/cdn-importmap.mjs @zoijs/core@<it> --write create/core-cdn.json`);
          else if (cmp(target, compat.nextCore) < 0) problems.push(`templates use ${cap} (core ${compat.nextCore}+) but target core ${target} — regenerate create/core-cdn.json`);
        } else if (cmp(target, need) < 0) problems.push(`templates use ${cap} (core ${need}+) but target core ${target}`);
      }
      const urls = Object.keys(cdn.integrity || {});
      for (const [spec, url] of Object.entries(cdn.imports || {})) if (!cdn.integrity?.[url]) problems.push(`core-cdn.json: ${spec} → ${url} has no integrity entry`);
      for (const u of urls) {
        if (!u.startsWith(`https://cdn.jsdelivr.net/npm/@zoijs/core@${target}/`)) problems.push(`core-cdn.json: ${u} is not an exact jsDelivr URL for core ${target}`);
        if (!/^sha384-[A-Za-z0-9+/]{64}$/.test(cdn.integrity[u])) problems.push(`core-cdn.json: malformed integrity for ${u}`);
      }
      if (!offline && !blockers.length) {
        try {
          execFileSync(process.execPath, [join(root, "scripts", "cdn-importmap.mjs"), "--check", join(root, dir, "core-cdn.json")], { stdio: "pipe" });
        } catch {
          problems.push(`create/core-cdn.json doesn't match the published @zoijs/core@${target} — regenerate it`);
        }
      }
    }
    // templates take every Zoijs version from core-cdn.json via tokens, never a literal
    for (const f of files.filter((f) => f.startsWith("templates/"))) {
      const text = readFileSync(join(root, dir, f), "utf8");
      if (f.endsWith("package.json")) {
        const tpl = JSON.parse(text);
        for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
          const v = tpl[field]?.["@zoijs/core"];
          if (v !== undefined && v !== "^{{ZOIJS_CORE_VERSION}}") problems.push(`${f}: ${field}["@zoijs/core"] is "${v}" — use "^{{ZOIJS_CORE_VERSION}}"`);
        }
      }
      if (/cdn\.jsdelivr\.net\/npm\/@zoijs|esm\.sh|unpkg\.com/.test(text)) problems.push(`${f}: hard-codes a CDN URL — use {{ZOIJS_CORE_IMPORTMAP}} / {{ZOIJS_CORE_CDN}}`);
    }
  }
  return { dir, name, version, files, problems, blockers };
}

// ---- CLI (only when run directly; tests import check()) ------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
const args = process.argv.slice(2);
const offline = args.includes("--offline");
const all = args.includes("--all");
const strict = args.includes("--strict");
const tagArg = args.find((a) => !a.startsWith("--"));
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
  const r = check(prefix, version, { offline });
  const blocking = !all || strict;
  if (r.problems.length || (blocking && r.blockers?.length)) {
    failed++;
    console.error(`✖ ${prefix}-v${version}`);
    for (const p of r.problems) console.error(`   - ${p}`);
    for (const b of r.blockers || []) console.error(`   - BLOCKED: ${b}`);
  } else if (r.blockers?.length) {
    console.log(`⏸ ${prefix}-v${version}  ${r.name}  release blocked:`);
    for (const b of r.blockers) console.log(`   - ${b}`);
  } else {
    console.log(`✔ ${prefix}-v${version}  ${r.name}  (${r.files.length} files)${offline ? "  [offline: registry checks skipped]" : ""}`);
    if (!all && process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `dir=${r.dir}\nname=${r.name}\nversion=${r.version}\n`);
    }
  }
}
process.exit(failed ? 1 : 0);
}
