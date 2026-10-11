// check-doc-pins.mjs — exact Zoijs version pins in CURRENT docs must not be stale.
//
//   node scripts/check-doc-pins.mjs                       # this repo's current docs, against npm `latest`
//   node scripts/check-doc-pins.mjs ../zoijs-site/content/md   # other docs too (files or directories)
//   node scripts/check-doc-pins.mjs --offline             # structure only (no registry)
//
// Online it also recomputes every Zoijs integrity hash in the docs' import maps from the
// published tarball (the files jsDelivr serves).
//
// A pin is an exact `@zoijs/<name>@x.y.z` (or `create-zoijs@x.y.z`) — in a jsDelivr URL, an import
// map or an `npm install` line. Run it AFTER a release is on npm (docs/releasing.md): every pin must
// then name the published `latest`. Pins can't be updated earlier, because an import map's
// integrity hashes come from the published files.
//
// release-check.mjs runs the tag-time half for the package being released: a pin may name that
// version or the current npm `latest` (the release being superseded, whose maps are regenerated
// after this publish) — anything older is stale, anything newer is a typo.
//
// Scope: current docs only — package READMEs, the root README and framework/docs/*.md. CHANGELOGs,
// RFCs and migration guides are history and never checked. A line containing `pin-ok` is skipped
// (for a deliberate historical reference).

import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { join, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PIN = /(?<![\w.-])(@zoijs\/[a-z0-9-]+|create-zoijs)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]*[0-9A-Za-z])?)(?![\w.])/g;
const DOC = /\.(md|html?)$/;

/** Every exact pin in `files`: [{ file, line, name, version }]. */
export function docPins(files) {
  const out = [];
  for (const file of files) {
    readFileSync(file, "utf8").split("\n").forEach((text, i) => {
      if (text.includes("pin-ok")) return;
      for (const m of text.matchAll(PIN)) out.push({ file, line: i + 1, name: m[1], version: m[2] });
    });
  }
  return out;
}

/** Doc files under each path (a file, or a directory searched recursively — no node_modules or dotfiles). */
export function docFiles(paths) {
  const out = [];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    if (!statSync(p).isDirectory()) {
      if (DOC.test(p)) out.push(p);
      continue;
    }
    for (const name of readdirSync(p)) if (!name.startsWith(".") && name !== "node_modules") out.push(...docFiles([join(p, name)]));
  }
  return out;
}

/** This repository's current, release-sensitive docs: the root README, every top-level package's README, framework/docs/*.md. */
export function currentDocs(root) {
  const dirs = readdirSync(root).filter((d) => !d.startsWith(".") && d !== "node_modules" && existsSync(join(root, d, "package.json")));
  const files = [join(root, "README.md"), ...dirs.map((d) => join(root, d, "README.md"))];
  const docs = join(root, "framework", "docs");
  if (existsSync(docs)) for (const f of readdirSync(docs)) if (f.endsWith(".md")) files.push(join(docs, f));
  return files.filter((f) => existsSync(f) && !/CHANGELOG\.md$/.test(f));
}

/**
 * Pins whose version isn't allowed. `allowed`: Map name → Set of acceptable versions; packages
 * not in the map aren't judged.
 */
export function stalePins(pins, allowed) {
  return pins.filter((p) => allowed.has(p.name) && !allowed.get(p.name).has(p.version));
}

