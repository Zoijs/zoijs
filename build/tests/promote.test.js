// Promotion and recovery (src/promote.js): the live assets + manifest are replaced as a pair, a
// failure at any step restores the previous pair, and an interrupted promotion is undone next run.

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { build } from "../src/index.js";
import { promote, recover } from "../src/promote.js";
import { project, read, snapshot, sri, APP_FILES } from "./helpers.js";

/** A dist/ with a live build ("old") and a staged one ("new"). */
function scene(t) {
  const root = project(t, { "x.txt": "" });
  const dist = join(root, "dist");
  for (const [dir, tag] of [["assets", "old"], ["assets.staging-1", "new"]]) {
    mkdirSync(join(dist, dir), { recursive: true });
    writeFileSync(join(dist, dir, `${tag}.js`), tag);
  }
  writeFileSync(join(dist, "asset-manifest.json"), '{"build":"old"}');
  return { dist, args: { staging: join(dist, "assets.staging-1"), assets: join(dist, "assets"), manifestFile: join(dist, "asset-manifest.json"), manifestText: '{"build":"new"}', id: "1" } };
}
const OLD = { "asset-manifest.json": '{"build":"old"}', "assets/old.js": "old" };
const NEW = { "asset-manifest.json": '{"build":"new"}', "assets/new.js": "new" };

test("promote: the staged build and its manifest replace the live pair; the previous one is retired", async (t) => {
  const { dist, args } = scene(t);
  await promote(args);
  assert.deepEqual(snapshot(dist), NEW, "no previous-/discard-/next- leftovers");
});

test("promote: keepPrevious keeps the replaced pair at <assets>.prev (one generation)", async (t) => {
  const { dist, args } = scene(t);
  await promote({ ...args, keepPrevious: true });
  assert.deepEqual(snapshot(dist), { ...NEW, "assets.prev/assets/old.js": "old", "assets.prev/manifest.json": '{"build":"old"}' });
});

// Fail each filesystem step of promotion in turn: the live pair must always be the old one after.
for (const [step, failOn] of [
  ["writing the new manifest", (op, a) => op === "writeFile"],
  ["creating the previous- directory", (op) => op === "mkdir"],
  ["moving the live assets aside", (op, a) => op === "rename" && /[\\/]assets$/.test(a[0])],
  ["moving the live manifest aside", (op, a) => op === "rename" && a[0].endsWith("asset-manifest.json")],
  ["installing the staged assets", (op, a) => op === "rename" && a[0].includes(".staging-")],
  ["installing the new manifest", (op, a) => op === "rename" && a[0].includes(".next-")],
]) {
  test(`promote: a failure ${step} restores the previous build`, async (t) => {
    const { dist, args } = scene(t);
    const faulty = new Proxy(fs, {
      get: (target, op) => (...a) => (failOn(op, a) ? Promise.reject(Object.assign(new Error(`injected ${op}`), { code: "EIO" })) : target[op](...a)),
    });
    await assert.rejects(promote(args, faulty), /injected/);
    assert.deepEqual(snapshot(dist), OLD, "the old pair is live again; nothing staged or temporary left");
  });
}

test("recover: an interrupted promotion (previous- left behind) is undone; stale leftovers are removed", async (t) => {
  const { dist, args } = scene(t);
  // Simulate a crash right after the new assets went live, before the new manifest did.
  mkdirSync(join(dist, "assets.previous-9"));
  await fs.rename(join(dist, "assets"), join(dist, "assets.previous-9/assets"));
  await fs.rename(join(dist, "asset-manifest.json"), join(dist, "assets.previous-9/manifest.json"));
  await fs.rename(args.staging, join(dist, "assets"));
  writeFileSync(join(dist, "asset-manifest.json.next-9"), '{"build":"new"}');
  mkdirSync(join(dist, "assets.discard-8"));
  mkdirSync(join(dist, "assets.staging-7"));
  assert.equal(await recover(args.assets, args.manifestFile), true);
  assert.deepEqual(snapshot(dist), OLD, "the last good pair is back; the half-promoted one and leftovers are gone");
  assert.equal(await recover(args.assets, args.manifestFile), false, "nothing to recover the second time");
});

test("build(): recovers an interrupted promotion before building, and reports it", async (t) => {
  const root = project(t);
  const first = await build({ root, entryPoints: ["src/main.js"], outDir: "dist" });
  assert.equal(first.recovered, false);
  // Crash mid-promotion of some later build: the good build sits in previous-, junk is live.
  const dist = join(root, "dist");
  mkdirSync(join(dist, "assets.previous-0"));
  await fs.rename(join(dist, "assets"), join(dist, "assets.previous-0/assets"));
  await fs.rename(join(dist, "asset-manifest.json"), join(dist, "assets.previous-0/manifest.json"));
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "assets/half.js"), "half");
  const again = await build({ root, entryPoints: ["src/main.js"], outDir: "dist" });
  assert.equal(again.recovered, true);
  assert.deepEqual(readdirSync(dist).sort(), ["asset-manifest.json", "assets"]);
  assert.ok(!readdirSync(join(dist, "assets")).includes("half.js"));
});

test("buildId: the manifest identifies exactly the files in assets/", async (t) => {
  const root = project(t);
  const r = await build({ root, entryPoints: ["src/main.js"], outDir: "dist" });
  const m = JSON.parse(read(root, "dist/asset-manifest.json"));
  assert.equal(m.buildId, r.buildId);
  for (const f of m.files) assert.equal(sri(read(root, "dist" + f.url)), f.integrity, f.url);
  writeFileSync(join(root, "src/main.js"), APP_FILES["src/main.js"] + "console.log(3);\n");
  const r2 = await build({ root, entryPoints: ["src/main.js"], outDir: "dist" });
  assert.notEqual(r2.buildId, r.buildId);
  await assert.rejects(build({ root, entryPoints: ["src/main.js"], outDir: "dist", manifest: "assets/m.json" }), /manifest: .* outside assetsDir/);
});
