# Zoijs brand assets

The Zoijs mark: a blue gradient **Z** (its vertices drawn as reactive-graph nodes)
inside a broken orange accent ring on a deep-navy circle.

## Files

| File | Use |
|---|---|
| `favicon.svg` | Primary favicon — modern browsers use this directly |
| `favicon.ico` | Fallback favicon (16/32/48) for older browsers |
| `favicon-16.png` `favicon-32.png` `favicon-48.png` | Individual PNG fallbacks |
| `apple-touch-icon.png` | 180×180, flattened on navy (iOS adds its own rounding) |
| `icon-512.png` | PWA / large icon, app stores, README hero |
| `logo.svg` | Horizontal lockup (mark + wordmark) for **light** backgrounds |
| `logo-dark.svg` | Horizontal lockup for **dark** backgrounds |
| `social-card.svg` | 1280×640 Open Graph / GitHub social card |

> The wordmark in the logo/social SVGs is **real vector outlines** (Poppins, OFL),
> not live text — so it renders pixel-identically everywhere with no font
> dependency. Regenerate it with `npm run build:logos` (see below).

## Embed (favicon)

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

For GitHub/Twitter/OG previews, export `social-card.svg` to PNG and reference it:

```html
<meta property="og:image" content="https://zoijs.dev/og/zoijs-og.png" />
```

## Rebuilding

```bash
cd assets
npm install
npm run build        # logos + icons
npm run build:logos  # logo.svg, logo-dark.svg, social-card.svg (vector wordmark)
npm run build:icons  # PNG/ICO fallbacks from favicon.svg
```

- `generate-logos.mjs` (opentype.js + Poppins) converts the `zoijs` wordmark to
  outlines and writes the two lockups and the social card. Tweak placement/colours
  there, then re-run.
- `build-icons.mjs` (sharp + png-to-ico) rasterizes `favicon.svg` into every PNG
  size and the `.ico`. Edit `favicon.svg` and re-run.

`node_modules/` here is local tooling only and is gitignored.
