// @zoijs/build — an OPTIONAL production build for Zoijs apps. Experimental (0.x).
//
// Zoijs apps run unbuilt: plain ES modules and an import map, in development and in production.
// This package is for apps that also want a bundled production build — fewer requests, no module
// waterfall, content-hashed files cached forever. It drives esbuild (a peer dependency); it is
// not a bundler of its own, and it doesn't touch your HTML, your host or your CSP:
//
//   build(options)        bundle entry points into <outDir>/<assetsDir>/, hashed, verified,
//                         and write a manifest. Fails closed: on any error nothing is left there.
//   htmlTags(result)      the <link>/<script> tags to put in your page.
//   stripImportMap(html)  remove (and return) a page's import map — a bundle doesn't need one.
//   inlineScripts(html)   a page's inline scripts, classified, with CSP sha256 sources;
//   scriptHashes(html)    just the CSP sources for the executable ones.
//
// What build() guarantees for the files it emits (each failure is a BuildError listing every
// problem, with the file and what to do):
//   - Zoijs packages resolve to their production entries (the "production" export condition).
//   - Only allowed packages are bundled (package.json dependencies, or an import map's names);
//     nothing is left external, and no computed import() survives (it would 404 at runtime).
//   - No eval / new Function (strict CSP), no source maps or sourceMappingURL in public output
//     (private maps go to sourceMapsDir, which must be outside outDir), no build-machine paths,
//     no obvious credentials, no .env/key files among the inputs.
//   - With an import map: every bundled package is the version the map pins and every bundled
//     file matches the map's integrity hash — the bundle runs the same bytes as the import map.
//   - Same inputs, same output: names are content hashes; the manifest is sorted, undated.
// Static checks can't prove what code does at run time: keep browser tests under your real CSP
// and Trusted Types policy.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promote, recover } from "./promote.js";

export const IMMUTABLE = "public, max-age=31536000, immutable";

export class BuildError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(`@zoijs/build: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n  - ${problems.join("\n  - ")}`);
    this.name = "BuildError";
    this.problems = problems;
  }
}

const SECRETS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key ID"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{60,}\b/, "a GitHub token"],
  [/\bnpm_[A-Za-z0-9]{36}\b/, "an npm token"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\b[rs]k_live_[A-Za-z0-9]{16,}/, "a Stripe live key"],
];
const SECRET_FILES = /(^|[\\/])(\.env(\.[^\\/]*)?|[^\\/]+\.(pem|key|p12|pfx)|id_(rsa|ecdsa|ed25519))$/;

