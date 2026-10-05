# Editor Setup

Zoijs is plain HTML, CSS, and JavaScript, so your editor already does most of the work —
there's no custom language, no JSX, and no build step to configure. This page covers the
two things Zoijs itself provides: **autocomplete and optional type-checking** from the
types every package ships, and **linting** with the first-party ESLint plugin. Everything
here is optional and none of it adds a build step.

> **New app?** It's already set up. `npm create zoijs@latest my-app` scaffolds a
> `jsconfig.json` for you.

## Autocomplete and optional type-checking

Every Zoijs package ships TypeScript declarations (`.d.ts`), so any editor that reads
them gives you **autocomplete, hover documentation, and go-to-definition for plain
JavaScript** — no `.ts` files, no migration, no build.

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

Autocomplete works with `checkJs` off. Turn it **on** (or add `// @ts-check` to a single
file) to type-check your JavaScript against Zoijs's types — catching a wrong argument or a
typo'd property — still with no compile step. Run it in CI with `tsc --noEmit`.

Prefer a stricter setup? The **`typescript` starter** (`npm create zoijs@latest my-app
--template typescript`) ships a `tsconfig.json` with `checkJs` on and an `npm run
typecheck` script — type-checked JavaScript, still no build.

## Linting

**[`@zoijs/eslint-plugin`](../../eslint-plugin/README.md)** catches the one reactivity
footgun — a reactive read that isn't wrapped in `() =>` (auto-fixable) — plus a few common
accessibility and security mistakes. Install `eslint` and the plugin, extend
`recommended`, and run it from the command line or in CI:

```bash
npx eslint .
```

Zoijs ships **no** editor extension or language-service plugin, by design. The framework
stays plain web: the types it already ships and the command-line tools above work the same
in any editor.
