# Zoijs Documentation

Welcome to **Zoijs** — a frontend framework you don't have to learn before you use it. It's plain **HTML, CSS, and JavaScript**: no JSX, no build step, no Virtual DOM, and an eight-function API.

**[zoijs.dev](https://zoijs.dev)** · **[GitHub](https://github.com/Zoijs)** · **[npm](https://www.npmjs.com/package/@zoijs/core)**

```bash
npm install @zoijs/core
```

> **Goal of these docs:** get you productive in **under 30 minutes.**

## 30-minute learning path

Follow these in order. Each builds on the last.

1. **[Installation](installation.md)** — run Zoijs with a single `<script>` (2 min)
2. **[Your First App](first-app.md)** — a working counter (5 min)
3. **[Core Concepts](concepts/core-concepts.md)** — the one rule that matters (5 min)
4. **[State](concepts/state.md)** → **[Bindings](concepts/bindings.md)** → **[Events](concepts/events.md)** (8 min)
5. **[Computed values](concepts/computed.md)** and **[Lists with `each()`](concepts/lists.md)** (8 min)
6. **[Cleanup](concepts/cleanup.md)** and **[Production mode](concepts/production-mode.md)** (2 min)

When you're stuck: **[Troubleshooting](troubleshooting.md)** · **[FAQ](faq.md)**

## Sections

### Getting started
- [Installation](installation.md)
- [Your First App](first-app.md)

### Core concepts
- [Core Concepts](concepts/core-concepts.md) — the mental model
- [State](concepts/state.md) — `createState`
- [Computed](concepts/computed.md) — derived values
- [Bindings](concepts/bindings.md) — text & attributes
- [Events](concepts/events.md) — `onclick` and friends
- [Lists with `each()`](concepts/lists.md) — keyed rendering
- [Cleanup](concepts/cleanup.md) — `unmount` and ownership
- [Production mode](concepts/production-mode.md) — `configure`

### Tutorials (build something)
- [Counter](tutorials/counter.md)
- [Todo list](tutorials/todo.md)
- [Live input](tutorials/live-input.md)
- [Full-name (computed)](tutorials/full-name.md)
- [Reorderable list](tutorials/reorder.md)

### Reference & help
- [API Reference](api-reference.md)
- [Security](security.md) — safe rendering rules & CSP
- [Examples index](examples.md)
- [Troubleshooting](troubleshooting.md)
- [FAQ](faq.md)

### Optional packages
- [`@zoijs/router`](../../router/README.md) — a tiny client-side router for SPAs (routes are a plain object; not part of the core)
- [`@zoijs/resource`](../../resource/README.md) — the simplest async-data helper: reactive `loading` / `data` / `error` / `refresh`
- [`@zoijs/head`](../../head/README.md) — set the document title and meta description from a component
- [`@zoijs/action`](../../action/README.md) — the write-side companion to resource: reactive `pending` / `error` / `done` for submits
- [**Ecosystem guide**](ecosystem.md) — how the optional packages fit together, with one demo app (Task Board) that uses all of them
- [**Deployment**](deployment.md) — ship a Zoijs app to GitHub Pages, Netlify, Vercel, Cloudflare, Nginx, or Apache (incl. router `base` + SPA fallback)
  - [Recipe: Deploy the Task Board to GitHub Pages](recipes/deploy-task-board-github-pages.md) — concrete, copy-paste walkthrough

### Coming from another framework?
- [From vanilla JavaScript](migration/from-vanilla.md)
- [From React](migration/from-react.md)
- [From Vue](migration/from-vue.md)
- [From Solid](migration/from-solid.md)
- [From Lit](migration/from-lit.md)

## What makes Zoijs different

- **No JSX** — write real HTML in template literals.
- **No required build step** — a `<script type="module">` is the whole toolchain.
- **Native HTML/CSS/JS** — concepts you already know; nothing bespoke to memorize.
- **Beginner-friendly mental model** — write a function that returns `html`, put state in it, `mount` it.
- **Secure by default** — text is escaped, dangerous URLs are blocked, no `eval`.
- **Small API** — eight functions: `html`, `mount`, `createState`, `computed`, `each`, `effect`, `configure`, `onCleanup`.

Ready? Start with **[Installation »](installation.md)**
