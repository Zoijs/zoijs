// Rasterizes assets/favicon.svg into the PNG/ICO fallbacks browsers need.
// Run from assets/: npm install && node build-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(here, "favicon.svg"));

const NAVY = { r: 8, g: 18, b: 38, alpha: 1 }; // matches gradient bottom #081226

async function png(size, { flatten = false } = {}) {
  let pipe = sharp(svg, { density: 384 }).resize(size, size);
  if (flatten) pipe = pipe.flatten({ background: NAVY });
  return pipe.png().toBuffer();
}

async function main() {
  const sizes = [16, 32, 48, 180, 512];
  const out = {};
  for (const s of sizes) out[s] = await png(s, { flatten: s >= 180 });

  writeFileSync(join(here, "favicon-16.png"), out[16]);
  writeFileSync(join(here, "favicon-32.png"), out[32]);
  writeFileSync(join(here, "favicon-48.png"), out[48]);
  writeFileSync(join(here, "apple-touch-icon.png"), out[180]); // iOS: flattened, no transparency
  writeFileSync(join(here, "icon-512.png"), out[512]);

  const ico = await pngToIco([out[16], out[32], out[48]]);
  writeFileSync(join(here, "favicon.ico"), ico);

  console.log("Wrote: favicon-16/32/48.png, apple-touch-icon.png, icon-512.png, favicon.ico");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
