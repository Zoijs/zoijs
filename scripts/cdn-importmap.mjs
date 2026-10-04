// cdn-importmap.mjs — build an exact-version, integrity-protected import map for
// loading published @zoijs/* packages from jsDelivr (SEC-7).
//
//   node scripts/cdn-importmap.mjs @zoijs/core@1.8.0 [@zoijs/router@0.5.0 …] [--prod]
//   node scripts/cdn-importmap.mjs @zoijs/core@1.8.0 --write create/core-cdn.json
//   node scripts/cdn-importmap.mjs --check create/core-cdn.json
//
// Why jsDelivr: it serves the exact files of the published npm tarball, unmodified and
// immutably cached, so a sha384 of the tarball file is valid for the CDN response (a
// build service like esm.sh rewrites modules, so its bytes can't be pinned).
// Hashes are computed from the version-pinned tarball fetched with `npm pack` (whose
// own sha512 npm verifies against the registry) — never from a mutable URL. Every
// module in each entry's graph gets an entry: browsers apply import-map integrity to
// any module fetch whose URL is listed, including relative imports.
// `--prod` maps @zoijs/core to its production entry (src/prod.js) instead of index.js.
// `--unsafe` also maps "@zoijs/core/unsafe" (the opt-in raw-HTML escape hatch, src/unsafe.js)
// with integrity — only for apps that use unsafeHTML(); default maps never include it.
// Public core subpaths a package imports in the browser ("@zoijs/core/server" from
// @zoijs/sanitize and @zoijs/ssr's hydrate, "@zoijs/core/devtools" from @zoijs/devtools) are
// found in its module graph and mapped automatically — to the exact file core exports for
// them, with integrity for that file's whole graph. Such a package needs @zoijs/core in the
// same command, so both come from one pinned core version.

import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname, posix } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const CDN = "https://cdn.jsdelivr.net/npm/";
const EXACT = /^(@zoijs\/[a-z0-9-]+|create-zoijs)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

/** Download and unpack an exact published version; returns the package dir. */
function fetchPackage(spec, work) {
  const dir = mkdtempSync(join(work, "pkg-"));
  const [{ filename }] = JSON.parse(execFileSync("npm", ["pack", spec, "--json", "--silent", "--pack-destination", dir], { encoding: "utf8" }));
  execFileSync("tar", ["xzf", join(dir, filename), "-C", dir]);
  return join(dir, "package");
}

const sri = (buf) => "sha384-" + createHash("sha384").update(buf).digest("base64");

