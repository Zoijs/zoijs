// @zoijs/build — optional production build for Zoijs apps (experimental, 0.x).

export interface ImportMap {
  imports?: Record<string, string>;
  scopes?: Record<string, Record<string, string>>;
  /** URL → "sha384-…" (as generated for the browser's import-map integrity). */
  integrity?: Record<string, string>;
}

export interface BuildOptions {
  /** Project directory; entry points, css and outDir are relative to it. Default: process.cwd(). */
  root?: string;
  /** Entry modules, e.g. ["src/main.js"]. Dynamic import()s inside them become separate chunks. */
  entryPoints: string[];
  /** Output directory (e.g. "dist"). The build owns only `<outDir>/<assetsDir>/` and the manifest. */
  outDir: string;
  /** Subdirectory of outDir for the hashed files. Default "assets". */
  assetsDir?: string;
  /** URL prefix the files are served under. Default `/${assetsDir}/`. Must end with "/". */
  publicPath?: string;
  /** Stylesheets, in cascade order, emitted as ONE minified `<cssName>-<hash>.css`. */
  css?: string[];
  /** Base name of the stylesheet. Default "app". */
  cssName?: string;
  /**
   * Verify the bundle against the import map the unbundled app uses: each pinned package must be
   * installed at exactly the pinned version, and every bundled file must match the map's integrity
   * hash. Its package names are also the allowed bare imports (unless allowedPackages is given).
   */
  importMap?: ImportMap;
  /** Packages bare imports may reach. Default: the import map's names, else package.json dependencies + peerDependencies. */
  allowedPackages?: string[];
  /** Write source maps (with sources) here — must be outside outDir. Default: no maps at all. */
  sourceMapsDir?: string;
  /** Manifest file, relative to outDir; false for none. Default "asset-manifest.json". */
  manifest?: string | false;
  /**
   * Keep the build this one replaces at `<assetsDir>.prev` (its assets and manifest; one
   * generation), e.g. so pages still open in browsers can load their old files. Default false.
   */
  keepPrevious?: boolean;
  /**
   * false: bundle @zoijs/core's lean entry, without hydration (the "zoijs-no-hydration" condition,
   * core's RFC 0011) — ~1 KB gzipped less; `mount(…, { hydrate: true })` then throws. Only for apps
   * that never hydrate server-rendered HTML. Default true. Needs @zoijs/core 1.11.0+ (older cores ignore it).
   */
  hydration?: boolean;
  /** esbuild target. Default "es2022". */
  target?: string | string[];
  /** Skip the computed-import() check — only for bundles that contain such code as TEXT (e.g. docs). */
  allowComputedImports?: boolean;
  /** An esbuild module to use instead of `import("esbuild")`. */
  esbuild?: unknown;
}

export interface BuiltEntry {
  /** The entry's hashed URL. */
  url: string;
  /** Chunks it imports statically — preload these. */
  imports: string[];
  /** Chunks it may load on demand (dynamic import()). */
  dynamicImports: string[];
}

export interface BuiltFile {
  url: string;
  bytes: number;
  /** "sha384-…" of the file, usable as a Subresource Integrity value. */
  integrity: string;
}

export interface Manifest {
  version: 1;
  /** Identifies this exact set of files (a hash of every file's URL and integrity). */
  buildId: string;
  publicPath: string;
  /** Keyed by the entry point as given in BuildOptions.entryPoints. */
  entries: Record<string, BuiltEntry>;
  css: string | null;
  /** Every emitted file, sorted by URL. */
  files: BuiltFile[];
  /** Cache guidance: everything under publicPath is content-hashed, so it can be immutable. */
  cache: Array<{ path: string; cacheControl: string }>;
  /** What the bundled files themselves need from a CSP (inline scripts in your page are separate). */
  csp: { "script-src": string[]; "style-src": string[] };
}

export interface BuildResult extends Omit<Manifest, "css"> {
  css: { url: string; file: string } | null;
  /** Absolute paths. */
  outDir: string;
  assetsDir: string;
  manifestFile: string | null;
  /** esbuild's metafile, for reports (sizes, which chunk holds which module). */
  metafile: unknown;
  /** True if an earlier run had been interrupted mid-promotion and its previous build was restored first. */
  recovered: boolean;
}

/** Thrown for invalid options and failed builds; `problems` lists every one, with what to do. */
export class BuildError extends Error {
  readonly problems: string[];
}

/** "public, max-age=31536000, immutable" — for content-hashed files only. */
export const IMMUTABLE: string;

/**
 * Bundle and verify in a staging directory, then promote the assets and manifest together. A failed
 * build changes nothing live; a failed promotion restores the previous build.
 */
export function build(options: BuildOptions): Promise<BuildResult>;

/** The tags that load an entry: stylesheet, modulepreload for its static chunks, the module script. */
export function htmlTags(result: BuildResult | Manifest, options?: { entry?: string }): string[];

/** Remove a page's import map; returns the page without it and the parsed map (null if none). */
export function stripImportMap(html: string): { html: string; importMap: ImportMap | null };

export interface InlineScript {
  kind: "classic" | "module" | "importmap" | "data";
  /** Governed by CSP script-src (everything except data blocks such as JSON-LD). */
  executable: boolean;
  /** "'sha256-…'", ready for script-src. */
  hash: string;
  bytes: number;
}

/** A page's inline scripts (those without src), classified, with their CSP hashes. */
export function inlineScripts(html: string): InlineScript[];

/** CSP script-src hash sources for the page's executable inline scripts (unique, in order). */
export function scriptHashes(html: string): string[];
