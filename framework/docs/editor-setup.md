# Editor Setup

Zoijs is plain HTML, CSS, and JavaScript, so your editor already does most of the work —
there's no custom language, no JSX, and no build step to configure. This page adds the
nice-to-haves: **HTML highlighting inside `` html`` `` templates**, **IntelliSense and
optional type-checking** from the types every package ships, plus formatting and linting.
Everything here is optional and none of it adds a build step.

> **New app?** It's already set up. `npm create zoijs@latest my-app` scaffolds a
> `.vscode/extensions.json` (recommended extensions) and a `jsconfig.json` (IntelliSense)
> for you — open the folder in VS Code and accept the suggested extensions.

## Syntax highlighting for `` html`` `` templates

By default a tagged template literal is shown as a plain string. Because Zoijs's `html`
tag follows the same convention as `lit-html`, any editor that understands tagged-template
HTML will colour the markup inside it.

- **VS Code** — install **[lit-html](https://marketplace.visualstudio.com/items?itemName=bierner.lit-html)**
  (`bierner.lit-html`). It highlights the HTML inside `` html`` `` and nothing else; no Lit
  runtime is involved. (Scaffolded apps recommend it.)
- **Other editors** — any "embedded HTML in tagged templates" highlighter keyed on the
  `html` tag works (several exist for Neovim, JetBrains, etc.).

## IntelliSense and optional type-checking

Every Zoijs package ships TypeScript declarations (`.d.ts`), so you get **autocomplete,
hover documentation, and go-to-definition for plain JavaScript** — no `.ts` files, no
migration, no build.

A `jsconfig.json` turns this on for the whole project (scaffolded for you):

```jsonc
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "checkJs": false,   // ← flip to true to TYPE-CHECK your JS, not just autocomplete it
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

IntelliSense works with `checkJs` off. Turn it **on** (or add `// @ts-check` to a single
file) to type-check your JavaScript against Zoijs's types — catching a wrong argument or a
typo'd property — still with no compile step. Run it in CI with `tsc --noEmit`.

Prefer a stricter setup? The **`typescript` starter** (`npm create zoijs@latest my-app
--template typescript`) ships a `tsconfig.json` with `checkJs` on and an `npm run
typecheck` script — type-checked JavaScript, still no build.

## Formatting

**[Prettier](https://prettier.io)** formats `` html`` `` tagged templates out of the box —
it recognizes the `html` tag and pretty-prints the markup inside, along with the rest of
your code. Install the Prettier extension (recommended in scaffolded apps) or run
`npx prettier --write .`. No Zoijs-specific config needed.

## Linting

**[`@zoijs/eslint-plugin`](../../eslint-plugin/README.md)** catches the one reactivity
footgun — a reactive read that isn't wrapped in `() =>` (auto-fixable) — plus a few common
accessibility mistakes. Install `eslint` and the plugin, extend `recommended`, and add the
**ESLint** VS Code extension (`dbaeumer.vscode-eslint`, recommended in scaffolded apps) to
see findings as you type.

## Recommended VS Code extensions

These are the three a scaffolded app suggests (in `.vscode/extensions.json`):

| Extension | What it gives you |
|---|---|
| `bierner.lit-html` | HTML highlighting inside `` html`` `` templates |
| `dbaeumer.vscode-eslint` | runs `@zoijs/eslint-plugin` in the editor |
| `esbenp.prettier-vscode` | formats your code and `` html`` `` markup |

All three are third-party, general-purpose tools — Zoijs ships **no** editor extension or
language-service plugin of its own, by design. The framework stays plain web; the editor
experience comes from the platform's own tooling plus the types Zoijs already ships.