const toUrlPath = (p) => p.split(sep).join("/");
const inside = (base, p) => {
  const r = relative(base, p);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
};
const sha = (alg, data, enc = "base64") => createHash(alg).update(data).digest(enc);
const packageOf = (spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

/**
 * @param {import("./index.d.ts").BuildOptions} options
 * @returns {Promise<import("./index.d.ts").BuildResult>}
 */
export async function build(options = {}) {
  // Real paths throughout: esbuild resolves symlinks (macOS's /var → /private/var, a symlinked
  // checkout), and its metafile paths must line up with ours.
  const givenRoot = resolve(options.root ?? process.cwd());
  const root = realish(givenRoot);
  const problems = [];

  // ---- options --------------------------------------------------------------------------------
  const entryPoints = options.entryPoints;
  if (!Array.isArray(entryPoints) || entryPoints.length === 0 || entryPoints.some((e) => typeof e !== "string")) {
    problems.push('entryPoints: give at least one entry module, relative to root (e.g. ["src/main.js"])');
  }
  if (typeof options.outDir !== "string" || !options.outDir) problems.push('outDir: required (e.g. "dist")');
  const outDir = realish(resolve(root, options.outDir ?? ""));
  const assetsDir = options.assetsDir ?? "assets";
  const assets = resolve(outDir, assetsDir);
  if (!assetsDir || !inside(outDir, assets) || assets === outDir) problems.push(`assetsDir: "${assetsDir}" must be a subdirectory of outDir`);
  const publicPath = options.publicPath ?? `/${toUrlPath(assetsDir)}/`;
  if (!publicPath.endsWith("/")) problems.push(`publicPath: "${publicPath}" must end with "/"`);
  const mapsDir = options.sourceMapsDir == null ? null : realish(resolve(root, options.sourceMapsDir));
  if (mapsDir && (inside(outDir, mapsDir) || inside(mapsDir, outDir))) {
    problems.push(`sourceMapsDir: "${options.sourceMapsDir}" must be outside outDir — anything in outDir is public`);
  }
  for (const e of Array.isArray(entryPoints) ? entryPoints : []) {
    if (typeof e === "string" && !existsSync(resolve(root, e))) problems.push(`entryPoints: ${e} doesn't exist (relative to ${root})`);
  }
  const manifestFile = options.manifest === false ? null : resolve(outDir, options.manifest ?? "asset-manifest.json");
  if (manifestFile && (inside(assets, manifestFile) || !inside(outDir, manifestFile))) {
    problems.push(`manifest: "${options.manifest}" must be in outDir and outside assetsDir (it describes the assets; it isn't one)`);
  }
  const cssFiles = options.css ?? [];
  for (const c of cssFiles) if (!existsSync(resolve(root, c))) problems.push(`css: ${c} doesn't exist`);
  const cssName = options.cssName ?? "app";
  if (!/^[\w-]+$/.test(cssName)) problems.push(`cssName: "${cssName}" — letters, digits, "_" and "-" only`);

  // Packages a bare import may reach: the import map's names, or package.json dependencies.
  let allowed = options.allowedPackages;
  const importMap = options.importMap ?? null;
  if (!allowed) {
    if (importMap) allowed = Object.keys(importMap.imports ?? {}).map(packageOf);
    else {
      try {
        const pj = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
        allowed = Object.keys({ ...pj.dependencies, ...pj.peerDependencies });
      } catch {
        problems.push("allowedPackages: no package.json in root to read dependencies from — pass allowedPackages");
      }
    }
  }
  if (problems.length) throw new BuildError(problems);

  let esbuild = options.esbuild;
  if (!esbuild) {
    try {
      esbuild = await import("esbuild");
    } catch {
      throw new BuildError(["esbuild isn't installed. It's a peer dependency: npm install --save-dev --save-exact esbuild@0.28"]);
    }
  }

  // ---- build into a staging directory; promote it only when everything passed -------------------
  // A failed build never touches the live assets or manifest; promotion replaces them as a pair and
  // restores the previous pair if it fails (src/promote.js).
  const id = randomBytes(4).toString("hex");
  const staging = `${assets}.staging-${id}`;
  const urlOf = (file) => publicPath + toUrlPath(relative(staging, file));
  await mkdir(dirname(staging), { recursive: true });
  const recovered = await recover(assets, manifestFile); // an earlier run was interrupted mid-promotion
  let built;
  try {
    const restrict = {
      name: "zoijs-build-allowed-packages",
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (/^[a-z][a-z0-9+.-]*:/i.test(args.path)) return; // URLs: left external, reported below
          if (allowed.includes(packageOf(args.path))) return; // resolved by esbuild as usual
          return { errors: [{ text: `"${args.path}" isn't an allowed package — add it to package.json dependencies${importMap ? " / the import map" : ""}, or to allowedPackages` }] };
        });
        // Before any loader runs, so the reason is ours rather than "no loader for .env".
        b.onLoad({ filter: SECRET_FILES }, (args) => ({
          errors: [{ text: `${toUrlPath(relative(root, args.path))} is imported — it looks like a credentials file. Don't import it from client code.` }],
        }));
      },
    };
    let result;
    try {
      result = await esbuild.build({
        absWorkingDir: root,
        entryPoints,
        outdir: staging,
        bundle: true,
        splitting: true, // dynamic import()s become their own chunks
        format: "esm",
        platform: "browser",
        target: options.target ?? "es2022",
        conditions: ["production"],
        minify: true,
        legalComments: "eof",
        entryNames: "[name]-[hash]",
        chunkNames: "chunk-[hash]",
        sourcemap: mapsDir ? "external" : false, // external: no sourceMappingURL in the public file
        sourcesContent: true,
        metafile: true,
        logLevel: "silent",
        plugins: [restrict],
      });
    } catch (err) {
      throw new BuildError(describe(err.errors ?? [], err));
    }
    for (const w of result.warnings) if (w.id === "direct-eval") problems.push(at(w) + "uses eval — not allowed under a strict CSP (no 'unsafe-eval'). Remove it.");

    const outputs = result.metafile.outputs;
    const abs = (p) => resolve(root, p);

    // Outputs: imports, code, secrets, paths.
    for (const [out, o] of Object.entries(outputs)) {
      if (out.endsWith(".map")) continue;
      for (const i of o.imports) {
        if (i.external) problems.push(`${toUrlPath(relative(staging, abs(out)))} imports "${i.path}" at run time — a bundle must be self-contained. Install the package (or vendor the file) and import it by name.`);
      }
      const code = await readFile(abs(out), "utf8");
      const where = (m) => `${urlOf(abs(out))}: …${code.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")}…`;
      for (const m of code.matchAll(/\bnew\s+Function\s*\(/g)) problems.push(`${where(m)} — new Function is eval: not allowed under a strict CSP. Remove it.`);
      if (!options.allowComputedImports) {
        // esbuild turns string and prefix-template imports into chunks (globs); what survives with
        // anything but a string literal (or "import()" in prose) is a specifier it couldn't see.
        for (const m of code.matchAll(/\bimport\(\s*(?!["')])/g)) {
          problems.push(`${where(m)} — a computed import() can't be bundled and would 404. Import each module with a string literal (import("./page.js")); if this is text, not code, pass allowComputedImports: true.`);
        }
      }
      if (/sourceMappingURL=/.test(code)) problems.push(`${urlOf(abs(out))} has a sourceMappingURL comment — public output must not point at source maps.`);
      if ([root, givenRoot].some((r) => code.includes(r) || code.includes(toUrlPath(r)))) problems.push(`${urlOf(abs(out))} contains this machine's path (${root}) — the output would differ per machine and leak it.`);
      for (const [re, what] of SECRETS) {
        const m = re.exec(code);
        if (m) problems.push(`${urlOf(abs(out))} contains what looks like ${what}. Never ship credentials to the browser: remove it from the source and rotate it.`);
      }
    }

    // Import map: same versions, same bytes.
    if (importMap) problems.push(...(await verifyAgainstImportMap(root, importMap, Object.keys(result.metafile.inputs))));
    if (problems.length) throw new BuildError(problems);

    // Stylesheets, in order, as one minified, content-hashed file.
    let css = null;
    if (cssFiles.length) {
      let text = "";
      for (const c of cssFiles) text += (await readFile(resolve(root, c), "utf8")) + "\n";
      let code, warnings;
      try {
        ({ code, warnings } = await esbuild.transform(text, { loader: "css", minify: true, target: options.target ?? "es2022" }));
      } catch (err) {
        throw new BuildError(describe(err.errors ?? [], err).map((p) => `css: ${p}`));
      }
      // esbuild accepts broken CSS with a warning; a production stylesheet shouldn't be broken.
      if (warnings.length) throw new BuildError(warnings.map((w) => `css (${cssFiles.join(" + ")}, concatenated): line ${w.location?.line ?? "?"}: ${w.text}`));
      const file = join(staging, `${cssName}-${sha("sha256", code, "hex").slice(0, 10)}.css`);
      await writeFile(file, code);
      css = file;
    }

    // Private source maps leave the public directory before it goes live.
    for (const f of await walk(staging)) {
      if (!f.endsWith(".map")) continue;
      if (mapsDir) {
        const target = join(mapsDir, assetsDir, relative(staging, f));
        await mkdir(dirname(target), { recursive: true });
        await cp(f, target); // copy + remove, not rename: mapsDir may be on another filesystem
      }
      await rm(f);
    }

    const files = [];
    for (const f of (await walk(staging)).sort()) {
      const data = await readFile(f);
      files.push({ url: urlOf(f), bytes: data.length, integrity: `sha384-${sha("sha384", data)}` });
    }
    // esbuild names entries relative to root with "/" ("./src/main.js" → "src/main.js").
    const asGiven = new Map(entryPoints.map((e) => [toUrlPath(relative(root, resolve(root, e))), e]));
    const entries = {};
    for (const [out, o] of Object.entries(outputs)) {
      if (!o.entryPoint || !asGiven.has(o.entryPoint)) continue;
      const imports = (kind) => o.imports.filter((i) => i.kind === kind).map((i) => urlOf(abs(i.path))).sort();
      entries[asGiven.get(o.entryPoint)] = { url: urlOf(abs(out)), imports: imports("import-statement"), dynamicImports: imports("dynamic-import") };
    }
    const manifest = {
      version: 1,
      // Identifies this exact set of files: a manifest and an assets directory belong together
      // when every file's integrity matches (and so this id).
      buildId: sha("sha256", files.map((f) => `${f.url} ${f.integrity}`).join("\n"), "hex").slice(0, 16),
      publicPath,
      entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : 1))),
      css: css ? urlOf(css) : null,
      files,
      cache: [{ path: `${publicPath}*`, cacheControl: IMMUTABLE }],
      csp: { "script-src": ["'self'"], "style-src": ["'self'"] },
    };
    built = { manifest, css, metafile: result.metafile };
  } catch (err) {
    // The build failed before going live: discard it, and leave the last good build as it was.
    await rm(staging, { recursive: true, force: true });
    throw err;
  }

  const { manifest, css } = built;
  try {
    await promote({ staging, assets, manifestFile, manifestText: JSON.stringify(manifest, null, 2) + "\n", id, keepPrevious: !!options.keepPrevious });
  } catch (err) {
    throw new BuildError([`promoting the build failed (${err.code ?? err.message}); the previous build was restored — check permissions and free space in ${dirname(assets)}`]);
  }
  return {
    ...manifest,
    outDir,
    assetsDir: assets,
    manifestFile,
    css: css ? { url: urlOf(css), file: join(assets, relative(staging, css)) } : null,
    metafile: relocate(built.metafile, toUrlPath(relative(root, staging)), toUrlPath(relative(root, assets))),
    recovered,
  };
}

