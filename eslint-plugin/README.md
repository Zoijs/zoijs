# @zoijs/eslint-plugin

ESLint rules for [Zoijs](https://zoijs.dev) — catch the one reactivity footgun
before it ships. Zero dependencies, no build step.

Zoijs has a single rule you have to learn: **setup runs once, so wrap a reactive
read in an arrow function** when it should update the DOM.

```js
${() => count.get()}   // live — updates when count changes
${count.get()}         // static — read once during setup, never updates
```

The static form is silent: there is no runtime error, the page just sits there
with a stale value. This plugin flags it at author time and auto-fixes it.

## Install

```sh
npm install -D eslint @zoijs/eslint-plugin
```

Requires ESLint 8 or 9.

## Usage — flat config (ESLint 9+, recommended)

In `eslint.config.js`:

```js
import zoijs from "@zoijs/eslint-plugin";

export default [
  zoijs.configs.recommended,
];
```

That enables `zoijs/require-reactive-binding` as an error. To wire it up by hand
instead:

```js
import zoijs from "@zoijs/eslint-plugin";

export default [
  {
    plugins: { zoijs },
    rules: { "zoijs/require-reactive-binding": "error" },
  },
];
```

## Usage — legacy config (`.eslintrc`)

```json
{
  "extends": ["plugin:@zoijs/legacy-recommended"]
}
```

or rule-by-rule:

```json
{
  "plugins": ["@zoijs"],
  "rules": { "@zoijs/require-reactive-binding": "error" }
}
```

## Rules

### `require-reactive-binding`

Requires a reactive read inside an `html` template to be wrapped in an arrow
function, so the binding updates. **Auto-fixable** — `eslint --fix` wraps the
interpolation in `() => …` for you.

```js
// ✗ flagged — read once, never updates
html`<h1>${user.get().name}</h1>`

// ✓ fixed — live binding
html`<h1>${() => user.get().name}</h1>`
```

The rule is deliberately narrow, so false positives are rare:

- Only interpolations of an **`html` tagged template** are inspected.
- Only a **zero-argument `.get()`** counts — that is Zoijs's reactive-read shape.
  `map.get(key)` and `params.get("id")` take an argument and are left alone.
- A `.get()` reached **through a nested function** — an event handler, an
  `each` / `effect` / `computed` callback, or a `${() => …}` binding — is fine.
  The function defers the read, so it stays reactive; the rule never descends
  into one.
- **`.peek()` is never flagged.** It is Zoijs's sanctioned non-subscribing read —
  reach for it when a one-time read is exactly what you mean.

```js
html`<p>${count.peek()}</p>`                       // ✓ intentional one-time read
html`<button onclick=${() => save(count.get())}>` // ✓ deferred in a handler
html`<p>${params.get("id")}</p>`                   // ✓ not a reactive read
```

> The plugin matches the literal tag name `html`. If you alias or namespace it
> (`lit.html`, `const h = html`), the rule won't recognize those calls.

## Why a plugin and not a core feature

Linting is a build-time concern; the Zoijs core stays runtime-only and
dependency-free. This package lives beside the core and never touches it — it
just reads your code and points at the one mistake that has no runtime signal.
