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

export function buildImportMap(specs, { prod = false } = {}) {
  const work = mkdtempSync(join(tmpdir(), "zoijs-cdn-"));
  try {
    const imports = {};
    const integrity = {};
    const packages = {};
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
      const files = [...new Set(entries.flatMap((e) => graph(dir, e)))].sort();
      for (const f of files) integrity[base + f] = sri(readFileSync(join(dir, f)));
      packages[name] = { version, entries, files: files.length };
    }
    return { imports, integrity, packages };
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
    const fresh = buildImportMap(specs, { prod: saved.prod });
    const ok = JSON.stringify(fresh.integrity) === JSON.stringify(saved.integrity) && JSON.stringify(fresh.imports) === JSON.stringify(saved.imports);
    console.log(ok ? `✔ ${checkFile} matches the published ${specs.join(", ")}` : `✖ ${checkFile} does not match the published ${specs.join(", ")} — regenerate it`);
    process.exit(ok ? 0 : 1);
  }
  const specs = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--write");
  const map = buildImportMap(specs, { prod: flag("--prod") });
  const out = { prod: flag("--prod"), ...map };
  if (writeFile) {
    writeFileSync(writeFile, JSON.stringify(out, null, 2) + "\n");
    console.log(`✔ wrote ${writeFile} (${Object.keys(map.integrity).length} integrity entries)`);
  } else {
    process.stdout.write(JSON.stringify({ imports: map.imports, integrity: map.integrity }, null, 2) + "\n");
  }
}
