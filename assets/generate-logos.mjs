// Generates the Zoijs logo lockups and social card with the wordmark converted
// to real vector outlines (Poppins, OFL) — no font dependency at render time.
// Run from assets/:  node generate-logos.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import opentype from "opentype.js";

const here = dirname(fileURLToPath(import.meta.url));
const fontPath = (p) => join(here, "node_modules/@expo-google-fonts/poppins", p);
const loadFont = (p) => {
  const buf = readFileSync(fontPath(p));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const bold = loadFont("700Bold/Poppins_700Bold.ttf");
const reg = loadFont("400Regular/Poppins_400Regular.ttf");
const med = loadFont("500Medium/Poppins_500Medium.ttf");

// Lay out a string glyph-by-glyph; return one path per glyph + total width.
function layout(font, text, x, y, fontSize, tracking = 0) {
  const scale = fontSize / font.unitsPerEm;
  let penX = x;
  const items = [];
  for (const g of font.stringToGlyphs(text)) {
    items.push(g.getPath(penX, y, fontSize).toPathData(2));
    penX += g.advanceWidth * scale + tracking;
  }
  return { items, width: penX - x - tracking };
}

// Wordmark "zoijs" with the "j" (index 3) in an accent colour.
function wordmark(x, y, fontSize, mainFill, accentFill, tracking = -1.5) {
  const { items, width } = layout(bold, "zoijs", x, y, fontSize, tracking);
  const main = items.filter((_, i) => i !== 3).join(" ");
  const accent = items[3];
  return {
    width,
    svg:
      `<path d="${main}" fill="${mainFill}"/>\n` +
      `  <path d="${accent}" fill="${accentFill}"/>`,
  };
}

function line(font, text, x, y, fontSize, fill, tracking = 0) {
  const { items } = layout(font, text, x, y, fontSize, tracking);
  return `<path d="${items.join(" ")}" fill="${fill}"/>`;
}

const GRADS = `<linearGradient id="bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0e2a4d"/><stop offset="1" stop-color="#081226"/></linearGradient>
    <linearGradient id="zblue" x1="20" y1="18" x2="44" y2="46" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5cc8ff"/><stop offset="1" stop-color="#2f8fe6"/></linearGradient>`;

const MARK = `<circle cx="32" cy="32" r="32" fill="url(#bg)"/>
    <circle cx="32" cy="32" r="26" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-dasharray="30 11.3" transform="rotate(-58 32 32)"/>
    <polygon fill="url(#zblue)" points="21,18 43,18 43,24 32,40 43,40 43,46 21,46 21,40 32,24 21,24"/>
    <g fill="#dff1ff"><circle cx="21" cy="18" r="2.4"/><circle cx="43" cy="18" r="2.4"/><circle cx="32" cy="32" r="2.4"/><circle cx="21" cy="46" r="2.4"/><circle cx="43" cy="46" r="2.4"/></g>`;

// ---- horizontal lockups -------------------------------------------------
function lockup(mainFill, accentFill) {
  const wmX = 140,
    wmY = 96,
    size = 70;
  const wm = wordmark(wmX, wmY, size, mainFill, accentFill);
  const w = Math.round(wmX + wm.width + 26);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 140" width="${w}" height="140" role="img" aria-label="Zoijs">
  <title>Zoijs</title>
  <defs>
    ${GRADS}
  </defs>
  <g transform="translate(20 22) scale(1.5)">
    ${MARK}
  </g>
  ${wm.svg}
</svg>
`;
}

writeFileSync(join(here, "logo.svg"), lockup("#0b1b34", "#2f8fe6"));
writeFileSync(join(here, "logo-dark.svg"), lockup("#eaf2ff", "#5cc8ff"));

// ---- social card (1280x640) --------------------------------------------
const wmCard = wordmark(470, 300, 120, "#eaf2ff", "#5cc8ff", -2.5);
const card = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 640" width="1280" height="640" role="img" aria-label="Zoijs — a beginner-friendly, no-build frontend framework">
  <title>Zoijs</title>
  <defs>
    <linearGradient id="page" x1="0" y1="0" x2="1280" y2="640" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0b1f3a"/><stop offset="1" stop-color="#050b18"/></linearGradient>
    ${GRADS}
  </defs>
  <rect width="1280" height="640" fill="url(#page)"/>
  <g transform="translate(120 188) scale(4)" opacity="0.2">
    ${MARK}
  </g>
  <g transform="translate(135 203) scale(3.6)">
    ${MARK}
  </g>
  ${wmCard.svg}
  ${line(reg, "A frontend framework you don’t", 474, 366, 40, "#9db4d6")}
  ${line(reg, "have to learn before you use it.", 474, 418, 40, "#9db4d6")}
  ${line(med, "No JSX · No build step · No Virtual DOM", 474, 498, 30, "#f59e0b")}
</svg>
`;
writeFileSync(join(here, "social-card.svg"), card);

console.log("Wrote logo.svg, logo-dark.svg, social-card.svg (wordmark widths:",
  Math.round(wordmark(0, 0, 70, "#000", "#000").width), "/ card",
  Math.round(wmCard.width), ")");
