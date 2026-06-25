<div align="center">

# create-zoijs

**Create a new [Zoijs](https://zoijs.dev) app with one command.** Plain HTML, CSS, and JavaScript — no build step.

[![npm](https://img.shields.io/npm/v/create-zoijs.svg)](https://www.npmjs.com/package/create-zoijs)
[![license](https://img.shields.io/npm/l/create-zoijs.svg)](LICENSE)

</div>

---

## Usage

```bash
npm create zoijs@latest my-app
cd my-app
npm install
npm run dev
```

Or with `npx`:

```bash
npx create-zoijs my-app
```

> **A note on the name.** npm maps `npm create zoijs` to the package
> `create-zoijs` (that's npm's convention for `npm create <name>`), which is why
> this package is `create-zoijs` rather than `@zoijs/create`.

## Naming your app

The folder name you pass becomes the project name:

```bash
npm create zoijs@latest task-manager
```

produces a `package.json` with `"name": "task-manager"` and an `index.html`
with `<title>Task Manager</title>`. If you don't pass a name, the CLI asks for
one.

## Templates

```bash
npm create zoijs@latest my-app                    # default: the "app" template
npm create zoijs@latest my-app --template basic   # a minimal counter
npm create zoijs@latest my-app --template app     # a small task dashboard
```

- **`app`** (default) — a small task dashboard showing `html`, `mount`,
  `createState`, `computed`, `each`, and parent⇄child component communication.
- **`basic`** — a minimal counter, the smallest possible Zoijs app.

## What it does

- Copies a template, fills in the app name, and prints the next three commands.
- Validates the name (npm-safe) and won't overwrite a non-empty folder.

## What it does **not** do

By design, to keep Zoijs simple: no build system, no bundler, no compiler, no
JSX transform, no code generation, no plugin system, no template DSL, and no
complex prompts. The generated app is plain files you can read.

## You don't need this tool

Zoijs works without the CLI — it's only a convenience. You can create an app by
hand with an import map and a `<script type="module">`, or with
`npm install @zoijs/core`. See the [Start guide](https://zoijs.dev/start).

## License

[MIT](LICENSE) © Zoijs contributors