/** The tags that load an entry: its stylesheet, modulepreload for its static chunks, the script. */
export function htmlTags(result, { entry } = {}) {
  const key = entry ?? Object.keys(result.entries)[0];
  const e = result.entries[key];
  if (!e) throw new BuildError([`htmlTags: no entry "${key}" (built: ${Object.keys(result.entries).join(", ")})`]);
  return [
    ...(result.css ? [`<link rel="stylesheet" href="${typeof result.css === "string" ? result.css : result.css.url}" />`] : []),
    ...e.imports.map((u) => `<link rel="modulepreload" href="${u}" />`),
    `<script type="module" src="${e.url}"></script>`,
  ];
}

/**
 * Every <script> element outside comments, by a single linear scan (no backtracking regex over the
 * page). Ends follow the HTML parser: a comment ends at the first "-->"; a script's content ends
 * at the first "</script" followed by whitespace, "/" or ">" (or at the end of the page).
 */
function findScripts(html) {
  const lower = html.toLowerCase();
  const out = [];
  let i = 0;
  let comment = lower.indexOf("<!--"); // next comment start; searched again only once passed
  while (i < html.length) {
    if (comment !== -1 && comment < i) comment = lower.indexOf("<!--", i);
    const tag = lower.indexOf("<script", i);
    if (tag === -1) break;
    if (comment !== -1 && comment < tag) {
      const close = lower.indexOf("-->", comment + 4);
      if (close === -1) break; // the rest of the page is a comment
      i = close + 3;
      continue;
    }
    if (!/[\s/>]/.test(html[tag + 7] ?? "")) {
      i = tag + 7; // <scripts>, <script-x>: not a script tag
      continue;
    }
    // The start tag ends at the first ">" outside a quoted attribute value.
    let j = tag + 7;
    let quote = null;
    for (; j < html.length; j++) {
      const c = html[j];
      if (quote) quote = c === quote ? null : quote;
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    if (j >= html.length) break;
    const contentStart = j + 1;
    let contentEnd = html.length;
    let end = html.length;
    for (let k = lower.indexOf("</script", contentStart); k !== -1; k = lower.indexOf("</script", k + 8)) {
      if (k + 8 >= html.length || /[\s/>]/.test(html[k + 8])) {
        contentEnd = k;
        const gt = html.indexOf(">", k + 8);
        end = gt === -1 ? html.length : gt + 1;
        break;
      }
    }
    out.push({ start: tag, end, attrs: html.slice(tag + 7, j), content: html.slice(contentStart, contentEnd) });
    i = end;
  }
  return out;
}

/** Remove a page's import map. Returns the page without it and the parsed map (or null). */
export function stripImportMap(html) {
  const found = findScripts(html).filter((m) => /\btype\s*=\s*["']?importmap["']?/i.test(m.attrs));
  if (found.length > 1) throw new BuildError([`stripImportMap: ${found.length} import maps in one page — a page may have only one`]);
  if (!found.length) return { html, importMap: null };
  const m = found[0];
  let importMap;
  try {
    importMap = JSON.parse(m.content);
  } catch (err) {
    throw new BuildError([`stripImportMap: the import map isn't valid JSON (${err.message})`]);
  }
  const start = html.lastIndexOf("\n", m.start - 1) + 1; // take the whole line when the tag is alone on it
  const lineStart = /^[ \t]*$/.test(html.slice(start, m.start)) ? start : m.start;
  const lineEnd = html[m.end] === "\n" && lineStart === start ? m.end + 1 : m.end;
  return { html: html.slice(0, lineStart) + html.slice(lineEnd), importMap };
}

/**
 * The page's inline scripts (no src), classified. `executable` ones — classic, module, importmap —
 * are governed by CSP script-src and need their `hash` there; data blocks (JSON-LD, …) don't.
 */
export function inlineScripts(html) {
  const out = [];
  for (const m of findScripts(html)) {
    if (/\bsrc\s*=/i.test(m.attrs)) continue;
    const type = (m.attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? "").toLowerCase();
    const kind = !type || /^(text|application)\/(java|ecma)script$/.test(type) ? "classic" : type === "module" ? "module" : type === "importmap" ? "importmap" : "data";
    out.push({ kind, executable: kind !== "data", hash: `'sha256-${sha("sha256", m.content)}'`, bytes: Buffer.byteLength(m.content) });
  }
  return out;
}

/** CSP script-src sources ('sha256-…') for the page's executable inline scripts, unique, in order. */
export function scriptHashes(html) {
  return [...new Set(inlineScripts(html).filter((s) => s.executable).map((s) => s.hash))];
}

// ---- internals ------------------------------------------------------------------------------------

/** The real path of `p`, even if it doesn't exist yet (its nearest existing ancestor, resolved). */
function realish(p) {
  let base = p;
  const rest = [];
  while (!existsSync(base)) {
    const up = dirname(base);
    if (up === base) return p;
    rest.unshift(basename(base));
    base = up;
  }
  return join(realpathSync.native(base), ...rest);
}

function at(msg) {
  const l = msg.location;
  return l ? `${l.file}:${l.line}:${l.column + 1}: ` : "";
}

function describe(messages, err) {
  if (!messages.length) return [String(err?.message ?? err)];
  return messages.map((m) => {
    const text = m.text;
    const hint = /^Could not resolve "([^"]+)"/.exec(text);
    if (hint && !hint[1].startsWith(".")) return `${at(m)}${text} — is "${packageOf(hint[1])}" installed? Run npm install.`;
    if (hint) return `${at(m)}${text} — check the path (relative imports need the file extension).`;
    return at(m) + text;
  });
}

/**
 * Every bundled file of an import-mapped package must be what the map pins: the installed version
 * equals the map URL's version, and the file matches the map's integrity hash for its URL.
 * URLs are read as <origin>/npm/<name>@<version>/<path> (jsDelivr) or <origin>/<name>@<version>/<path>.
 */
async function verifyAgainstImportMap(root, map, inputs) {
  const problems = [];
  const pins = {}; // package → { version, base URL }
  for (const [spec, url] of Object.entries(map.imports ?? {})) {
    const m = /^(https?:\/\/[^/]+\/(?:npm\/)?)((?:@[^/@]+\/)?[^/@]+)@([^/]+)\//.exec(url);
    if (!m) {
      problems.push(`importMap: "${spec}" → ${url} isn't a versioned package URL (…/<name>@<version>/…) — can't verify it`);
      continue;
    }
    pins[m[2]] = { version: m[3], base: `${m[1]}${m[2]}@${m[3]}/` };
  }
  const integrity = map.integrity ?? {};
  for (const [name, pin] of Object.entries(pins)) {
    let installed;
    try {
      installed = JSON.parse(await readFile(join(root, "node_modules", ...name.split("/"), "package.json"), "utf8")).version;
    } catch {
      problems.push(`importMap pins ${name}@${pin.version}, but it isn't installed — run npm install`);
      continue;
    }
    if (installed !== pin.version) problems.push(`importMap pins ${name}@${pin.version}, but node_modules has ${installed} — install exactly ${pin.version}`);
  }
  for (const input of inputs) {
    const m = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\/(.+)$/.exec(input);
    if (!m || !pins[m[1]]) continue;
    const url = pins[m[1]].base + m[2];
    const want = integrity[url];
    if (!want) {
      problems.push(`importMap has no integrity hash for ${url} — regenerate the map with integrity for every module`);
      continue;
    }
    const [alg] = want.split("-");
    const got = `${alg}-${sha(alg, await readFile(resolve(root, input)))}`;
    if (got !== want) problems.push(`${input} doesn't match the import map's integrity for ${url} (${got} ≠ ${want}) — the bundle would run different code than the import map`);
  }
  return problems;
}

/**
 * esbuild's metafile names outputs by their staging path; give them their final one. Source maps
 * are left out: they never go live (they're in sourceMapsDir, or gone).
 */
function relocate(metafile, from, to) {
  const fix = (p) => (p === from || p.startsWith(from + "/") ? to + p.slice(from.length) : p);
  const outputs = {};
  for (const [out, o] of Object.entries(metafile.outputs)) {
    if (out.endsWith(".map")) continue;
    outputs[fix(out)] = { ...o, imports: o.imports.map((i) => (i.external ? i : { ...i, path: fix(i.path) })) };
  }
  return { ...metafile, outputs };
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