/** npm's `latest` for a package, or null when it isn't published. */
export function npmLatest(name) {
  try {
    return execFileSync("npm", ["view", name, "dist-tags.latest"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() || null;
  } catch (err) {
    if (/E404|not in this registry/i.test(`${err.stderr || ""}`)) return null;
    throw err;
  }
}

// ---- import maps in docs: structure (offline) and integrity (online) -----------------------------

const JSDELIVR_ZOIJS = /https?:\/\/cdn\.jsdelivr\.net\/npm\/(@zoijs\/[a-z0-9-]+|create-zoijs)(@(?:<[^>\s]+>|[^/\s"'`)<>]*))?(\/[^\s"'`)<>]*)?/g;
// An exact version, or a documented placeholder such as `@<version>` (never a real, loose pin).
const EXACT = /^@(?:\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]*[0-9A-Za-z])?|<[^>\s]+>)$/;
const isCdn = (url) => /^https?:\/\//.test(url);
const SRI = /^sha384-[A-Za-z0-9+/]{64}$/;

/** jsDelivr Zoijs URLs that don't name an exact x.y.z version and a file: [{ file, line, url }]. */
export function floatingUrls(files) {
  const out = [];
  for (const file of files) {
    readFileSync(file, "utf8").split("\n").forEach((text, i) => {
      for (const m of text.matchAll(JSDELIVR_ZOIJS)) if (!EXACT.test(m[2] || "") || !m[3] || m[3] === "/") out.push({ file, line: i + 1, url: m[0] });
    });
  }
  return out;
}

/** Every `<script type="importmap">` in `files`: [{ file, line, map }] or [{ file, line, error }]. */
export function importMaps(files) {
  const out = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    // A map as written in a page or code block: the tag starts its line (prose that merely
    // mentions the tag, mid-sentence or inside a shell one-liner, isn't a map).
    for (const m of text.matchAll(/^[ \t]*<script type="importmap">\s*([\s\S]*?)<\/script>/gm)) {
      const line = text.slice(0, m.index).split("\n").length;
      try {
        out.push({ file, line, map: JSON.parse(m[1]) });
      } catch {
        out.push({ file, line, error: "isn't valid JSON" });
      }
    }
  }
  return out;
}

/**
 * Structural problems of one map (offline): a CDN import without integrity, a malformed hash.
 * Self-hosted paths (`/node_modules/…`, `./vendor/…`) come from your own origin and need none.
 */
export function mapProblems({ map }) {
  const problems = [];
  const integrity = map.integrity || {};
  for (const url of Object.values(map.imports || {})) if (isCdn(url) && !integrity[url]) problems.push(`${url} has no integrity`);
  for (const [url, hash] of Object.entries(integrity)) if (!SRI.test(hash)) problems.push(`malformed integrity for ${url}`);
  return problems;
}

const sri = (buf) => "sha384-" + createHash("sha384").update(buf).digest("base64");

/**
 * Integrity entries that don't match the published files (online). `readPublished(name, version,
 * file)` returns the file's bytes from the npm tarball (what jsDelivr serves), or throws.
 */
export function wrongHashes({ map }, readPublished) {
  const problems = [];
  for (const [url, hash] of Object.entries(map.integrity || {})) {
    const m = /^https:\/\/cdn\.jsdelivr\.net\/npm\/(@zoijs\/[a-z0-9-]+|create-zoijs)@(\d+\.\d+\.\d+[^/]*)\/(.+)$/.exec(url);
    if (!m) continue; // not a Zoijs file
    if (sri(readPublished(m[1], m[2], m[3])) !== hash) problems.push(`integrity for ${url} doesn't match the published file`);
  }
  return problems;
}

// Published files, one `npm pack` per name@version (the tarball jsDelivr serves).
function publishedReader(work) {
  const dirs = new Map();
  return (name, version, file) => {
    const spec = `${name}@${version}`;
    if (!dirs.has(spec)) {
      const dir = mkdtempSync(join(work, "pkg-"));
      const [{ filename }] = JSON.parse(execFileSync("npm", ["pack", spec, "--json", "--silent", "--pack-destination", dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
      execFileSync("tar", ["xzf", join(dir, filename), "-C", dir]);
      dirs.set(spec, join(dir, "package"));
    }
    return readFileSync(join(dirs.get(spec), file));
  };
}

// ---- CLI ----
//   --offline   structure only: floating URLs, unparseable maps, missing/malformed integrity.
//               No version or hash judgment (that needs the registry) — and it says so.
// Online, a registry/network failure is an error (exit 2), never a silent pass.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const offline = args.includes("--offline");
  const files = [...currentDocs(ROOT), ...docFiles(args.filter((a) => !a.startsWith("--")))];
  const at = (p) => `${relative(process.cwd(), p.file)}:${p.line}`;
  const problems = [];
  for (const f of floatingUrls(files)) problems.push(`${at(f)} ${f.url} isn't an exact-version jsDelivr file URL`);
  const maps = importMaps(files);
  for (const m of maps) for (const p of m.error ? [m.error] : mapProblems(m)) problems.push(`${at(m)} import map: ${p}`);
  const pins = docPins(files);
  if (!offline) {
    const work = mkdtempSync(join(tmpdir(), "zoijs-doc-pins-"));
    try {
      const allowed = new Map();
      for (const name of new Set(pins.map((p) => p.name))) {
        const latest = npmLatest(name);
        allowed.set(name, new Set(latest ? [latest] : []));
        if (!latest) problems.push(`${name} isn't published, but docs pin it`);
      }
      for (const p of stalePins(pins, allowed)) {
        const latest = [...allowed.get(p.name)][0];
        if (latest) problems.push(`${at(p)} pins ${p.name}@${p.version}, but npm's latest is ${latest} — regenerate it (node scripts/cdn-importmap.mjs … --prod)`);
      }
      const read = publishedReader(work);
      for (const m of maps) if (m.map) for (const p of wrongHashes(m, read)) problems.push(`${at(m)} import map: ${p}`);
    } catch (err) {
      console.error(`✖ couldn't reach the npm registry to check pins and hashes — nothing was verified online (${String(err.message).split("\n")[0]})`);
      process.exit(2);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  for (const p of problems) console.error(`✖ ${p}`);
  if (problems.length) process.exit(1);
  console.log(offline
    ? `✔ offline: ${maps.length} import map(s) well-formed, no floating URLs, in ${files.length} doc file(s) — versions and hashes NOT checked (run without --offline)`
    : `✔ ${pins.length} pin(s) match npm latest and ${maps.length} import map(s) match the published files, in ${files.length} doc file(s)`);
}
