// Promotion: replace the live assets directory and its manifest with a verified build, without ever
// leaving a broken or mismatched pair behind. Internal (not exported from the package); build() uses it.
//
// Beside <assets> (all renames stay in one directory, so they're atomic):
//   <assets>.staging-<id>    a build being made; never live
//   <assets>.previous-<id>   the last good build (its assets + manifest) while it's being replaced.
//                            Existing only during promotion — finding one means a promotion didn't
//                            finish, and recover() puts it back.
//   <assets>.discard-<id>    a retired build being deleted (safe to delete whatever is left)
//   <assets>.prev            the previous build, kept on request (keepPrevious)
//   <manifest>.next-<id>     the new manifest, written before anything moves

import { existsSync } from "node:fs";
import * as nodeFs from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/**
 * Undo an interrupted promotion (restore the last good build) and remove leftovers of interrupted
 * runs. Returns true if a build was restored.
 */
export async function recover(assets, manifestFile, fs = nodeFs) {
  const dir = dirname(assets);
  const base = basename(assets);
  if (!existsSync(dir)) return false;
  let restored = false;
  for (const name of (await fs.readdir(dir)).sort()) {
    const p = join(dir, name);
    if (name.startsWith(`${base}.staging-`) || name.startsWith(`${base}.discard-`)) await fs.rm(p, { recursive: true, force: true });
    else if (name.startsWith(`${base}.previous-`)) {
      // The previous pair is intact (it's only ever deleted after being renamed to discard-).
      await fs.rm(assets, { recursive: true, force: true });
      if (manifestFile) await fs.rm(manifestFile, { force: true });
      if (existsSync(join(p, "assets"))) await fs.rename(join(p, "assets"), assets);
      if (manifestFile && existsSync(join(p, "manifest.json"))) await fs.rename(join(p, "manifest.json"), manifestFile);
      await fs.rm(p, { recursive: true, force: true });
      restored = true;
    }
  }
  if (manifestFile && existsSync(dirname(manifestFile))) {
    for (const name of await fs.readdir(dirname(manifestFile))) {
      if (name.startsWith(`${basename(manifestFile)}.next-`)) await fs.rm(join(dirname(manifestFile), name), { force: true });
    }
  }
  return restored;
}

/**
 * Make `staging` the live `assets` and `manifestText` the live manifest. On any failure the previous
 * build (assets and manifest) is restored and the error rethrown; on success the previous build is
 * removed, or kept at <assets>.prev with keepPrevious.
 */
export async function promote({ staging, assets, manifestFile, manifestText, id, keepPrevious = false }, fs = nodeFs) {
  const previous = `${assets}.previous-${id}`;
  const nextManifest = manifestFile ? `${manifestFile}.next-${id}` : null;
  const done = { previous: false, oldAssets: false, oldManifest: false, newAssets: false, newManifest: false };
  try {
    if (nextManifest) await fs.writeFile(nextManifest, manifestText);
    await fs.mkdir(previous);
    done.previous = true;
    if (existsSync(assets)) {
      await fs.rename(assets, join(previous, "assets"));
      done.oldAssets = true;
    }
    if (manifestFile && existsSync(manifestFile)) {
      await fs.rename(manifestFile, join(previous, "manifest.json"));
      done.oldManifest = true;
    }
    await fs.rename(staging, assets);
    done.newAssets = true;
    if (nextManifest) {
      await fs.rename(nextManifest, manifestFile);
      done.newManifest = true;
    }
  } catch (err) {
    // Roll back, newest step first. Each step is attempted even if an earlier one fails, so as much
    // as possible is restored; what can't be is left in <assets>.previous-<id> for recover().
    const attempt = async (fn) => {
      try {
        await fn();
      } catch {
        /* keep going */
      }
    };
    if (done.newManifest) await attempt(() => fs.rm(manifestFile, { force: true }));
    if (done.newAssets) await attempt(() => fs.rename(assets, staging));
    if (done.oldAssets) await attempt(() => fs.rename(join(previous, "assets"), assets));
    if (done.oldManifest) await attempt(() => fs.rename(join(previous, "manifest.json"), manifestFile));
    if (done.previous) await attempt(() => fs.rm(previous, { recursive: true }));
    await attempt(() => fs.rm(staging, { recursive: true, force: true }));
    if (nextManifest) await attempt(() => fs.rm(nextManifest, { force: true }));
    throw err;
  }
  // Retire the previous build: rename first, so an interrupted delete is never mistaken for a
  // promotion to undo.
  if (keepPrevious) {
    await fs.rm(`${assets}.prev`, { recursive: true, force: true });
    await fs.rename(previous, `${assets}.prev`);
  } else {
    const discard = `${assets}.discard-${id}`;
    await fs.rename(previous, discard);
    await fs.rm(discard, { recursive: true, force: true });
  }
}