/** Bare "@zoijs/core/<subpath>" specifiers the given package files import. */
function coreSubpaths(pkgDir, files) {
  const subs = new Set();
  for (const f of files) {
    const src = readFileSync(join(pkgDir, f), "utf8").replace(/^\s*\/\/.*$/gm, "");
    for (const m of src.matchAll(/(?:import|export)\s*(?:[^'"]*?\sfrom\s*)?["'](@zoijs\/core\/[\w-]+)["']/g)) subs.add(m[1]);
  }
  return subs;
}

/** Every module reachable from `entry` through static relative imports. */
function graph(pkgDir, entry) {
  const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = readFileSync(join(pkgDir, rel), "utf8").replace(/^\s*\/\/.*$/gm, "");
    for (const m of src.matchAll(/(?:import|export)\s*(?:[^'"]*?\sfrom\s*)?["'](\.{1,2}\/[^"']+)["']/g)) {
      visit(posix.normalize(posix.join(posix.dirname(rel), m[1])));
    }
  };
  visit(entry);
  return [...seen].sort();
}

export function buildImportMap(specs, { prod = false, unsafe = false } = {}) {
  const work = mkdtempSync(join(tmpdir(), "zoijs-cdn-"));
  try {
    const imports = {};
    const integrity = {};
    const packages = {};
    const needed = new Map(); // "@zoijs/core/server" → [packages that import it]
    let core = null; // { dir, base, pkg } of the @zoijs/core in this map
    for (const spec of specs) {
      const m = EXACT.exec(spec);
      if (!m) throw new Error(`exact version required (e.g. @zoijs/core@1.8.0), got "${spec}"`);
      const [, name, version] = m;
      const dir = fetchPackage(spec, work);
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      const root = pkg.exports?.["."];
      let entry = (typeof root === "string" ? root : root?.default || pkg.main || "index.js").replace(/^\.\//, "");
      const entries = [entry];
      if (name === "@zoijs/core" && existsSync(join(dir, "src/prod.js"))) {
        entries.push("src/prod.js");
        if (prod) entry = "src/prod.js";
      } else if (prod && name === "@zoijs/core") {
        throw new Error(`@zoijs/core@${version} has no production entry (src/prod.js)`);
      }
      const base = `${CDN}${name}@${version}/`;
      imports[name] = base + entry;
      if (unsafe && name === "@zoijs/core") {
        if (!existsSync(join(dir, "src/unsafe.js"))) throw new Error(`@zoijs/core@${version} has no @zoijs/core/unsafe entry (src/unsafe.js)`);
        entries.push("src/unsafe.js");
        imports["@zoijs/core/unsafe"] = base + "src/unsafe.js";
      }
      const files = [...new Set(entries.flatMap((e) => graph(dir, e)))].sort();
      for (const f of files) integrity[base + f] = sri(readFileSync(join(dir, f)));
      packages[name] = { version, entries, files: files.length };
      if (name === "@zoijs/core") core = { dir, base, pkg, version };
      else for (const sub of coreSubpaths(dir, files)) needed.set(sub, [...(needed.get(sub) || []), name]);
    }
    for (const [sub, users] of needed) {
      if (!core) throw new Error(`${users.join(", ")} import${users.length > 1 ? "" : "s"} ${sub} — add @zoijs/core@<version> to the command`);
      const target = core.pkg.exports?.["." + sub.slice("@zoijs/core".length)];
      const file = (typeof target === "string" ? target : target?.default || "").replace(/^\.\//, "");
      if (!file) throw new Error(`@zoijs/core@${core.version} has no "${sub}" export (needed by ${users.join(", ")})`);
      imports[sub] = core.base + file;
      for (const f of graph(core.dir, file)) integrity[core.base + f] = sri(readFileSync(join(core.dir, f)));
      packages["@zoijs/core"].subpaths = [...(packages["@zoijs/core"].subpaths || []), sub].sort();
    }
    return { imports, integrity: Object.fromEntries(Object.entries(integrity).sort()), packages };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ---- CLI ----------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flag = (f) => args.includes(f);
  const valueOf = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const checkFile = valueOf("--check");
  const writeFile = valueOf("--write");
  if (checkFile) {
    const saved = JSON.parse(readFileSync(checkFile, "utf8"));
    const specs = Object.entries(saved.packages).map(([n, p]) => `${n}@${p.version}`);
    const fresh = buildImportMap(specs, { prod: saved.prod, unsafe: !!saved.unsafe });
    const ok = JSON.stringify(fresh.integrity) === JSON.stringify(saved.integrity) && JSON.stringify(fresh.imports) === JSON.stringify(saved.imports);
    console.log(ok ? `✔ ${checkFile} matches the published ${specs.join(", ")}` : `✖ ${checkFile} does not match the published ${specs.join(", ")} — regenerate it`);
    process.exit(ok ? 0 : 1);
  }
  const specs = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--write");
  let map;
  try {
    map = buildImportMap(specs, { prod: flag("--prod"), unsafe: flag("--unsafe") });
  } catch (err) {
    console.error(`✖ ${err.message}`);
    process.exit(1);
  }
  const out = { prod: flag("--prod"), ...(flag("--unsafe") ? { unsafe: true } : {}), ...map };
  if (writeFile) {
    writeFileSync(writeFile, JSON.stringify(out, null, 2) + "\n");
    console.log(`✔ wrote ${writeFile} (${Object.keys(map.integrity).length} integrity entries)`);
  } else {
    process.stdout.write(JSON.stringify({ imports: map.imports, integrity: map.integrity }, null, 2) + "\n");
  }
}
